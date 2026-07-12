// =====================================================================
// 排行榜 API
// ---------------------------------------------------------------------
// GET /api/leaderboard/agents - 智能体热度（按对话次数）
// GET /api/leaderboard/users  - 用户活跃度（按对话次数）
// GET /api/leaderboard/works  - 作品热度（按创建时间）
// =====================================================================

import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { agents } from '../../shared/agents'

const router = Router()
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// 构建 agent_id → name 映射
const agentNameMap = new Map<string, string>(agents.map((a) => [a.id, a.name]))

// GET /api/leaderboard/agents - 智能体热度（按对话次数，内存聚合）
router.get('/agents', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  try {
    // 查询所有 conversations（限制 10000 条，足够排行榜用）
    const { data, error } = await supabase
      .from('conversations')
      .select('agent_id')
      .limit(10000)

    if (error) throw error

    // 内存中按 agent_id 计数
    const counts = new Map<string, number>()
    for (const row of data || []) {
      const id = row.agent_id as string
      counts.set(id, (counts.get(id) || 0) + 1)
    }

    // 转为数组并排序
    const leaderboard = Array.from(counts.entries())
      .map(([agent_id, count]) => ({
        agent_id,
        agent_name: agentNameMap.get(agent_id) || agent_id,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    res.json({ leaderboard })
  } catch (err) {
    console.error('[leaderboard/agents] error:', err)
    res.status(500).json({ error: '获取排行榜失败' })
  }
})

// GET /api/leaderboard/users - 用户活跃度（按对话次数，内存聚合）
router.get('/users', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('user_id')
      .limit(10000)

    if (error) throw error

    // 内存中按 user_id 计数
    const counts = new Map<string, number>()
    for (const row of data || []) {
      const id = row.user_id as string
      counts.set(id, (counts.get(id) || 0) + 1)
    }

    // 获取用户昵称
    const userIds = Array.from(counts.keys())
    let userMap = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nickname')
        .in('id', userIds)
      for (const p of profiles || []) {
        userMap.set(p.id, p.nickname || '匿名用户')
      }
    }

    const leaderboard = Array.from(counts.entries())
      .map(([user_id, count]) => ({
        user_id,
        nickname: userMap.get(user_id) || '匿名用户',
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    res.json({ leaderboard })
  } catch (err) {
    console.error('[leaderboard/users] error:', err)
    res.status(500).json({ error: '获取排行榜失败' })
  }
})

// GET /api/leaderboard/works - 作品热度（按创建时间，creative_works 无 likes 列）
router.get('/works', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  try {
    const { data, error } = await supabase
      .from('creative_works')
      .select('id, type, title, status, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    res.json({ leaderboard: data || [] })
  } catch (err) {
    console.error('[leaderboard/works] error:', err)
    res.status(500).json({ error: '获取排行榜失败' })
  }
})

export const leaderboardRouter = router
