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
import { chatCompletionStreamWithSystemPrompt } from '../lib/ai-client'
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
