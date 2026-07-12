// =====================================================================
// Vibe Coding Agent API
// ---------------------------------------------------------------------
// 用户用自然语言描述需求 → AI 生成可运行 HTML 代码 → 浏览器内即时预览。
//   POST /api/vibe-code/generate      SSE 流式生成代码
//   POST /api/vibe-code/fix           SSE 流式修复代码
//   GET  /api/vibe-code/projects      列出用户项目
//   GET  /api/vibe-code/projects/:id  获取项目详情
//   POST /api/vibe-code/save          保存项目
//   GET  /api/vibe-code/explore       公开广场
// =====================================================================

import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { authMiddleware } from '../middleware/auth'
import {
  chatCompletionStreamWithSystemPrompt,
  chatWithTools,
  type ToolDefinition,
} from '../lib/ai-client'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import type { ChatMessage } from '../../shared/types'

export const vibeCodeRouter = Router()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

/** vibe coding agent 的系统提示词（不注入搞笑基准，输出纯净代码） */
const VIBE_CODE_SYSTEM_PROMPT = `你是一个 vibe coding agent。用户会用自然语言描述需求，你需要生成一个完整的、可直接运行的 HTML 文件代码。

要求：
1. 输出一个完整的 HTML 文件（包含 <!DOCTYPE html>、<html>、<head>、<body>）
2. CSS 放在 <style> 标签内，JS 放在 <script> 标签内
3. 不使用外部 CDN 或 npm 包（除非用户明确要求）
4. 代码要美观、交互完整、功能可用
5. 使用现代化设计（Tailwind 风格的 CSS，但手写不引入 CDN）
6. 添加适当的动画和过渡效果

输出格式：
- 直接输出 HTML 代码，不要用 markdown 代码块包裹
- 不要添加解释文字
- 代码以 <!DOCTYPE html> 开头，以 </html> 结尾`

/** 清理模型输出：移除可能的 markdown 代码块包裹 */
function cleanCode(raw: string): string {
  return raw
    .replace(/```html\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
}

// ---------------------------------------------------------------------
// POST /api/vibe-code/generate —— SSE 流式生成代码
// ---------------------------------------------------------------------

interface GenerateBody {
  prompt?: unknown
}

vibeCodeRouter.post(
  '/generate',
  authMiddleware,
  async (req: Request, res: Response) => {
    const body = req.body as GenerateBody
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''

    if (!prompt) {
      res.status(400).json({ error: '请输入需求描述' })
      return
    }

    setSSEHeaders(res)

    const abortController = new AbortController()
    req.on('close', () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    })

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }]

    let fullCode = ''
    try {
      const gen = chatCompletionStreamWithSystemPrompt(
        messages,
        VIBE_CODE_SYSTEM_PROMPT,
        { signal: abortController.signal }
      )
      for await (const chunk of gen) {
        fullCode += chunk
        sendEvent(res, 'token', { token: chunk })
      }
      sendEvent(res, 'done', { code: cleanCode(fullCode) })
    } catch (err) {
      sendEvent(res, 'error', {
        error: err instanceof Error ? err.message : '生成失败',
      })
    } finally {
      res.end()
    }
  }
)

// ---------------------------------------------------------------------
// POST /api/vibe-code/fix —— SSE 流式修复代码
// ---------------------------------------------------------------------

interface FixBody {
  code?: unknown
  error?: unknown
}

vibeCodeRouter.post(
  '/fix',
  authMiddleware,
  async (req: Request, res: Response) => {
    const body = req.body as FixBody
    const code = typeof body.code === 'string' ? body.code : ''
    const error = typeof body.error === 'string' ? body.error : ''

    if (!code) {
      res.status(400).json({ error: '缺少待修复的代码' })
      return
    }

    setSSEHeaders(res)

    const abortController = new AbortController()
    req.on('close', () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    })

    const fixPrompt =
      `以下是生成的 HTML 代码运行时出错：\n\n` +
      `错误信息：\n${error || '运行时错误（请检查并修复代码中的问题）'}\n\n` +
      `当前代码：\n${code}\n\n` +
      `请修复这个错误，输出修复后的完整 HTML 代码。同样直接输出代码，不要 markdown 包裹。`

    const messages: ChatMessage[] = [{ role: 'user', content: fixPrompt }]

    let fullCode = ''
    try {
      const gen = chatCompletionStreamWithSystemPrompt(
        messages,
        VIBE_CODE_SYSTEM_PROMPT,
        { signal: abortController.signal }
      )
      for await (const chunk of gen) {
        fullCode += chunk
        sendEvent(res, 'token', { token: chunk })
      }
      sendEvent(res, 'done', { code: cleanCode(fullCode) })
    } catch (err) {
      sendEvent(res, 'error', {
        error: err instanceof Error ? err.message : '修复失败',
      })
    } finally {
      res.end()
    }
  }
)

// ---------------------------------------------------------------------
// GET /api/vibe-code/projects —— 列出用户项目
// ---------------------------------------------------------------------

vibeCodeRouter.get(
  '/projects',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const { data, error } = await supabase
        .from('vibe_projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      res.json({ projects: data || [] })
    } catch (err) {
      console.error('[vibe-code/projects] error:', err)
      res.status(500).json({ error: '获取项目列表失败' })
    }
  }
)

// ---------------------------------------------------------------------
// GET /api/vibe-code/projects/:id —— 获取项目详情
// ---------------------------------------------------------------------

vibeCodeRouter.get(
  '/projects/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const { id } = req.params
    try {
      const { data, error } = await supabase
        .from('vibe_projects')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      if (!data) {
        res.status(404).json({ error: '项目不存在' })
        return
      }

      // 公开项目任何人可看；私有项目只有作者可看
      if (!data.is_public && data.user_id !== user.id) {
        res.status(403).json({ error: '无权访问' })
        return
      }

      res.json({ project: data })
    } catch (err) {
      console.error('[vibe-code/projects/:id] error:', err)
      res.status(500).json({ error: '获取项目失败' })
    }
  }
)

// ---------------------------------------------------------------------
// POST /api/vibe-code/save —— 保存项目
// ---------------------------------------------------------------------

interface SaveBody {
  title?: unknown
  code?: unknown
  description?: unknown
  prompt?: unknown
  is_public?: unknown
}

vibeCodeRouter.post(
  '/save',
  authMiddleware,
  async (req: Request, res: Response) => {
    const body = req.body as SaveBody
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const code = typeof body.code === 'string' ? body.code : ''
    const description =
      typeof body.description === 'string' ? body.description : ''
    const prompt = typeof body.prompt === 'string' ? body.prompt : ''
    const is_public = body.is_public === true

    if (!title || !code) {
      res.status(400).json({ error: '标题和代码不能为空' })
      return
    }

    const user = req.user!
    try {
      const { data, error } = await supabase
        .from('vibe_projects')
        .insert({
          user_id: user.id,
          title,
          code,
          description,
          prompt,
          is_public,
        })
        .select()
        .single()

      if (error) throw error
      res.json({ project: data })
    } catch (err) {
      console.error('[vibe-code/save] error:', err)
      res.status(500).json({ error: '保存失败' })
    }
  }
)

// ---------------------------------------------------------------------
// GET /api/vibe-code/explore —— 公开广场
// ---------------------------------------------------------------------

vibeCodeRouter.get('/explore', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('vibe_projects')
      .select('id, user_id, title, description, prompt, is_public, likes, created_at')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json({ projects: data || [] })
  } catch (err) {
    console.error('[vibe-code/explore] error:', err)
    res.status(500).json({ error: '获取广场失败' })
  }
})

// =====================================================================
// Agent 多轮对话端点（Tool Calling）
// ---------------------------------------------------------------------
// POST /api/vibe-code/chat
//   body: { messages: ChatMessage[], code?: string, error?: string }
//   返回: { type: 'code', code, explanation } | { type: 'text', content } | { type: 'done' }
// =====================================================================

/** Agent 系统提示词（强调工具使用 + 多轮对话） */
const AGENT_SYSTEM_PROMPT = `你是一个强大的 Vibe Coding Agent，通过 Tool Calling 帮用户生成和迭代 HTML 应用。

工作方式：
- 用户描述需求 → 你调用 write_code 工具生成完整 HTML 代码
- 用户追问修改 → 你调用 write_code 工具更新代码
- 如果运行时出错，系统会告诉你错误信息 → 你调用 write_code 修复
- 完成且无需修改 → 调用 finish 工具

代码要求：
1. 完整 HTML 文件（<!DOCTYPE html> 到 </html>）
2. CSS 在 <style>，JS 在 <script>，不用外部 CDN
3. 现代美观设计，有动画和交互
4. 功能完整可用

重要：始终通过 write_code 工具输出代码，不要直接在回复中写代码。`

/** Agent 可用工具 */
const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'write_code',
      description: '生成或更新完整的 HTML 代码。当用户描述需求、要求修改、或需要修复错误时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: '完整的 HTML 文件代码，从 <!DOCTYPE html> 开始到 </html> 结束',
          },
          explanation: {
            type: 'string',
            description: '对本次生成/修改的简短说明',
          },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: '确认代码已完成，无需进一步修改。只在用户确认满意或任务完全完成时调用。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

interface ChatBody {
  messages?: unknown
  error?: unknown
}

vibeCodeRouter.post(
  '/chat',
  authMiddleware,
  async (req: Request, res: Response) => {
    const body = req.body as ChatBody

    // 解析 messages
    const rawMessages = Array.isArray(body.messages) ? body.messages : []
    const messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool'
      content: string
      tool_call_id?: string
    }> = [{ role: 'system', content: AGENT_SYSTEM_PROMPT }]

    for (const m of rawMessages) {
      if (typeof m !== 'object' || m === null) continue
      const role = (m as { role?: string }).role
      const content = (m as { content?: string }).content
      if (!role || !content) continue
      if (role === 'user' || role === 'assistant') {
        messages.push({ role, content })
      }
    }

    // 如果有错误信息，追加为 user 消息
    const error = typeof body.error === 'string' ? body.error.trim() : ''
    if (error) {
      messages.push({
        role: 'user',
        content: `代码运行时出错：\n${error}\n\n请修复这个错误，输出修复后的完整代码。`,
      })
    }

    const abortController = new AbortController()
    req.on('close', () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    })

    try {
      const result = await chatWithTools(messages, AGENT_TOOLS, {
        signal: abortController.signal,
      })

      // 处理 tool_calls
      if (result.toolCalls && result.toolCalls.length > 0) {
        const toolCall = result.toolCalls[0]

        if (toolCall.name === 'write_code') {
          let parsed: { code?: string; explanation?: string } = {}
          try {
            parsed = JSON.parse(toolCall.arguments)
          } catch {
            // arguments 不是合法 JSON，尝试提取 code 字段
            const codeMatch = toolCall.arguments.match(/"code"\s*:\s*"([\s\S]*?)"/)
            if (codeMatch) {
              parsed = { code: codeMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') }
            }
          }
          if (parsed.code) {
            const cleanCodeResult = cleanCode(parsed.code)
            res.json({
              type: 'code',
              code: cleanCodeResult,
              explanation: parsed.explanation || '',
            })
            return
          }
        }

        if (toolCall.name === 'finish') {
          res.json({ type: 'done' })
          return
        }
      }

      // 无 tool_calls，返回文本
      res.json({ type: 'text', content: result.content })
    } catch (err) {
      console.error('[vibe-code/chat] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Agent 对话失败',
      })
    }
  }
)
