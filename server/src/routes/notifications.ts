// =====================================================================
// 通知系统 API
// ---------------------------------------------------------------------
// GET  /api/notifications      — 通知列表（含未读数）
// PATCH /api/notifications/read — 标记已读
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { supabase } from '../lib/supabase'

export const notificationsRouter = Router()

// GET /api/notifications — 通知列表
notificationsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = 30
    const offset = (page - 1) * pageSize

    const { data: notifications, count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    // 批量查 actor 信息
    const actorIds = [...new Set(notifications?.map((n) => n.actor_id).filter(Boolean) ?? [])]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .in('id', actorIds as string[])
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])

    const enriched = (notifications ?? []).map((n) => ({
      ...n,
      actor: n.actor_id ? (profileMap.get(n.actor_id) ?? null) : null,
    }))

    // 查未读数
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    res.json({
      notifications: enriched,
      total: count ?? 0,
      unread: unreadCount ?? 0,
      page,
      hasMore: enriched.length === pageSize,
    })
  } catch (err) {
    console.error('[api/notifications] error:', err)
    res.status(500).json({ error: '获取通知失败' })
  }
})

// PATCH /api/notifications/read — 标记已读
notificationsRouter.patch('/read', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { ids } = req.body as { ids?: string[] }

    let query = supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (ids && Array.isArray(ids) && ids.length > 0) {
      query = query.in('id', ids)
    }

    const { error } = await query
    if (error) throw error

    res.json({ success: true })
  } catch (err) {
    console.error('[api/notifications/read] error:', err)
    res.status(500).json({ error: '标记已读失败' })
  }
})

// GET /api/notifications/unread-count — 仅查未读数
notificationsRouter.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    res.json({ unread: count ?? 0 })
  } catch (err) {
    console.error('[api/notifications/unread-count] error:', err)
    res.status(500).json({ error: '获取未读数失败' })
  }
})
