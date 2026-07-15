// =====================================================================
// 关注系统 API
// ---------------------------------------------------------------------
// POST /api/follow/:targetId      — 关注 / 取关用户
// POST /api/follow/agent/:agentId — 关注 / 取关智能体
// GET  /api/follow/followers/:userId — 粉丝列表
// GET  /api/follow/following/:userId  — 关注列表
// GET  /api/follow/status/:targetId  — 检查是否已关注
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { supabase } from '../lib/supabase'

export const followRouter = Router()

// POST /api/follow/:targetId — 关注 / 取关用户
followRouter.post('/:targetId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { targetId } = req.params
    const userId = req.user!.id

    if (targetId === userId) {
      res.status(400).json({ error: '不能关注自己' })
      return
    }

    // 检查是否已关注
    const { data: existing } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('followee_id', targetId)
      .eq('followee_type', 'user')
      .single()

    if (existing) {
      // 取消关注
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', userId)
        .eq('followee_id', targetId)
        .eq('followee_type', 'user')
      res.json({ following: false })
    } else {
      // 关注
      await supabase.from('follows').insert({
        follower_id: userId,
        followee_id: targetId,
        followee_type: 'user',
      })

      // 创建通知
      await supabase.from('notifications').insert({
        user_id: targetId,
        type: 'follow',
        actor_id: userId,
        target_id: userId,
        target_type: 'user',
      })

      res.json({ following: true })
    }
  } catch (err) {
    console.error('[api/follow] error:', err)
    res.status(500).json({ error: '操作失败' })
  }
})

// POST /api/follow/agent/:agentId — 关注 / 取关智能体
followRouter.post('/agent/:agentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params
    const userId = req.user!.id

    const { data: existing } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('agent_id', agentId)
      .single()

    if (existing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', userId)
        .eq('agent_id', agentId)
      res.json({ following: false })
    } else {
      await supabase.from('follows').insert({
        follower_id: userId,
        followee_type: 'agent',
        agent_id: agentId,
      })
      res.json({ following: true })
    }
  } catch (err) {
    console.error('[api/follow/agent] error:', err)
    res.status(500).json({ error: '操作失败' })
  }
})

// GET /api/follow/followers/:userId — 粉丝列表
followRouter.get('/followers/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = 50
    const offset = (page - 1) * pageSize

    const { data: follows, count } = await supabase
      .from('follows')
      .select('follower_id', { count: 'exact' })
      .eq('followee_id', userId)
      .eq('followee_type', 'user')
      .range(offset, offset + pageSize - 1)

    const followerIds = follows?.map((f) => f.follower_id) ?? []
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .in('id', followerIds)

    res.json({ followers: profiles ?? [], total: count ?? 0 })
  } catch (err) {
    console.error('[api/follow/followers] error:', err)
    res.status(500).json({ error: '获取粉丝列表失败' })
  }
})

// GET /api/follow/following/:userId — 关注列表
followRouter.get('/following/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = 50
    const offset = (page - 1) * pageSize

    const { data: follows, count } = await supabase
      .from('follows')
      .select('followee_id, agent_id', { count: 'exact' })
      .eq('follower_id', userId)
      .range(offset, offset + pageSize - 1)

    const followeeIds = follows?.map((f) => f.followee_id).filter(Boolean) ?? []
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .in('id', followeeIds as string[])

    const agentIds = follows?.map((f) => f.agent_id).filter(Boolean) ?? []
    const { getAgentById } = await import('../../shared/agents')
    const agents = (agentIds as string[]).map((aid) => {
      const a = getAgentById(aid)
      return a ? { id: a.id, name: a.name, era: a.era, avatarGradient: a.avatarGradient } : null
    }).filter(Boolean)

    res.json({ following: profiles ?? [], followingAgents: agents, total: count ?? 0 })
  } catch (err) {
    console.error('[api/follow/following] error:', err)
    res.status(500).json({ error: '获取关注列表失败' })
  }
})

// GET /api/follow/status/:targetId — 检查是否已关注
followRouter.get('/status/:targetId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { targetId } = req.params
    const userId = req.user!.id

    const { data: existing } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('followee_id', targetId)
      .eq('followee_type', 'user')
      .single()

    res.json({ following: !!existing })
  } catch (err) {
    console.error('[api/follow/status] error:', err)
    res.status(500).json({ error: '查询失败' })
  }
})

// GET /api/follow/stats/:userId — 获取关注数和粉丝数
followRouter.get('/stats/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params

    const { count: followingCount } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', userId)
      .eq('followee_type', 'user')

    const { count: followersCount } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('followee_id', userId)
      .eq('followee_type', 'user')

    res.json({
      following: followingCount ?? 0,
      followers: followersCount ?? 0,
    })
  } catch (err) {
    console.error('[api/follow/stats] error:', err)
    res.status(500).json({ error: '获取关注数据失败' })
  }
})
