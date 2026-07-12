// =====================================================================
// 用户 API
// ---------------------------------------------------------------------
// GET  /api/users/me                获取当前登录用户资料（UserProfile）
// PUT  /api/users/me                 更新自己的 nickname
// GET  /api/users/me/conversations   获取当前用户的对话列表
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import {
  getUserProfile,
  updateUserProfile,
  getUserConversations,
} from '../lib/queries'
import type { Profile, UserProfile } from '../../shared/types'

export const usersRouter = Router()

/**
 * 由 req.user（authMiddleware 注入）与 profile（DB 查询）合并构造 UserProfile。
 * id / email / role / points 来自 req.user；avatar_url / banned_until 来自 profile。
 * nickname 优先取 profile 中的最新值，回退到 req.user.nickname，再回退空串。
 */
function buildUserProfile(
  user: NonNullable<Request['user']>,
  profile: Profile | null
): UserProfile {
  const bannedUntil = profile?.banned_until ?? null
  const banned = !!(
    bannedUntil &&
    new Date(bannedUntil).getTime() > Date.now()
  )
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    nickname: profile?.nickname ?? user.nickname ?? '',
    avatar_url: profile?.avatar_url ?? null,
    banned,
    points: user.points,
  }
}

// ---------------------------------------------------------------------
// GET /api/users/me —— 获取当前登录用户资料
// ---------------------------------------------------------------------

usersRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const profile = await getUserProfile(user.id)
    res.json(buildUserProfile(user, profile))
  } catch (err) {
    console.error('[api/users/me GET] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// PUT /api/users/me —— 更新自己的 nickname
// ---------------------------------------------------------------------

interface UpdateProfileBody {
  nickname?: unknown
}

usersRouter.put('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const body = req.body as UpdateProfileBody
    const nickname =
      typeof body.nickname === 'string' ? body.nickname.trim() : ''

    if (!nickname) {
      res.status(400).json({ error: '昵称不能为空' })
      return
    }
    if (nickname.length > 30) {
      res.status(400).json({ error: '昵称最多 30 个字符' })
      return
    }

    await updateUserProfile(user.id, { nickname })

    // 重新拉取 profile，返回更新后的 UserProfile
    const profile = await getUserProfile(user.id)
    res.json(buildUserProfile(user, profile))
  } catch (err) {
    console.error('[api/users/me PUT] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/users/me/conversations —— 获取当前用户的对话列表
// ---------------------------------------------------------------------

usersRouter.get(
  '/me/conversations',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const conversations = await getUserConversations(user.id)
      res.json({ conversations })
    } catch (err) {
      console.error('[api/users/me/conversations] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)
