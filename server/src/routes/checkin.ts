// =====================================================================
// 每日签到 API
// ---------------------------------------------------------------------
// POST /api/checkin        执行每日签到
// GET  /api/checkin/list   列出当前用户的签到记录
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { checkin, listCheckins } from '../lib/queries'

export const checkinRouter = Router()

// ---------------------------------------------------------------------
// POST /api/checkin —— 执行每日签到
// ---------------------------------------------------------------------

checkinRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const result = await checkin(user.id)
    res.json(result)
  } catch (err) {
    console.error('[api/checkin POST] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/checkin/list —— 列出当前用户的签到记录
// ---------------------------------------------------------------------

checkinRouter.get(
  '/list',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const checkins = await listCheckins(user.id)
      res.json({ checkins })
    } catch (err) {
      console.error('[api/checkin/list] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)
