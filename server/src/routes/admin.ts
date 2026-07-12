// =====================================================================
// 管理员 API（全部需 authMiddleware + adminMiddleware，auth 先 admin 后）
// ---------------------------------------------------------------------
// GET  /api/admin/users            列出所有用户
// POST /api/admin/users/:id/ban    封禁用户至指定时间
// POST /api/admin/users/:id/unban  解封用户
// GET  /api/admin/reports          列出所有举报
// POST /api/admin/reports/:id      更新举报状态
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { adminMiddleware } from '../middleware/admin'
import {
  listUsers,
  banUser,
  unbanUser,
  listReports,
  updateReportStatus,
} from '../lib/queries'
import type { ReportStatus } from '../../shared/types'

export const adminRouter = Router()

// 所有 admin 路由均需登录 + 管理员权限（auth 先，admin 后）
adminRouter.use(authMiddleware, adminMiddleware)

/** 合法的举报状态 */
const VALID_REPORT_STATUSES = ['pending', 'resolved', 'ignored'] as const

// ---------------------------------------------------------------------
// GET /api/admin/users —— 列出所有用户
// ---------------------------------------------------------------------

adminRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await listUsers()
    res.json({ users })
  } catch (err) {
    console.error('[api/admin/users] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/admin/users/:id/ban —— 封禁用户至指定时间
// ---------------------------------------------------------------------

interface BanBody {
  until?: unknown
}

adminRouter.post('/users/:id/ban', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const body = req.body as BanBody
    const untilStr =
      typeof body.until === 'string' ? body.until.trim() : ''

    if (!untilStr) {
      res.status(400).json({ error: '缺少封禁截止时间' })
      return
    }

    const until = new Date(untilStr)
    if (isNaN(until.getTime())) {
      res.status(400).json({ error: '封禁截止时间格式无效' })
      return
    }

    await banUser(id, until)
    res.json({ success: true })
  } catch (err) {
    console.error('[api/admin/users/:id/ban] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/admin/users/:id/unban —— 解封用户
// ---------------------------------------------------------------------

adminRouter.post('/users/:id/unban', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    await unbanUser(id)
    res.json({ success: true })
  } catch (err) {
    console.error('[api/admin/users/:id/unban] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/admin/reports —— 列出所有举报
// ---------------------------------------------------------------------

adminRouter.get('/reports', async (_req: Request, res: Response) => {
  try {
    const reports = await listReports()
    res.json({ reports })
  } catch (err) {
    console.error('[api/admin/reports] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/admin/reports/:id —— 更新举报状态
// ---------------------------------------------------------------------

interface UpdateReportBody {
  status?: unknown
}

adminRouter.post('/reports/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const body = req.body as UpdateReportBody
    const status = typeof body.status === 'string' ? body.status : ''

    if (!(VALID_REPORT_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({
        error: '举报状态必须为 pending / resolved / ignored',
      })
      return
    }

    await updateReportStatus(id, status as ReportStatus)
    res.json({ success: true })
  } catch (err) {
    console.error('[api/admin/reports/:id] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})
