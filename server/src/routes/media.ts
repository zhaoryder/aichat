// =====================================================================
// 个人素材库 API
// ---------------------------------------------------------------------
// 用户在创意工坊产生的图片 / 视频 / 音频会记录到这里，形成私有素材库。
//   GET    /api/media          列出当前用户的素材（分页 + 类型筛选 + 搜索）
//   POST   /api/media          新增一条素材记录
//   DELETE /api/media/:id      删除一条素材（仅作者可删）
// =====================================================================

import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { authMiddleware } from '../middleware/auth'

export const mediaRouter = Router()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

/** 合法的素材类型 */
const VALID_TYPES = ['image', 'video', 'audio'] as const
type MediaType = (typeof VALID_TYPES)[number]

/** 素材记录类型（与表结构对应） */
export interface MediaAsset {
  id: string
  user_id: string
  type: MediaType
  url: string
  prompt: string | null
  title: string | null
  project_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------
// GET /api/media —— 列出当前用户的素材
// ---------------------------------------------------------------------
// 查询参数：
//   page      页码（默认 1）
//   pageSize  每页数量（默认 20）
//   type      可选：image / video / audio
//   search    可选：在 prompt / title 中模糊匹配
// ---------------------------------------------------------------------

mediaRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.max(
      1,
      Math.min(parseInt(req.query.pageSize as string) || 20, 100),
    )
    const type = req.query.type as string | undefined
    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim()
        : ''

    let query = supabase
      .from('media_assets')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)

    if (type && (VALID_TYPES as readonly string[]).includes(type)) {
      query = query.eq('type', type)
    }

    if (search) {
      // 同时在 prompt 与 title 上做不区分大小写的模糊匹配
      const like = `%${search}%`
      query = query.or(`prompt.ilike.${like},title.ilike.${like}`)
    }

    // 排序 + 分页
    const from = (page - 1) * pageSize
    const to = page * pageSize - 1
    query = query.order('created_at', { ascending: false }).range(from, to)

    const { data, error, count } = await query

    if (error) throw error

    res.json({
      assets: (data as MediaAsset[]) || [],
      total: count ?? 0,
      page,
      pageSize,
    })
  } catch (err) {
    console.error('[media GET /] error:', err)
    res.status(500).json({ error: '获取素材列表失败' })
  }
})

// ---------------------------------------------------------------------
// POST /api/media —— 新增素材
// ---------------------------------------------------------------------

interface CreateMediaBody {
  type?: unknown
  url?: unknown
  prompt?: unknown
  title?: unknown
  project_id?: unknown
  metadata?: unknown
}

mediaRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const body = req.body as CreateMediaBody

    const type =
      typeof body.type === 'string' ? (body.type as MediaType) : null
    const url = typeof body.url === 'string' ? body.url.trim() : ''
    const prompt =
      typeof body.prompt === 'string' ? body.prompt.trim() : null
    const title =
      typeof body.title === 'string' ? body.title.trim() : null
    const projectId =
      typeof body.project_id === 'string' ? body.project_id : null
    const metadata =
      body.metadata && typeof body.metadata === 'object'
        ? (body.metadata as Record<string, unknown>)
        : {}

    if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
      res
        .status(400)
        .json({ error: 'type 必须为 image / video / audio 之一' })
      return
    }
    if (!url) {
      res.status(400).json({ error: 'url 不能为空' })
      return
    }

    const { data, error } = await supabase
      .from('media_assets')
      .insert({
        user_id: user.id,
        type,
        url,
        prompt,
        title,
        project_id: projectId,
        metadata,
      })
      .select()
      .single()

    if (error) throw error

    res.json({ asset: data as MediaAsset })
  } catch (err) {
    console.error('[media POST /] error:', err)
    res.status(500).json({ error: '保存素材失败' })
  }
})

// ---------------------------------------------------------------------
// DELETE /api/media/:id —— 删除素材
// ---------------------------------------------------------------------
// 安全：必须同时匹配 id 与 user_id，避免越权删除他人素材
// ---------------------------------------------------------------------

mediaRouter.delete(
  '/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const { id } = req.params
      if (!id) {
        res.status(400).json({ error: '缺少素材 ID' })
        return
      }

      const { error, count } = await supabase
        .from('media_assets')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) throw error

      // count === 0 表示没有命中（id 不存在或不属于该用户）
      if (!count || count === 0) {
        res.status(404).json({ error: '素材不存在或无权删除' })
        return
      }

      res.json({ success: true })
    } catch (err) {
      console.error('[media DELETE /:id] error:', err)
      res.status(500).json({ error: '删除素材失败' })
    }
  },
)
