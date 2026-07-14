// =====================================================================
// 创意工坊 API（基础）
// ---------------------------------------------------------------------
// 作品 CRUD：
//   GET    /api/studio/works           列出当前用户的作品
//   GET    /api/studio/works/:id       获取作品详情
//   POST   /api/studio/works           创建作品
//   PUT    /api/studio/works/:id       更新作品
//   DELETE /api/studio/works/:id       删除作品
// 创作工具：
//   POST   /api/studio/script          流式生成多角色剧本（SSE）
//   POST   /api/studio/image           批量生成图片
//   POST   /api/studio/video/create    提交视频生成任务
//   GET    /api/studio/video/status/:id 查询视频任务状态
//   POST   /api/studio/article         流式生成文章（SSE）
//   POST   /api/studio/voice           语音合成
// 游戏存档（仅查看/删除，文字冒险入口已迁移至 vibe-code）：
//   GET    /api/studio/game/saves      列出存档
//   DELETE /api/studio/game/saves/:id  删除存档
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import {
  chatCompletionStream,
  generateImage,
  generateSpeech,
  getVideoTaskResult,
  submitVideoTask,
} from '../lib/ai-client'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import {
  createCreativeWork,
  deleteGameSave,
  getCreativeWorkById,
  listCreativeWorksByCreator,
  listGameSaves,
  updateCreativeWork,
} from '../lib/queries'
import { getAgentById } from '../../shared/agents'
import type { ChatMessage, CreativeWork } from '../../shared/types'
import { addMediaAsset } from '../lib/media-asset'

export const studioRouter = Router()

/** 创意工坊默认使用的智能体 ID（脚本/文章/游戏等场景） */
const DEFAULT_STUDIO_AGENT = 'confucius'

// ---------------------------------------------------------------------
// 作品 CRUD
// ---------------------------------------------------------------------

// GET /api/studio/works —— 列出当前用户的作品
studioRouter.get('/works', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const typeFilter =
      typeof req.query.type === 'string' ? req.query.type : undefined

    let works = await listCreativeWorksByCreator(user.id)

    // 按类型过滤（listCreativeWorksByCreator 不支持 type 参数，内存过滤）
    if (typeFilter) {
      works = works.filter((w) => w.type === typeFilter)
    }

    res.json({ works })
  } catch (err) {
    console.error('[api/studio/works] 异常：', err)
    res.status(500).json({ error: '服务器开小差了' })
  }
})

// GET /api/studio/works/:id —— 获取作品详情
studioRouter.get(
  '/works/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const id = req.params.id as string
      const work = await getCreativeWorkById(id)
      if (!work) {
        res.status(404).json({ error: '作品不存在' })
        return
      }
      if (work.creator_id !== user.id) {
        res.status(403).json({ error: '无权查看他人作品' })
        return
      }
      res.json({ work })
    } catch (err) {
      console.error('[api/studio/works/:id] 异常：', err)
      res.status(500).json({ error: '服务器开小差了' })
    }
  }
)

// POST /api/studio/works —— 创建作品
interface CreateWorkBody {
  type?: unknown
  title?: unknown
  input?: unknown
  result?: unknown
}

studioRouter.post(
  '/works',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const body = req.body as CreateWorkBody
      const type = typeof body.type === 'string' ? body.type : ''
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const input =
        body.input && typeof body.input === 'object'
          ? (body.input as Record<string, unknown>)
          : {}
      const result =
        body.result && typeof body.result === 'object'
          ? (body.result as Record<string, unknown>)
          : null

      if (!type) {
        res.status(400).json({ error: '缺少作品类型' })
        return
      }
      if (!title) {
        res.status(400).json({ error: '缺少作品标题' })
        return
      }

      const work = await createCreativeWork(
        user.id,
        type as CreativeWork['type'],
        title,
        input
      )

      // 若提供了 result，写入结果
      if (result) {
        await updateCreativeWork(work.id, { result, status: 'done' })
      }

      res.json({ work })
    } catch (err) {
      console.error('[api/studio/works POST] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)

// PUT /api/studio/works/:id —— 更新作品
interface UpdateWorkBody {
  title?: unknown
  input?: unknown
  result?: unknown
  status?: unknown
}

studioRouter.put(
  '/works/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const id = req.params.id as string
      const existing = await getCreativeWorkById(id)
      if (!existing) {
        res.status(404).json({ error: '作品不存在' })
        return
      }
      if (existing.creator_id !== user.id) {
        res.status(403).json({ error: '无权修改他人作品' })
        return
      }

      const body = req.body as UpdateWorkBody
      const updates: {
        result?: Record<string, unknown>
        status?: CreativeWork['status']
        input?: Record<string, unknown>
      } = {}

      if (body.result && typeof body.result === 'object') {
        updates.result = body.result as Record<string, unknown>
      }
      if (body.input && typeof body.input === 'object') {
        updates.input = body.input as Record<string, unknown>
      }
      if (typeof body.status === 'string') {
        updates.status = body.status as CreativeWork['status']
      }

      await updateCreativeWork(id, updates)
      const updated = await getCreativeWorkById(id)
      res.json({ work: updated })
    } catch (err) {
      console.error('[api/studio/works PUT] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)

// DELETE /api/studio/works/:id —— 删除作品
studioRouter.delete(
  '/works/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const id = req.params.id as string
      const existing = await getCreativeWorkById(id)
      if (!existing) {
        res.status(404).json({ error: '作品不存在' })
        return
      }
      if (existing.creator_id !== user.id) {
        res.status(403).json({ error: '无权删除他人作品' })
        return
      }

      // 创意作品表无 delete 函数，通过 update 状态为 failed 间接标记
      // 或直接使用底层删除 —— 这里复用 updateCreativeWork 标记状态
      await updateCreativeWork(id, { status: 'failed' })
      res.json({ success: true })
    } catch (err) {
      console.error('[api/studio/works DELETE] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)

// ---------------------------------------------------------------------
// POST /api/studio/script —— 流式生成多角色剧本（SSE）
// ---------------------------------------------------------------------

interface ScriptBody {
  topic?: unknown
  scene?: unknown
  agentIds?: unknown
  duration?: unknown
}

studioRouter.post('/script', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const body = req.body as ScriptBody
    const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
    const scene = typeof body.scene === 'string' ? body.scene.trim() : ''
    const agentIds = Array.isArray(body.agentIds)
      ? body.agentIds.filter((a): a is string => typeof a === 'string')
      : []
    const duration =
      typeof body.duration === 'number' ? body.duration : 5

    if (!topic) {
      res.status(400).json({ error: '缺少剧本主题' })
      return
    }

    // 收集角色信息
    const characters = agentIds.map((id) => {
      const official = getAgentById(id)
      return official ? `${official.name}（${official.tagline}）` : id
    })

    const prompt =
      `请创作一个${duration}分钟的多角色搞笑短剧本。\n` +
      `主题：${topic}\n` +
      `场景：${scene || '自由发挥'}\n` +
      (characters.length > 0
        ? `出场角色：${characters.join('、')}\n`
        : '') +
      `要求：\n` +
      `1. 每个角色保持鲜明性格，台词要融入各自口头禅\n` +
      `2. 对白格式：角色名：台词\n` +
      `3. 用原创幽默，不要引用网络热梗\n` +
      `4. 有反转和笑点\n` +
      `5. 场景描述用【方括号】标注`

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }]

    // 选择默认或第一个 agent 作为叙述者
    const narratorAgentId = agentIds[0] || DEFAULT_STUDIO_AGENT

    setSSEHeaders(res)

    const abortController = new AbortController()
    req.on('close', () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    })

    let fullText = ''
    try {
      const gen = chatCompletionStream(messages, narratorAgentId, {
        signal: abortController.signal,
      })
      for await (const chunk of gen) {
        fullText += chunk
        sendEvent(res, 'token', { c: chunk })
      }

      // 保存为创意作品
      try {
        const work = await createCreativeWork(
          user.id,
          'script',
          topic,
          { topic, scene, agentIds, duration }
        )
        await updateCreativeWork(work.id, { result: { script: fullText }, status: 'done' })
      } catch {
        // 保存失败不影响流式输出
      }

      sendEvent(res, 'done', {})
    } catch (err) {
      sendEvent(res, 'error', {
        message: err instanceof Error ? err.message : '剧本生成失败',
      })
    } finally {
      res.end()
    }
  } catch (err) {
    console.error('[api/studio/script] 异常：', err)
    if (res.headersSent) {
      sendEvent(res, 'error', { message: '服务器开小差了' })
      res.end()
    } else {
      res.status(500).json({ error: '服务器开小差了' })
    }
  }
})

// ---------------------------------------------------------------------
// POST /api/studio/image —— 批量生成图片
// ---------------------------------------------------------------------

interface ImageBody {
  prompt?: unknown
  style?: unknown
  count?: unknown
}

studioRouter.post('/image', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const body = req.body as ImageBody
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const style = typeof body.style === 'string' ? body.style.trim() : ''
    const count =
      typeof body.count === 'number' && body.count > 0
        ? Math.min(4, Math.floor(body.count))
        : 1

    if (!prompt) {
      res.status(400).json({ error: '缺少图片描述' })
      return
    }

    // 拼接风格描述
    const fullPrompt = style ? `${prompt}，风格：${style}` : prompt

    // 批量生成
    const images = await Promise.all(
      Array.from({ length: count }, () => generateImage(fullPrompt))
    )

    // 保存为创意作品
    try {
      const work = await createCreativeWork(user.id, 'image', prompt, {
        prompt,
        style,
        count,
      })
      await updateCreativeWork(work.id, {
        result: { images: images.map((url) => ({ url })) },
        status: 'done',
      })
    } catch {
      // 保存失败不影响返回
    }

    // 同步入库到素材库（每张图都入库）
    for (const url of images) {
      await addMediaAsset({
        userId: user.id,
        type: 'image',
        url,
        prompt: fullPrompt,
        title: prompt.slice(0, 50),
        metadata: { style, source: 'studio/image' },
      })
    }

    res.json({ images: images.map((url) => ({ url })) })
  } catch (err) {
    console.error('[api/studio/image] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '图片生成失败',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/studio/video/create —— 提交视频生成任务
// ---------------------------------------------------------------------

interface VideoCreateBody {
  prompt?: unknown
  style?: unknown
  duration?: unknown
}

studioRouter.post(
  '/video/create',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    try {
      const body = req.body as VideoCreateBody
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      const style = typeof body.style === 'string' ? body.style.trim() : ''
      // 智谱只支持 5 或 10 秒
      const duration = body.duration === 10 ? 10 : 5

      if (!prompt) {
        res.status(400).json({ error: '缺少视频描述' })
        return
      }

      const fullPrompt = style ? `${prompt}，风格：${style}` : prompt
      const taskId = await submitVideoTask(fullPrompt, { duration })

      // 保存为创意作品（pending 状态）
      try {
        const work = await createCreativeWork(user.id, 'video', prompt, {
          prompt,
          style,
          duration,
          taskId,
        })
        await updateCreativeWork(work.id, { status: 'processing' })
      } catch {
        // 保存失败不影响返回
      }

      res.json({ taskId })
    } catch (err) {
      console.error('[api/studio/video/create] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '视频任务提交失败',
      })
    }
  }
)

// ---------------------------------------------------------------------
// GET /api/studio/video/status/:id —— 查询视频任务状态
// ---------------------------------------------------------------------

studioRouter.get(
  '/video/status/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const id = req.params.id as string
      const result = await getVideoTaskResult(id)

      // 视频生成成功时自动入库到素材库
      if (result.status === 'SUCCESS' && result.videoUrl) {
        await addMediaAsset({
          userId: user.id,
          type: 'video',
          url: result.videoUrl,
          prompt: id,
          title: `视频任务 ${id.slice(0, 8)}`,
          metadata: {
            taskId: id,
            coverUrl: result.coverUrl ?? null,
            source: 'studio/video',
          },
        })
      }

      res.json(result)
    } catch (err) {
      console.error('[api/studio/video/status] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '查询视频状态失败',
      })
    }
  }
)

// ---------------------------------------------------------------------
// POST /api/studio/article —— 流式生成文章（SSE）
// ---------------------------------------------------------------------

interface ArticleBody {
  topic?: unknown
  style?: unknown
  wordCount?: unknown
}

studioRouter.post(
  '/article',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    try {
      const body = req.body as ArticleBody
      const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
      const style = typeof body.style === 'string' ? body.style.trim() : ''
      const wordCount =
        typeof body.wordCount === 'number' ? body.wordCount : 800

      if (!topic) {
        res.status(400).json({ error: '缺少文章主题' })
        return
      }

      const prompt =
        `请写一篇${wordCount}字左右的搞笑文章。\n` +
        `主题：${topic}\n` +
        `风格：${style || '幽默风趣'}\n` +
        `要求：\n` +
        `1. 用原创幽默，不要引用网络热梗\n` +
        `2. 有观点、有反转、有笑点\n` +
        `3. 结构清晰，段落分明\n` +
        `4. 标题用 # 开头`

      const messages: ChatMessage[] = [{ role: 'user', content: prompt }]

      setSSEHeaders(res)

      const abortController = new AbortController()
      req.on('close', () => {
        if (!abortController.signal.aborted) {
          abortController.abort()
        }
      })

      let fullText = ''
      try {
        const gen = chatCompletionStream(messages, DEFAULT_STUDIO_AGENT, {
          signal: abortController.signal,
        })
        for await (const chunk of gen) {
          fullText += chunk
          sendEvent(res, 'token', { c: chunk })
        }

        // 保存为创意作品
        try {
          const work = await createCreativeWork(user.id, 'article', topic, {
            topic,
            style,
            wordCount,
          })
          await updateCreativeWork(work.id, {
            result: { article: fullText },
            status: 'done',
          })
        } catch {
          // 保存失败不影响流式输出
        }

        sendEvent(res, 'done', {})
      } catch (err) {
        sendEvent(res, 'error', {
          message: err instanceof Error ? err.message : '文章生成失败',
        })
      } finally {
        res.end()
      }
    } catch (err) {
      console.error('[api/studio/article] 异常：', err)
      if (res.headersSent) {
        sendEvent(res, 'error', { message: '服务器开小差了' })
        res.end()
      } else {
        res.status(500).json({ error: '服务器开小差了' })
      }
    }
  }
)

// ---------------------------------------------------------------------
// POST /api/studio/voice —— 语音合成
// ---------------------------------------------------------------------

interface VoiceBody {
  text?: unknown
  voice?: unknown
}

studioRouter.post('/voice', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const body = req.body as VoiceBody
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const voice = typeof body.voice === 'string' ? body.voice : undefined

    if (!text) {
      res.status(400).json({ error: '缺少语音文本' })
      return
    }

    const audioUrl = await generateSpeech(text, { voice })

    // 保存为创意作品
    try {
      const work = await createCreativeWork(user.id, 'voice', text.slice(0, 50), {
        text,
        voice,
      })
      await updateCreativeWork(work.id, {
        result: { audioUrl },
        status: 'done',
      })
    } catch {
      // 保存失败不影响返回
    }

    // 同步入库到素材库
    await addMediaAsset({
      userId: user.id,
      type: 'audio',
      url: audioUrl,
      prompt: text,
      title: text.slice(0, 50),
      metadata: { voice: voice ?? null, source: 'studio/voice' },
    })

    res.json({ audioUrl })
  } catch (err) {
    console.error('[api/studio/voice] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '语音生成失败',
    })
  }
})

// ---------------------------------------------------------------------
// 游戏存档（仅查看/删除，文字冒险入口已迁移至 vibe-code）
// ---------------------------------------------------------------------

// GET /api/studio/game/saves —— 列出存档
studioRouter.get(
  '/game/saves',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const saves = await listGameSaves(user.id)
      res.json({ saves })
    } catch (err) {
      console.error('[api/studio/game/saves GET] 异常：', err)
      res.status(500).json({ error: '服务器开小差了' })
    }
  }
)

// DELETE /api/studio/game/saves/:id —— 删除存档
studioRouter.delete(
  '/game/saves/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string
      await deleteGameSave(id)
      res.json({ success: true })
    } catch (err) {
      console.error('[api/studio/game/saves DELETE] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '删除存档失败',
      })
    }
  }
)
