// =====================================================================
// 成就系统 API
// ---------------------------------------------------------------------
// GET /api/achievements           - 获取所有成就定义
// GET /api/achievements/me         - 获取当前用户的成就进度
// POST /api/achievements/check     - 检查并发放成就（内部调用）
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { supabase } from '../lib/supabase'

const router = Router()

// GET /api/achievements - 获取所有成就定义
router.get('/', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .order('category', { ascending: true })

    if (error) throw error
    res.json({ achievements: data || [] })
  } catch (err) {
    console.error('[achievements] list error:', err)
    res.status(500).json({ error: '获取成就失败' })
  }
})

// GET /api/achievements/me - 获取当前用户的成就进度
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const { data, error } = await supabase
      .from('user_achievements')
      .select('*, achievements(*)')
      .eq('user_id', user.id)

    if (error) throw error
    res.json({ achievements: data || [] })
  } catch (err) {
    console.error('[achievements/me] error:', err)
    res.status(500).json({ error: '获取成就进度失败' })
  }
})

// 导出 checkAndGrantAchievement 函数供其他路由调用
export async function checkAndGrantAchievement(
  userId: string,
  code: string,
  progress: number = 1
): Promise<void> {
  try {
    // 获取成就定义
    const { data: achievement } = await supabase
      .from('achievements')
      .select('*')
      .eq('code', code)
      .single()

    if (!achievement) return

    // 获取或创建用户成就记录
    const { data: userAchievement } = await supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .eq('achievement_id', achievement.id)
      .single()

    if (userAchievement?.unlocked) return // 已解锁

    const newProgress = (userAchievement?.progress || 0) + progress
    const unlocked = newProgress >= achievement.threshold

    await supabase
      .from('user_achievements')
      .upsert({
        user_id: userId,
        achievement_id: achievement.id,
        progress: newProgress,
        unlocked,
        unlocked_at: unlocked ? new Date().toISOString() : null,
      }, { onConflict: 'user_id,achievement_id' })
  } catch (err) {
    console.error('[achievements] checkAndGrant error:', err)
  }
}

export const achievementsRouter = router
