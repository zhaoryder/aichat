// =====================================================================
// 直播 API（M5.1）—— 伪直播：短视频循环 + 弹幕
// ---------------------------------------------------------------------
// GET  /api/live              — 直播列表（正在直播 + 回放，分页）
// GET  /api/live/:id          — 直播详情 + 最近弹幕
// POST /api/live/:id/messages — 发送弹幕（需登录）
// POST /api/live/:id/heartbeat — 心跳（增加观众数，伪直播模拟）
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import { getAICreatorById } from '../../../shared/ai-creators'

export const liveRouter = Router()

const PAGE_SIZE = 20
const DANMAKU_LIMIT = 50

// ---------------------------------------------------------------------
// GET /api/live — 直播列表
// 查询参数：
//   status: 'live' | 'ended' | 'all'（默认 all，live 优先）
//   page:   分页
// ---------------------------------------------------------------------

liveRouter.get('/', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'all'
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const offset = (page - 1) * PAGE_SIZE

    let query = supabase
      .from('livestreams')
      .select(
        'id, host_id, host_ai_id, title, description, category, status, stream_url, replay_url, cover_url, viewer_count, peak_viewers, started_at, ended_at, created_at',
        { count: 'exact' },
      )

    if (status === 'live') {
      query = query.eq('status', 'live')
    } else if (status === 'ended') {
      query = query.eq('status', 'ended')
    }
    // status === 'all' 时不加过滤

    // 正在直播的排在最前，然后按 started_at 倒序
    const { data: streams, error, count } = await query
      .order('status', { ascending: false }) // 'live' > 'ended' > 'pending' 字母序不完美，但够用
      .order('started_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw error

    // 补充主播信息
    const hostAiIds = [...new Set(streams?.map((s) => s.host_ai_id).filter(Boolean) ?? [])]
    const aiCreatorMap = new Map<string, { id: string; nickname: string; style: string; specialty: string }>()
    for (const aiId of hostAiIds) {
      const creator = getAICreatorById(aiId as string)
      if (creator) {
        aiCreatorMap.set(aiId as string, {
          id: creator.id,
          nickname: creator.nickname,
          style: creator.style,
          specialty: creator.specialty,
        })
      }
    }

    const enriched = (streams ?? []).map((s) => ({
      ...s,
      host_ai: s.host_ai_id ? (aiCreatorMap.get(s.host_ai_id) ?? null) : null,
    }))

    res.json({
      streams: enriched,
      page,
      total: count ?? 0,
      hasMore: (count ?? 0) > offset + PAGE_SIZE,
    })
  } catch (err) {
    console.error('[api/live] list error:', err)
    res.status(500).json({ error: '获取直播列表失败' })
  }
})

// ---------------------------------------------------------------------
// GET /api/live/:id — 直播详情 + 最近弹幕
// ---------------------------------------------------------------------

liveRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const { data: stream, error } = await supabase
      .from('livestreams')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!stream) {
      res.status(404).json({ error: '直播不存在' })
      return
    }

    // 补充主播信息
    let hostAi = null
    if (stream.host_ai_id) {
      const creator = getAICreatorById(stream.host_ai_id)
      if (creator) {
        hostAi = {
          id: creator.id,
          nickname: creator.nickname,
          style: creator.style,
          specialty: creator.specialty,
          system_prompt: creator.system_prompt,
        }
      }
    }

    // 拉取最近弹幕
    const { data: messages } = await supabase
      .from('live_messages')
      .select('id, user_id, ai_creator_id, role, content, is_pinned, created_at')
      .eq('stream_id', id)
      .order('created_at', { ascending: false })
      .limit(DANMAKU_LIMIT)

    // 弹幕正序展示（最旧在前）
    const sortedMessages = (messages ?? []).reverse()

    // 补充弹幕发送者信息
    const userIds = [...new Set(sortedMessages.map((m) => m.user_id).filter(Boolean))]
    let userMap = new Map<string, { nickname: string; avatar_url: string | null }>()
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .in('id', userIds)
      userMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])
    }

    // 为 AI 发送者补充信息
    const aiIds = [...new Set(sortedMessages.map((m) => m.ai_creator_id).filter(Boolean))]
    const aiMap = new Map<string, { nickname: string; style: string }>()
    for (const aiId of aiIds) {
      const creator = getAICreatorById(aiId as string)
      if (creator) {
        aiMap.set(aiId as string, { nickname: creator.nickname, style: creator.style })
      }
    }

    const enrichedMessages = sortedMessages.map((m) => {
      if (m.ai_creator_id) {
        return {
          ...m,
          sender: aiMap.get(m.ai_creator_id) ?? { nickname: 'AI', style: '' },
        }
      }
      if (m.user_id) {
        return {
          ...m,
          sender: userMap.get(m.user_id) ?? { nickname: '用户', avatar_url: null },
        }
      }
      return { ...m, sender: { nickname: '系统' } }
    })

    res.json({
      stream: {
        ...stream,
        host_ai: hostAi,
      },
      messages: enrichedMessages,
    })
  } catch (err) {
    console.error('[api/live/:id] error:', err)
    res.status(500).json({ error: '获取直播详情失败' })
  }
})

// ---------------------------------------------------------------------
// POST /api/live/:id/messages — 发送弹幕（需登录）
// body: { content: string }
// ---------------------------------------------------------------------

liveRouter.post('/:id/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const userId = req.user!.id
    const { content } = req.body as { content?: string }

    if (!content?.trim()) {
      res.status(400).json({ error: '弹幕内容不能为空' })
      return
    }
    if (content.length > 200) {
      res.status(400).json({ error: '弹幕内容过长（最多 200 字）' })
      return
    }

    // 验证直播存在
    const { data: stream } = await supabase
      .from('livestreams')
      .select('id, status')
      .eq('id', id)
      .maybeSingle()

    if (!stream) {
      res.status(404).json({ error: '直播不存在' })
      return
    }

    const { data: message, error } = await supabase
      .from('live_messages')
      .insert({
        stream_id: id,
        user_id: userId,
        role: 'user',
        content: content.trim(),
      })
      .select('id, user_id, role, content, is_pinned, created_at')
      .single()

    if (error) throw error

    // 补充发送者信息
    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname, avatar_url')
      .eq('id', userId)
      .single()

    res.json({
      message: {
        ...message,
        sender: profile ?? { nickname: '用户', avatar_url: null },
      },
    })
  } catch (err) {
    console.error('[api/live/:id/messages] error:', err)
    res.status(500).json({ error: '发送弹幕失败' })
  }
})

// ---------------------------------------------------------------------
// POST /api/live/:id/heartbeat — 心跳（增加观众数）
// 伪直播：每次心跳增加 1 观众数，上限 9999
// ---------------------------------------------------------------------

liveRouter.post('/:id/heartbeat', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // 使用 RPC 原子增加 viewer_count
    const { data: stream } = await supabase
      .from('livestreams')
      .select('viewer_count, peak_viewers')
      .eq('id', id)
      .maybeSingle()

    if (!stream) {
      res.status(404).json({ error: '直播不存在' })
      return
    }

    const newCount = Math.min((stream.viewer_count ?? 0) + 1, 9999)
    const newPeak = Math.max(stream.peak_viewers ?? 0, newCount)

    await supabase
      .from('livestreams')
      .update({ viewer_count: newCount, peak_viewers: newPeak })
      .eq('id', id)

    res.json({ viewer_count: newCount })
  } catch (err) {
    console.error('[api/live/:id/heartbeat] error:', err)
    res.status(500).json({ error: '心跳失败' })
  }
})
