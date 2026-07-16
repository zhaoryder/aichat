// =====================================================================
// Sandbox 快照分享 API（Batch D - D8）
// ---------------------------------------------------------------------
//   POST   /api/sandbox/snapshot            创建快照（生成分享 slug）
//   GET    /api/sandbox/:slug                公开读取分享的快照
//   GET    /api/sandbox/me                   列出我的快照
//   DELETE /api/sandbox/:id                  删除快照（仅所有者）
// =====================================================================

import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { authMiddleware } from '../middleware/auth'
import { supabase } from '../lib/supabase'

export const sandboxRouter = Router()

// ---------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------

/** 沙箱快照中的单个文件条目（前端 WebContainer 上传） */
interface SandboxFileEntry {
  path: string
  content?: string
  type: 'file' | 'directory'
}

/** 创建快照请求体 */
interface CreateSnapshotBody {
  title?: unknown
  description?: unknown
  files?: unknown
  previewHtml?: unknown
  authorName?: unknown
  /** 若提供则用指定 slug；否则后端自动生成短 slug */
  shareSlug?: unknown
}

/** 数据库行结构（与 upgrade-sandbox.sql 表对应） */
interface SandboxSnapshotRow {
  id: string
  owner_id: string | null
  title: string | null
  description: string | null
  files: SandboxFileEntry[] | null
  preview_html: string | null
  share_slug: string | null
  view_count: number
  author_name: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------

/** 生成 8 位短 slug（base36，足够避免冲突且 URL 友好） */
function generateShortSlug(): string {
  const uuid = randomUUID().replace(/-/g, '')
  // 取前 12 个十六进制字符，转成 base36 进一步压缩
  const num = parseInt(uuid.slice(0, 12), 16)
  return num.toString(36).padStart(8, '0').slice(-10)
}

// ---------------------------------------------------------------------
// POST /api/sandbox/snapshot —— 创建快照
// ---------------------------------------------------------------------

sandboxRouter.post(
  '/snapshot',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const body = req.body as CreateSnapshotBody

    // 校验 files：必须是数组（允许空数组但建议有内容）
    const files = Array.isArray(body.files) ? (body.files as SandboxFileEntry[]) : []
    // 简单验证：每个条目必须有 path 和 type
    const validFiles = files.filter(
      (f) =>
        f &&
        typeof f === 'object' &&
        typeof f.path === 'string' &&
        (f.type === 'file' || f.type === 'directory'),
    )

    if (validFiles.length === 0) {
      res.status(400).json({ error: 'files 不能为空，至少需要一个文件' })
      return
    }

    const title =
      typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '未命名沙箱'
    const description =
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null
    const previewHtml =
      typeof body.previewHtml === 'string' && body.previewHtml ? body.previewHtml : null
    const authorName =
      typeof body.authorName === 'string' && body.authorName.trim()
        ? body.authorName.trim()
        : user.nickname ?? null

    // share_slug：用户提供则用，否则自动生成；确保唯一
    let shareSlug =
      typeof body.shareSlug === 'string' && body.shareSlug.trim()
        ? body.shareSlug.trim()
        : generateShortSlug()

    // 若 slug 冲突则重试最多 5 次
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase
        .from('sandbox_snapshots')
        .select('id')
        .eq('share_slug', shareSlug)
        .maybeSingle()
      if (!existing) break
      shareSlug = generateShortSlug()
    }

    try {
      const { data, error } = await supabase
        .from('sandbox_snapshots')
        .insert({
          owner_id: user.id,
          title,
          description,
          files: validFiles as unknown as Record<string, unknown>,
          preview_html: previewHtml,
          share_slug: shareSlug,
          author_name: authorName,
        })
        .select('*')
        .single()

      if (error || !data) {
        console.error('[api/sandbox create] error:', error)
        res.status(500).json({
          error: error?.message ?? '创建沙箱快照失败',
        })
        return
      }

      const row = data as SandboxSnapshotRow
      res.json({
        snapshot: {
          id: row.id,
          title: row.title,
          description: row.description,
          files: row.files,
          previewHtml: row.preview_html,
          shareSlug: row.share_slug,
          viewCount: row.view_count,
          authorName: row.author_name,
          createdAt: row.created_at,
        },
        // 分享 URL（前端拼 host）
        shareUrl: `/share/sandbox/${row.share_slug}`,
      })
    } catch (err) {
      console.error('[api/sandbox create] unexpected:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '创建沙箱快照失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// GET /api/sandbox/me —— 列出我的快照（仅所有者）
// ---------------------------------------------------------------------
// 注意：必须放在 GET /:slug 之前，否则 "me" 会被 :slug 捕获

sandboxRouter.get(
  '/me',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    try {
      const { data, error } = await supabase
        .from('sandbox_snapshots')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[api/sandbox list] error:', error)
        res.status(500).json({ error: error.message })
        return
      }

      const rows = (data ?? []) as SandboxSnapshotRow[]
      const snapshots = rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        previewHtml: row.preview_html,
        shareSlug: row.share_slug,
        viewCount: row.view_count,
        authorName: row.author_name,
        createdAt: row.created_at,
      }))

      res.json({ snapshots })
    } catch (err) {
      console.error('[api/sandbox list] unexpected:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '列出快照失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// GET /api/sandbox/:slug —— 公开读取分享的快照
// ---------------------------------------------------------------------
// 注意：无需 authMiddleware，匿名访客可访问；调用 RPC 累加 view_count

sandboxRouter.get('/:slug', async (req: Request, res: Response) => {
  const slug = req.params.slug as string

  if (!slug) {
    res.status(400).json({ error: '缺少 slug 参数' })
    return
  }

  try {
    // 调用 RPC 原子地累加浏览次数并返回快照行
    const { data, error } = await supabase
      .rpc('increment_sandbox_view_count', { p_share_slug: slug })
      .single()

    if (error || !data) {
      // 未找到快照：返回 404
      res.status(404).json({ error: '沙箱快照不存在或已被删除' })
      return
    }

    const row = data as SandboxSnapshotRow
    res.json({
      snapshot: {
        id: row.id,
        title: row.title,
        description: row.description,
        files: row.files,
        previewHtml: row.preview_html,
        shareSlug: row.share_slug,
        viewCount: row.view_count,
        authorName: row.author_name,
        createdAt: row.created_at,
      },
    })
  } catch (err) {
    console.error('[api/sandbox get] unexpected:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '获取沙箱快照失败',
    })
  }
})

// ---------------------------------------------------------------------
// DELETE /api/sandbox/:id —— 删除快照（仅所有者）
// ---------------------------------------------------------------------
// 注意：此路由需匹配 :id（uuid），但 GET /:slug 也匹配，所以放最后且做 uuid 校验

sandboxRouter.delete(
  '/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const id = req.params.id as string

    // 校验 id 是 uuid 格式（避免与 share_slug 混淆）
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      res.status(400).json({ error: 'id 格式无效（应为 uuid）' })
      return
    }

    try {
      const { data, error } = await supabase
        .from('sandbox_snapshots')
        .delete()
        .eq('id', id)
        .eq('owner_id', user.id)
        .select('id')
        .maybeSingle()

      if (error) {
        console.error('[api/sandbox delete] error:', error)
        res.status(500).json({ error: error.message })
        return
      }

      if (!data) {
        res.status(404).json({ error: '快照不存在或无权操作' })
        return
      }

      res.json({ success: true })
    } catch (err) {
      console.error('[api/sandbox delete] unexpected:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '删除快照失败',
      })
    }
  },
)
