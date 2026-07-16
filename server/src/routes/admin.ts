// =====================================================================
// 管理员 API（全部需 authMiddleware + adminMiddleware，auth 先 admin 后）
// ---------------------------------------------------------------------
// GET  /api/admin/users            列出所有用户
// POST /api/admin/users/:id/ban    封禁用户至指定时间
// POST /api/admin/users/:id/unban  解封用户
// GET  /api/admin/reports          列出所有举报
// POST /api/admin/reports/:id      更新举报状态
// GET  /api/admin/posts            列出所有帖子（内容运营）
// POST /api/admin/posts/:id/pin    置顶帖子
// POST /api/admin/posts/:id/unpin  取消置顶
// POST /api/admin/posts/:id/promote    推流帖子（带时长）
// POST /api/admin/posts/:id/unpromote  取消推流
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
import { supabase } from '../lib/supabase'
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

// =====================================================================
// 内容运营（M9.1）—— 帖子管理：列表 + 置顶 + 推流
// =====================================================================

/** 默认推流时长（小时） */
const DEFAULT_PROMOTE_HOURS = 24

/** 推流时长上限（小时）—— 防止误操作设置过长 */
const MAX_PROMOTE_HOURS = 24 * 30 // 30 天

// ---------------------------------------------------------------------
// GET /api/admin/posts —— 列出所有帖子（支持分页 + 类型 + 置顶/推流过滤）
// ---------------------------------------------------------------------

interface AdminPostsQuery {
  page?: string
  limit?: string
  type?: string
  pinned?: string
  promoted?: string
}

adminRouter.get('/posts', async (req: Request, res: Response) => {
  try {
    const q = req.query as AdminPostsQuery
    const page = Math.max(1, parseInt(q.page ?? '1') || 1)
    const limit = Math.min(50, Math.max(1, parseInt(q.limit ?? '20') || 20))
    const offset = (page - 1) * limit

    let query = supabase
      .from('posts')
      .select(
        'id, user_id, ai_creator_id, type, content, metadata, is_pinned, is_promoted, promoted_until, created_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })

    if (q.type) {
      query = query.eq('type', q.type)
    }
    if (q.pinned === 'true') {
      query = query.eq('is_pinned', true)
    }
    if (q.promoted === 'true') {
      query = query.eq('is_promoted', true)
    }

    const { data: posts, error, count } = await query.range(offset, offset + limit - 1)
    if (error) throw error

    res.json({
      posts: posts ?? [],
      page,
      limit,
      total: count ?? 0,
      hasMore: (count ?? 0) > offset + limit,
    })
  } catch (err) {
    console.error('[api/admin/posts] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '获取帖子列表失败',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/admin/posts/:id/pin —— 置顶帖子
// ---------------------------------------------------------------------

adminRouter.post('/posts/:id/pin', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const { error } = await supabase
      .from('posts')
      .update({ is_pinned: true })
      .eq('id', id)
    if (error) throw error
    res.json({ success: true, id, is_pinned: true })
  } catch (err) {
    console.error('[api/admin/posts/:id/pin] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '置顶失败',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/admin/posts/:id/unpin —— 取消置顶
// ---------------------------------------------------------------------

adminRouter.post('/posts/:id/unpin', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const { error } = await supabase
      .from('posts')
      .update({ is_pinned: false })
      .eq('id', id)
    if (error) throw error
    res.json({ success: true, id, is_pinned: false })
  } catch (err) {
    console.error('[api/admin/posts/:id/unpin] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '取消置顶失败',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/admin/posts/:id/promote —— 推流帖子（带时长）
// body: { hours?: number }  默认 24 小时，上限 30 天
// ---------------------------------------------------------------------

interface PromoteBody {
  hours?: unknown
}

adminRouter.post('/posts/:id/promote', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const body = req.body as PromoteBody
    const hours =
      typeof body.hours === 'number' && body.hours > 0
        ? Math.min(body.hours, MAX_PROMOTE_HOURS)
        : DEFAULT_PROMOTE_HOURS

    const promotedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

    const { error } = await supabase
      .from('posts')
      .update({
        is_promoted: true,
        promoted_until: promotedUntil,
      })
      .eq('id', id)
    if (error) throw error
    res.json({
      success: true,
      id,
      is_promoted: true,
      promoted_until: promotedUntil,
      hours,
    })
  } catch (err) {
    console.error('[api/admin/posts/:id/promote] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '推流失败',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/admin/posts/:id/unpromote —— 取消推流
// ---------------------------------------------------------------------

adminRouter.post('/posts/:id/unpromote', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const { error } = await supabase
      .from('posts')
      .update({
        is_promoted: false,
        promoted_until: null,
      })
      .eq('id', id)
    if (error) throw error
    res.json({ success: true, id, is_promoted: false })
  } catch (err) {
    console.error('[api/admin/posts/:id/unpromote] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '取消推流失败',
    })
  }
})
