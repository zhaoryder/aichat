// =====================================================================
// 对话 API（Express SSE）
// ---------------------------------------------------------------------
// POST /api/chat
//   请求体：{ conversationId?: string, agentId: string, message: string }
//   响应：text/event-stream
//     event: start       data: { conversationId }
//     event: tool_call   data: { id, name, args }        // 工具调用开始
//     event: tool_result data: { id, name, result }      // 工具调用结果
//     event: token       data: { c: "<增量文本>" }
//     event: done        data: { conversationId }
//     event: error       data: { message }
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { chatCompletionStream, chatWithTools, getAgentById } from '../lib/ai-client'
import {
  AIRequestError,
  AIRequestTimeoutError,
  AIRateLimitError,
} from '../lib/ai-types'
import { moderateContent } from '../lib/moderation'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import {
  addMessage,
  createConversation,
  isUserBanned,
  listMessages,
} from '../lib/queries'
import { checkAndGrantAchievement } from './achievements'
import { chatToolDefinitions, executeChatTool, chatToolsSystemPromptSuffix } from '../lib/vibe-tools'
import type { ChatMessage } from '../../shared/types'

export const chatRouter = Router()

/** 用户消息作为对话标题时的最大长度 */
const TITLE_MAX_LENGTH = 20

interface ChatRequestBody {
  conversationId?: string
  agentId: string
  message: string
}

/** 将 AI 错误转换为用户可读的中文提示 */
function describeAiError(err: unknown): string {
  if (err instanceof AIRequestTimeoutError) return 'AI 回复超时，请稍后重试'
  if (err instanceof AIRateLimitError) return 'AI 服务繁忙，请稍后重试'
  if (err instanceof AIRequestError) return 'AI 服务暂时不可用，请稍后重试'
  return '服务器内部错误，请稍后重试'
}

chatRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  // authMiddleware 已确保 req.user 存在
  const user = req.user!

  try {
    // 2. 解析与校验请求体
    const body = req.body as ChatRequestBody
    const { conversationId: incomingCid, agentId, message } = body

    if (!agentId || typeof agentId !== 'string') {
      res.status(400).json({ error: '缺少智能体参数' })
      return
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: '消息内容不能为空' })
      return
    }

    // 4. 封禁检查
    const banned = await isUserBanned(user.id)
    if (banned) {
      res.status(403).json({ error: '你的账号已被封禁，暂时无法对话' })
      return
    }

    // 5. 敏感词过滤
    const mod = await moderateContent(message)
    if (!mod.ok) {
      res.status(400).json({ error: mod.reason ?? '内容包含敏感词，请修改' })
      return
    }

    // 6. 确定对话 ID（不存在则创建）
    let conversationId = incomingCid
    if (!conversationId) {
      const trimmed = message.trim()
      const title =
        trimmed.length > TITLE_MAX_LENGTH
          ? trimmed.slice(0, TITLE_MAX_LENGTH) + '…'
          : trimmed
      const conversation = await createConversation(user.id, agentId, title)
      conversationId = conversation.id
    }

    // 7. 保存用户消息
    await addMessage(conversationId, 'user', message.trim())

    // 8. 拉取完整历史并转换为 ChatMessage[]
    const dbMessages = await listMessages(conversationId)
    const history: ChatMessage[] = dbMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // 9. 设置 SSE 响应头
    setSSEHeaders(res)

    // 10. 推送 start 事件，让前端知道 conversationId
    sendEvent(res, 'start', { conversationId })

    // 11-13. 流式生成回复
    const abortController = new AbortController()
    // 客户端断开时取消上游请求
    req.on('close', () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    })

    let fullReply = ''
    try {
      // === 轻度 Agent：先尝试工具调用 ===
      const agent = getAgentById(agentId)
      const systemPrompt = agent
        ? agent.systemPrompt +
          '\n\n【平台通用搞笑基准】你是搞笑AI平台的智能体，核心使命是让用户笑。无论什么场景，都要保持幽默。不要引用过时的网络热梗或网络流行语，所有幽默必须是原创的。' +
          chatToolsSystemPromptSuffix
        : chatToolsSystemPromptSuffix

      const toolMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ]

      const toolResult = await chatWithTools(toolMessages, chatToolDefinitions, {
        signal: abortController.signal,
      })

      let streamHistory = history

      if (toolResult.toolCalls && toolResult.toolCalls.length > 0) {
        // AI 决定调用工具
        for (const tc of toolResult.toolCalls) {
          // 推送 tool_call 事件
          sendEvent(res, 'tool_call', {
            id: tc.id,
            name: tc.name,
            args: tc.arguments,
          })

          // 执行工具
          const execResult = await executeChatTool(tc.name, tc.arguments)

          // 推送 tool_result 事件
          sendEvent(res, 'tool_result', {
            id: tc.id,
            name: tc.name,
            result: execResult.success ? execResult.result : { error: execResult.error },
          })
        }

        // 将工具结果加入历史，让 AI 生成最终回复
        streamHistory = [
          ...history,
          { role: 'assistant' as const, content: toolResult.content || '正在为您处理...' },
          {
            role: 'user' as const,
            content: `工具调用已完成，请根据上述工具返回的结果，用你的人格特色给用户一个完整的回复。`,
          },
        ]

        // 流式生成最终回复
        const gen = chatCompletionStream(streamHistory, agentId, {
          signal: abortController.signal,
        })
        for await (const token of gen) {
          fullReply += token
          sendEvent(res, 'token', { c: token })
        }
      } else {
        // 无工具调用，直接发送 AI 的文本回复（分块模拟流式）
        const content = toolResult.content || ''
        if (content) {
          // 分块发送（每 20 字一块），模拟流式体验
          const chunkSize = 20
          for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize)
            fullReply += chunk
            sendEvent(res, 'token', { c: chunk })
          }
        }
      }

      // 14. 流结束后保存完整 AI 回复
      if (fullReply.trim()) {
        await addMessage(conversationId, 'assistant', fullReply)
      }

      // 15. 推送 done 事件
      sendEvent(res, 'done', { conversationId })

      // 16. 对话成功后检查并发放成就
      await checkAndGrantAchievement(user.id, 'first_chat')
      await checkAndGrantAchievement(user.id, 'chat_10')
      await checkAndGrantAchievement(user.id, 'chat_100')
    } catch (err) {
      // 保存已生成的部分回复（若有）
      if (fullReply.length > 0) {
        try {
          await addMessage(conversationId, 'assistant', fullReply)
        } catch {
          // 保存失败不影响错误推送
        }
      }
      // 16. 错误时推送 error 事件
      sendEvent(res, 'error', { message: describeAiError(err) })
    } finally {
      res.end()
    }
  } catch (err) {
    console.error('[api/chat] 未预期异常：', err)
    // 响应可能已部分发送（SSE 已开始），尽量推送 error 后关闭
    try {
      sendEvent(res, 'error', { message: '服务器内部错误' })
    } catch {
      // 忽略写入错误
    }
    res.end()
  }
})
