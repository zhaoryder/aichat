// =====================================================================
// 排行榜 API
// ---------------------------------------------------------------------
// GET /api/leaderboard/agents - 智能体热度
// GET /api/leaderboard/users  - 用户活跃度
// GET /api/leaderboard/works  - 作品热度
// =====================================================================

import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET /api/leaderboard/agents - 智能体热度（按对话次数）
router.get('/agents', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('agent_id, agent_name, count')
      .order('count', { ascending: false })
      .limit(limit)

    if (error) throw error
    res.json({ leaderboard: data || [] })
  } catch (err) {
    console.error('[leaderboard/agents] error:', err)
    res.status(500).json({ error: '获取排行榜失败' })
  }
})

// GET /api/leaderboard/users - 用户活跃度
router.get('/users', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  try {
    // 按对话次数统计用户活跃度
    const { data, error } = await supabase
      .from('conversations')
      .select('user_id, count')
      .order('count', { ascending: false })
      .limit(limit)

    if (error) throw error
    res.json({ leaderboard: data || [] })
  } catch (err) {
    console.error('[leaderboard/users] error:', err)
    res.status(500).json({ error: '获取排行榜失败' })
  }
})

// GET /api/leaderboard/works - 作品热度
router.get('/works', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  try {
    const { data, error } = await supabase
      .from('creative_works')
      .select('*')
      .eq('is_public', true)
      .order('likes', { ascending: false })
      .limit(limit)

    if (error) throw error
    res.json({ leaderboard: data || [] })
  } catch (err) {
    console.error('[leaderboard/works] error:', err)
    res.status(500).json({ error: '获取排行榜失败' })
  }
})

export const leaderboardRouter = router
