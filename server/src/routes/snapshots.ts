// =====================================================================
// 云端项目快照仓库 API（Task 7.2）
// ---------------------------------------------------------------------
//   POST   /api/snapshots                  创建快照
//   GET    /api/snapshots?projectId=&branch=  列出时间线
//   POST   /api/snapshots/:id/restore       回退到指定快照（新建快照）
//   GET    /api/snapshots/:id/diff?compareId=  返回两份快照的行级 diff
//   POST   /api/snapshots/:id/share         生成只读分享链接（简化版）
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import {
  createSnapshot,
  listSnapshots,
  getSnapshot,
  restoreSnapshot,
} from '../lib/queries'

export const snapshotsRouter = Router()

// ---------------------------------------------------------------------
// POST /api/snapshots —— 创建快照
// ---------------------------------------------------------------------

interface CreateSnapshotBody {
  projectId?: unknown
  code?: unknown
  label?: unknown
  parentId?: unknown
  branch?: unknown
}

snapshotsRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  const body = req.body as CreateSnapshotBody

  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
  const code = typeof body.code === 'string' ? body.code : ''
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null
  const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null
  const branch = typeof body.branch === 'string' && body.branch.trim() ? body.branch.trim() : 'main'

  if (!projectId || !code) {
    res.status(400).json({ error: 'projectId 和 code 不能为空' })
    return
  }

  try {
    const snapshot = await createSnapshot({
      projectId,
      userId: user.id,
      code,
      label,
      parentId,
      branch,
    })
    res.json({ snapshot })
  } catch (err) {
    console.error('[api/snapshots create] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '创建快照失败',
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/snapshots?projectId=...&branch=... —— 列出时间线
// ---------------------------------------------------------------------

snapshotsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  const projectId =
    typeof req.query.projectId === 'string' ? req.query.projectId.trim() : ''
  const branch =
    typeof req.query.branch === 'string' && req.query.branch.trim()
      ? req.query.branch.trim()
      : undefined

  if (!projectId) {
    res.status(400).json({ error: '缺少 projectId 参数' })
    return
  }

  try {
    const snapshots = await listSnapshots(projectId, user.id, branch)
    res.json({ snapshots })
  } catch (err) {
    console.error('[api/snapshots list] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '列出快照失败',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/snapshots/:id/restore —— 回退（基于该快照创建新快照）
// ---------------------------------------------------------------------

snapshotsRouter.post(
  '/:id/restore',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const id = req.params.id as string

    try {
      const snapshot = await restoreSnapshot(id, user.id)
      res.json({ snapshot })
    } catch (err) {
      console.error('[api/snapshots restore] error:', err)
      const message = err instanceof Error ? err.message : '回退失败'
      // restoreSnapshot 找不到快照时抛出 "快照不存在或无权访问"
      if (message.includes('不存在')) {
        res.status(404).json({ error: message })
        return
      }
      res.status(500).json({ error: message })
    }
  }
)

// ---------------------------------------------------------------------
// GET /api/snapshots/:id/diff?compareId=... —— 返回 diff
// ---------------------------------------------------------------------

interface DiffResult {
  added: string[]
  removed: string[]
  unchanged: number
}

/** 简单的行级 diff：基于 LCS 计算 added / removed / unchanged */
function computeDiff(baseCode: string, compareCode: string): DiffResult {
  const baseLines = baseCode.split('\n')
  const compareLines = compareCode.split('\n')

  // 为避免大文件 OOM，限制 diff 最多处理前 3000 行
  const maxLines = 3000
  const a = baseLines.slice(0, maxLines)
  const b = compareLines.slice(0, maxLines)
  const m = a.length
  const n = b.length

  // LCS dp（使用 Uint16Array 节省内存；3000*3000*2B ≈ 18MB）
  const stride = n + 1
  const dp = new Uint16Array((m + 1) * stride)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i * stride + j] = dp[(i - 1) * stride + (j - 1)] + 1
      } else {
        const up = dp[(i - 1) * stride + j]
        const left = dp[i * stride + (j - 1)]
        dp[i * stride + j] = up >= left ? up : left
      }
    }
  }

  // 回溯找出 added / removed / unchanged
  const added: string[] = []
  const removed: string[] = []
  let unchanged = 0
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      unchanged++
      i--
      j--
    } else if (dp[(i - 1) * stride + j] >= dp[i * stride + (j - 1)]) {
      removed.push(a[i - 1])
      i--
    } else {
      added.push(b[j - 1])
      j--
    }
  }
  while (i > 0) {
    removed.push(a[i - 1])
    i--
  }
  while (j > 0) {
    added.push(b[j - 1])
    j--
  }

  return { added, removed, unchanged }
}

snapshotsRouter.get(
  '/:id/diff',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const id = req.params.id as string
    const compareId =
      typeof req.query.compareId === 'string' ? req.query.compareId.trim() : ''

    if (!compareId) {
      res.status(400).json({ error: '缺少 compareId 参数' })
      return
    }

    try {
      const [base, compare] = await Promise.all([
        getSnapshot(id, user.id),
        getSnapshot(compareId, user.id),
      ])

      if (!base || !compare) {
        res.status(404).json({ error: '快照不存在或无权访问' })
        return
      }

      const diff = computeDiff(base.code, compare.code)
      res.json({ diff })
    } catch (err) {
      console.error('[api/snapshots diff] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '获取 diff 失败',
      })
    }
  }
)

// ---------------------------------------------------------------------
// POST /api/snapshots/:id/share —— 生成只读分享链接（简化版）
// ---------------------------------------------------------------------

snapshotsRouter.post(
  '/:id/share',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const id = req.params.id as string

    try {
      const snapshot = await getSnapshot(id, user.id)
      if (!snapshot) {
        res.status(404).json({ error: '快照不存在或无权访问' })
        return
      }
      // 简化版：直接返回只读 URL，前端可访问只读视图
      res.json({ shareUrl: `/snapshots/${id}` })
    } catch (err) {
      console.error('[api/snapshots share] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '生成分享链接失败',
      })
    }
  }
)
