// =====================================================================
// Vibe Coding Agent API
// ---------------------------------------------------------------------
// 用户用自然语言描述需求 → AI 生成可运行 HTML 代码 → 浏览器内即时预览。
//   POST /api/vibe-code/generate      SSE 流式生成代码（@deprecated，保留兼容）
//   POST /api/vibe-code/fix           SSE 流式修复代码
//   POST /api/vibe-code/stream       Vercel AI SDK streamText + 工具调用（新，spec §6.2）
//   GET  /api/vibe-code/projects      列出用户项目
//   GET  /api/vibe-code/projects/:id  获取项目详情
//   POST /api/vibe-code/save          保存项目
//   GET  /api/vibe-code/explore       公开广场
//   POST /api/vibe-code/chat          Agent 多轮对话（非流式 Tool Calling）
// =====================================================================

import { Router, Request, Response } from 'express'
import { streamText, isStepCount } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { authMiddleware } from '../middleware/auth'
import {
  chatCompletionStreamWithSystemPrompt,
  chatWithTools,
  type ToolDefinition,
} from '../lib/ai-client'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import { createVibeTools } from '../lib/vibe-tools'
import { loadSkillTools, loadSkillSystemPrompt } from '../lib/skill-registry'
import { createSnapshot } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { generatePlan } from '../lib/agents/planner'
import { runSelfCheck } from '../lib/agents/self-check'
import type { ChatMessage, Plan, PlanStep } from '../../shared/types'

export const vibeCodeRouter = Router()

/**
 * 包装 streamText，在流式输出真正开始前（首个 chunk 拉取）失败时自动重试。
 * 一旦成功 yield 出任意 chunk，后续错误不再重试（避免向客户端重复输出 token）。
 * 适用于上游 500/429/网络抖动等临时故障，重试间隔 1s/2s 指数退避。
 */
async function* streamTextWithRetry(
  opts: Parameters<typeof streamText>[0],
  maxRetries = 2,
) {
  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let streamStarted = false
    try {
      const result = streamText(opts)
      const iter = result.fullStream[Symbol.asyncIterator]()
      const first = await iter.next()
      // 成功拉到首个 chunk（或上游返回空流），标记流已开始
      streamStarted = true
      if (!first.done) yield first.value
      while (true) {
        const next = await iter.next()
        if (next.done) break
        yield next.value
      }
      return
    } catch (err) {
      // 流式输出已开始：直接抛出，不可重试（避免重复 token）
      if (streamStarted) throw err
      // 客户端主动取消：不重试
      if (opts.abortSignal?.aborted) throw err
      lastErr = err
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt)
        console.warn(
          `[streamTextWithRetry] attempt ${attempt + 1} failed, retry in ${delay}ms`,
          err instanceof Error ? err.message : err,
        )
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}

/**
 * 统一的 Vibe Coding Agent 系统提示词。
 * /generate、/chat、/stream 三个端点共享此常量，避免行为分叉。
 */
const STREAM_SYSTEM_PROMPT = `你是一个强大的 Vibe Coding Agent，通过 Vercel AI SDK 的 Tool Calling 帮用户生成和迭代 HTML 应用。

工作方式：
- 用户描述需求 → 你调用 writeFile 工具写入完整 HTML 文件到 index.html
- 用户追问修改 → 你再次调用 writeFile 更新 index.html
- 用户需要联网信息 → 你调用 webSearch 工具
- 用户需要图片 → 你调用 generateImage 工具
- 用户需要视频 → 你调用 generateVideo 工具
- 用户需要纯计算（如算式、转换） → 你调用 executeCode 工具

代码要求：
1. 完整 HTML 文件（<!DOCTYPE html> 到 </html>）
2. CSS 在 <style>，JS 在 <script>，不用外部 CDN
3. 现代美观设计，有动画和交互
4. 功能完整可用
5. 代码注释统一用中文，简洁明了
6. 错误处理：对可能失败的操作（如 fetch、用户输入解析）使用 try-catch，给用户友好的中文错误提示，避免页面白屏

响应语言：
- 始终使用中文回复用户
- 代码注释用中文

重要：
- 始终通过 writeFile 工具输出代码（path 设为 "index.html"）
- 输出代码后用文字简短说明本次改动
- 不要在普通回复中直接粘贴大段代码`

/** vibe coding agent 的系统提示词（与 STREAM_SYSTEM_PROMPT 一致，三端点共用） */
const VIBE_CODE_SYSTEM_PROMPT = STREAM_SYSTEM_PROMPT

/** 清理模型输出：移除可能的 markdown 代码块包裹 */
function cleanCode(raw: string): string {
  return raw
    .replace(/```html\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
}

// ---------------------------------------------------------------------
// POST /api/vibe-code/generate —— SSE 流式生成代码
// @deprecated 由 POST /api/vibe-code/stream 替代，保留兼容旧客户端
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

/** Agent 系统提示词（与 STREAM_SYSTEM_PROMPT 一致，三端点共用） */
const AGENT_SYSTEM_PROMPT = STREAM_SYSTEM_PROMPT

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

// =====================================================================
// POST /api/vibe-code/stream —— Vercel AI SDK streamText + 工具调用（spec §6.2）
// ---------------------------------------------------------------------
// 使用 Vercel AI SDK v7 的 streamText 实现：
//   - 流式 token 输出（实时显示在 assistant-ui Thread 中）
//   - 自动多轮工具调用（stopWhen: isStepCount(10)，Agent 可循环调用工具直到完成）
//   - 工具集：writeFile / readFile / executeCode / webSearch / generateImage / generateVideo
//
// 请求 body: { messages: Array<{role, content}>, projectId?: string }
// 响应：简单 SSE 事件流（与 /chat 端点格式一致，便于客户端 useExternalStoreRuntime 消费）
//   - event: start   data: {}
//   - event: token   data: { c: string }                —— 文本增量
//   - event: tool_call   data: { id, name, args }       —— 工具调用开始
//   - event: tool_result data: { id, name, result }     —— 工具调用结果
//   - event: done     data: {}
//   - event: error    data: { error: string }
//
// 注：不使用 pipeUIMessageStreamToResponse，因为 @assistant-ui/react-ai-sdk@1.3.40
//     依赖 ai@6，与项目 ai@7 不兼容。改用与 /chat 一致的 SSE 格式 +
//     useExternalStoreRuntime 手动消费，完全绕过版本冲突。
// =====================================================================

interface StreamMessage {
  role?: unknown
  content?: unknown
}

interface StreamBody {
  messages?: unknown
  projectId?: unknown
  /** Batch B：Plan Mode 开关 */
  mode?: unknown
  /** Batch B：已存在的 plan ID（确认后执行） */
  planId?: unknown
}

vibeCodeRouter.post(
  '/stream',
  authMiddleware,
  async (req: Request, res: Response) => {
    const body = req.body as StreamBody
    const user = req.user!

    // 解析 mode：'single' | 'plan' | 'team'，默认 single
    const mode =
      typeof body.mode === 'string' &&
      ['single', 'plan', 'team'].includes(body.mode)
        ? (body.mode as 'single' | 'plan' | 'team')
        : 'single'
    const planId =
      typeof body.planId === 'string' && body.planId ? body.planId : undefined

    // 校验 messages：接受简单 { role, content }[] 格式
    const rawMessages = Array.isArray(body.messages) ? body.messages : []
    const simpleMessages: StreamMessage[] = []
    for (const m of rawMessages) {
      if (typeof m !== 'object' || m === null) continue
      const role = (m as { role?: string }).role
      const content = (m as { content?: string }).content
      if (role !== 'user' && role !== 'assistant') continue
      if (typeof content !== 'string' || !content) continue
      simpleMessages.push({ role, content })
    }

    const projectId =
      typeof body.projectId === 'string' ? body.projectId : undefined

    // 设置 SSE 响应头（提前，plan 模式也用 SSE 推送 plan 事件）
    setSSEHeaders(res)

    // 请求关闭时取消流
    const abortController = new AbortController()
    req.on('close', () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    })

    // -----------------------------------------------------------------
    // Plan Mode：先调 generatePlan 返回 plan 事件，然后结束流（等待用户确认）
    // -----------------------------------------------------------------
    if (mode === 'plan' && !planId) {
      if (simpleMessages.length === 0) {
        sendEvent(res, 'error', { error: 'messages 字段必须包含至少一条有效消息' })
        res.end()
        return
      }
      try {
        // 取最后一条 user 消息作为 goal
        const lastUserMsg = [...simpleMessages].reverse().find((m) => m.role === 'user')
        const goal = (lastUserMsg?.content as string) || ''

        const generated = await generatePlan(goal)

        // 规范化 step 并保存到 plans 表
        const steps: PlanStep[] = generated.steps.map((s, i) => ({
          id: i + 1,
          title: s.title,
          type: s.type,
          status: 'pending',
        }))

        const { data, error } = await supabase
          .from('plans')
          .insert({
            user_id: user.id,
            project_id: projectId ?? null,
            goal: generated.goal,
            steps,
            current_step: 0,
            status: 'ready',
            mode: 'plan',
          })
          .select()
          .single()

        if (error) throw error
        if (!data) {
          sendEvent(res, 'error', { error: '保存 plan 失败' })
          res.end()
          return
        }

        const row = data as unknown as Record<string, unknown>
        const plan: Plan = {
          id: row.id as string,
          user_id: row.user_id as string,
          project_id: (row.project_id as string | null) ?? null,
          goal: row.goal as string,
          steps: (row.steps as PlanStep[]) ?? [],
          current_step: (row.current_step as number) ?? 0,
          status: (row.status as Plan['status']) ?? 'ready',
          mode: (row.mode as Plan['mode']) ?? 'plan',
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
        }

        // 发送 plan 事件，前端 setPlan(plan) 后渲染 PlanPanel
        sendEvent(res, 'plan', { plan })
        sendEvent(res, 'done', {})
      } catch (err) {
        console.error('[vibe-code/stream plan] error:', err)
        sendEvent(res, 'error', {
          error: err instanceof Error ? err.message : '生成 plan 失败',
        })
      } finally {
        res.end()
      }
      return
    }

    // -----------------------------------------------------------------
    // Plan Mode + planId：从 plans 表加载，按 steps 流式执行
    // -----------------------------------------------------------------
    if (mode === 'plan' && planId) {
      try {
        const { data: planRow, error: planError } = await supabase
          .from('plans')
          .select('*')
          .eq('id', planId)
          .maybeSingle()

        if (planError) throw planError
        if (!planRow) {
          sendEvent(res, 'error', { error: 'Plan 不存在' })
          res.end()
          return
        }

        const row = planRow as unknown as Record<string, unknown>
        if (row.user_id !== user.id) {
          sendEvent(res, 'error', { error: '无权访问该 plan' })
          res.end()
          return
        }

        const plan: Plan = {
          id: row.id as string,
          user_id: row.user_id as string,
          project_id: (row.project_id as string | null) ?? null,
          goal: row.goal as string,
          steps: (row.steps as PlanStep[]) ?? [],
          current_step: (row.current_step as number) ?? 0,
          status: (row.status as Plan['status']) ?? 'ready',
          mode: (row.mode as Plan['mode']) ?? 'plan',
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
        }

        if (!plan.steps || plan.steps.length === 0) {
          sendEvent(res, 'error', { error: 'Plan 没有 steps，无法执行' })
          res.end()
          return
        }

        // 标记为 executing
        await supabase.from('plans').update({ status: 'executing' }).eq('id', planId)

        // 加载 skill 工具（createVibeTools 通过闭包捕获 userId/projectId，无需 globalThis）
        const planProjectId = plan.project_id ?? undefined
        const skillTools = await loadSkillTools(user.id, planProjectId)
        const activeTools =
          Object.keys(skillTools).length > 0
            ? skillTools
            : createVibeTools(user.id, planProjectId)
        const skillPromptSuffix = await loadSkillSystemPrompt(user.id)

        const openai = createOpenAI({
          apiKey: process.env.AGNES_API_KEY!,
          baseURL: process.env.AGNES_API_BASE!,
        })
        const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

        const EXEC_SYSTEM_PROMPT =
          `你是一个 Vibe Coding Agent，正在按计划逐步执行任务。` +
          `当前整体目标：${plan.goal}\n\n` +
          `工作方式：\n- 每一步会单独发给你，你只需完成当前 step` +
          (skillPromptSuffix ? `\n\n--- 已安装 Skill 能力说明 ---\n${skillPromptSuffix}` : '')

        const stepContext: Array<{ title: string; result: string }> = []
        let allSuccess = true

        for (let i = 0; i < plan.steps.length; i++) {
          if (abortController.signal.aborted) break

          const step = plan.steps[i]

          // 跳过已完成或已跳过的 step
          if (step.status === 'completed' || step.status === 'skipped') {
            if (step.result) {
              stepContext.push({ title: step.title, result: step.result })
            }
            continue
          }

          // 标记当前 step 状态为 in_progress
          const nowIso = new Date().toISOString()
          const updatedStepsInProgress = plan.steps.map((s, idx) =>
            idx === i
              ? { ...s, status: 'in_progress' as const, started_at: nowIso }
              : s,
          )
          await supabase
            .from('plans')
            .update({
              steps: updatedStepsInProgress,
              current_step: i,
              status: 'executing',
            })
            .eq('id', planId)

          // 发送 step_start 事件
          sendEvent(res, 'step_start', { stepId: step.id, step })

          // 构造 step 提示
          const contextText =
            stepContext.length > 0
              ? stepContext
                  .map(
                    (c, idx) =>
                      `Step ${idx + 1}「${c.title}」已完成，结果：\n${c.result}`,
                  )
                  .join('\n\n')
              : '（无前序步骤）'

          const stepPrompt = `当前需要完成的步骤：\n标题：${step.title}\n类型：${step.type}\n\n前序步骤完成情况：\n${contextText}\n\n请完成当前步骤。`

          // 调 streamText
          let stepResult = ''
          try {
            const result = streamText({
              model: openai.chat(modelName),
              system: EXEC_SYSTEM_PROMPT,
              messages: [{ role: 'user', content: stepPrompt }],
              tools: activeTools,
              abortSignal: abortController.signal,
              onFinish: ({ text }) => {
                stepResult = text
              },
            })

            // 流式转发 token
            for await (const part of result.fullStream) {
              if (abortController.signal.aborted) break
              switch (part.type) {
                case 'text-delta': {
                  if (part.text) {
                    sendEvent(res, 'token', { c: part.text, stepId: step.id })
                  }
                  break
                }
                case 'tool-call': {
                  sendEvent(res, 'tool_call', {
                    id: part.toolCallId,
                    name: part.toolName,
                    args: part.input ?? {},
                    stepId: step.id,
                  })
                  break
                }
                case 'tool-result': {
                  sendEvent(res, 'tool_result', {
                    id: part.toolCallId,
                    name: part.toolName,
                    result: part.output,
                    stepId: step.id,
                  })
                  break
                }
                case 'tool-error': {
                  sendEvent(res, 'tool_result', {
                    id: part.toolCallId,
                    name: part.toolName,
                    result: {
                      error:
                        part.error instanceof Error
                          ? part.error.message
                          : '工具执行失败',
                    },
                    stepId: step.id,
                  })
                  break
                }
                default:
                  break
              }
            }

            // 标记 step 完成
            const completedIso = new Date().toISOString()
            const updatedStepsCompleted = updatedStepsInProgress.map((s, idx) =>
              idx === i
                ? {
                    ...s,
                    status: 'completed' as const,
                    result: stepResult || '(无文本输出)',
                    completed_at: completedIso,
                  }
                : s,
            )
            await supabase
              .from('plans')
              .update({ steps: updatedStepsCompleted, current_step: i + 1 })
              .eq('id', planId)

            stepContext.push({ title: step.title, result: stepResult })

            sendEvent(res, 'step_done', {
              stepId: step.id,
              result: stepResult || '(无文本输出)',
            })
          } catch (stepErr) {
            allSuccess = false
            const failedIso = new Date().toISOString()
            const errMsg =
              stepErr instanceof Error ? stepErr.message : '执行失败'
            const updatedStepsFailed = updatedStepsInProgress.map((s, idx) =>
              idx === i
                ? {
                    ...s,
                    status: 'failed' as const,
                    result: errMsg,
                    completed_at: failedIso,
                  }
                : s,
            )
            await supabase
              .from('plans')
              .update({ steps: updatedStepsFailed, status: 'failed' })
              .eq('id', planId)

            sendEvent(res, 'step_done', {
              stepId: step.id,
              result: errMsg,
              error: true,
            })
            break
          }
        }

        // 标记 plan 最终状态
        const finalStatus = abortController.signal.aborted
          ? 'paused'
          : allSuccess
            ? 'completed'
            : 'failed'
        await supabase
          .from('plans')
          .update({ status: finalStatus })
          .eq('id', planId)

        sendEvent(res, 'done', { status: finalStatus })
      } catch (err) {
        console.error('[vibe-code/stream planId] error:', err)
        if (!res.headersSent) {
          res.status(500).json({
            error: err instanceof Error ? err.message : 'Vibe Code 流式失败',
          })
        } else {
          sendEvent(res, 'error', {
            error: err instanceof Error ? err.message : 'Vibe Code 流式失败',
          })
        }
      } finally {
        res.end()
      }
      return
    }

    // -----------------------------------------------------------------
    // 默认 single 模式：原行为不变
    // -----------------------------------------------------------------
    if (simpleMessages.length === 0) {
      res.status(400).json({ error: 'messages 字段必须包含至少一条有效消息' })
      return
    }

    // 加载用户已安装且启用的 skill 工具（若为空则 fallback 到 createVibeTools）
    // createVibeTools 通过闭包捕获 userId/projectId，无需 globalThis（P0-2 修复）
    const skillTools = await loadSkillTools(user.id, projectId)
    const activeTools =
      Object.keys(skillTools).length > 0
        ? skillTools
        : createVibeTools(user.id, projectId)

    // 加载已安装 skill 的 systemPrompt 片段并拼接到系统提示词末尾
    const skillPromptSuffix = await loadSkillSystemPrompt(user.id)
    const systemPrompt = skillPromptSuffix
      ? STREAM_SYSTEM_PROMPT + skillPromptSuffix
      : STREAM_SYSTEM_PROMPT

    // 构造 OpenAI 兼容 client（指向 Agnes API）
    const openai = createOpenAI({
      apiKey: process.env.AGNES_API_KEY!,
      baseURL: process.env.AGNES_API_BASE!,
    })

    // 模型名从环境变量读取，默认 agnes-2.0-flash（生产环境）
    // 本地若配置了智谱（AGNES_MODEL=glm-4-flash），也能正常测试
    const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

    // 构造 model messages：仅包含 user/assistant 消息
    // Vercel AI SDK v7 不允许 messages 中包含 role: 'system'，必须用 system 选项
    const messages = simpleMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
    }))

    // 120s 服务端超时保护：若 AI 上游卡住且客户端未断开，主动 abort 并发送 error
    let streamTimeout: NodeJS.Timeout | null = null
    const clearStreamTimeout = () => {
      if (streamTimeout) {
        clearTimeout(streamTimeout)
        streamTimeout = null
      }
    }
    streamTimeout = setTimeout(() => {
      console.warn('[vibe-code/stream] timeout 120s, aborting')
      abortController.abort()
      sendEvent(res, 'error', { error: 'AI 响应超时（120s）' })
      clearStreamTimeout()
    }, 120_000)
    // 客户端断开时也要清掉定时器，避免内存泄漏
    req.on('close', () => clearStreamTimeout())

    try {
      const stream = streamTextWithRetry(
        {
          // 使用 .chat() 走 /chat/completions 端点（OpenAI 兼容服务都支持）
          // 不能用 openai(modelName)，那会用 /responses 端点，仅 OpenAI 官方支持
          model: openai.chat(modelName),
          system: systemPrompt,
          messages,
          tools: activeTools,
          // ai v7：用 stopWhen: isStepCount(N) 替代旧 maxSteps
          stopWhen: isStepCount(10),
          abortSignal: abortController.signal,
          onFinish: ({ text, toolResults }) => {
            clearStreamTimeout()
            console.log(
              `[vibe-code/stream] user=${user.id} projectId=${projectId || 'default'} ` +
                `text_len=${text.length} tool_results=${toolResults.length}`,
            )
          },
        },
        2, // maxRetries：共 3 次尝试（1 + 2 重试），1s/2s 指数退避
      )

      // 发送 start 事件
      sendEvent(res, 'start', {})

      // 追踪本次流式输出中最后一次 writeFile 的 content + assistant 文本
      // 用于在流结束后自动创建快照（Task 7.2）
      let latestCode = ''
      let assistantText = ''

      // 遍历 fullStream，转发为简单 SSE 事件
      for await (const part of stream) {
        switch (part.type) {
          case 'text-delta': {
            if (part.text) {
              assistantText += part.text
              sendEvent(res, 'token', { c: part.text })
            }
            break
          }
          case 'tool-call': {
            // 追踪 writeFile 工具调用的 content（自动快照用）
            if (part.toolName === 'writeFile') {
              const input = part.input as { content?: unknown } | undefined
              if (input && typeof input.content === 'string' && input.content) {
                latestCode = input.content
              }
            }
            // 工具调用开始（input 已完整）
            sendEvent(res, 'tool_call', {
              id: part.toolCallId,
              name: part.toolName,
              args: part.input ?? {},
            })
            break
          }
          case 'tool-result': {
            // 工具调用结果
            sendEvent(res, 'tool_result', {
              id: part.toolCallId,
              name: part.toolName,
              result: part.output,
            })
            break
          }
          case 'tool-error': {
            // 工具执行错误：转为 tool_result 事件，result 为 { error }
            sendEvent(res, 'tool_result', {
              id: part.toolCallId,
              name: part.toolName,
              result: {
                error:
                  part.error instanceof Error
                    ? part.error.message
                    : '工具执行失败',
              },
            })
            break
          }
          case 'error': {
            sendEvent(res, 'error', {
              error: 'AI 流式错误',
            })
            break
          }
          default:
            // 其他类型（start-step / finish-step / reasoning 等）忽略
            break
        }
      }

      // ---- Fallback：AI 未调用 writeFile 但文本中含 ```html 代码块 ----
      // 某些模型不支持 tool calling，会直接在回复中输出代码块。
      // 此时模拟一个 writeFile tool_call + tool_result 事件，
      // 让前端 extractLatestCode 能提取到代码并显示在 iframe 中。
      if (!latestCode && assistantText) {
        const htmlMatch = assistantText.match(/```html\n([\s\S]*?)\n```/)
        if (htmlMatch && htmlMatch[1]) {
          latestCode = htmlMatch[1]
          sendEvent(res, 'tool_call', {
            id: 'fallback-writeFile',
            name: 'writeFile',
            args: { path: 'index.html', content: latestCode },
          })
          sendEvent(res, 'tool_result', {
            id: 'fallback-writeFile',
            name: 'writeFile',
            result: { success: true, path: 'index.html', size: latestCode.length },
          })
        }
      }

      // ---- 自动创建快照（Task 7.2）----
      // 流式结束后，基于本次生成/修改的代码自动创建一个快照。
      // 失败静默处理，不影响主流程。
      try {
        if (latestCode) {
          const snapshotProjectId = projectId || `default-${user.id}`
          await createSnapshot({
            projectId: snapshotProjectId,
            userId: user.id,
            code: latestCode,
            label: 'auto-save',
            branch: 'main',
          })
        }
      } catch (snapshotErr) {
        console.error('[vibe-code/stream] auto-snapshot failed:', snapshotErr)
      }

      // ---- 开发完整性自检 ----
      // 流式结束后，对生成的代码执行静态自检，发送 self_check 事件。
      // 失败静默处理，不影响主流程。
      try {
        if (latestCode) {
          const selfCheckResult = await runSelfCheck(latestCode)
          sendEvent(res, 'self_check', { result: selfCheckResult })
        }
      } catch (selfCheckErr) {
        console.error('[vibe-code/stream] self-check failed:', selfCheckErr)
      }

      sendEvent(res, 'done', {})
    } catch (err) {
      clearStreamTimeout()
      console.error('[vibe-code/stream] error:', err)
      if (!res.headersSent) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Vibe Code 流式失败',
        })
      } else {
        sendEvent(res, 'error', {
          error: err instanceof Error ? err.message : 'Vibe Code 流式失败',
        })
      }
    } finally {
      clearStreamTimeout()
      res.end()
    }
  }
)
