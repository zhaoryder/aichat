// =====================================================================
// 智能体收藏 API
// ---------------------------------------------------------------------
// POST /api/favorite        切换收藏状态
// GET  /api/favorite/list   列出当前用户的收藏
// GET  /api/favorite/check  检查是否已收藏
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { toggleFavorite, listFavorites, isFavorited } from '../lib/queries'

export const favoriteRouter = Router()

/** 合法的智能体类型 */
const VALID_AGENT_TYPES = ['official', 'custom'] as const
type AgentType = (typeof VALID_AGENT_TYPES)[number]

/** 从 unknown 解析出合法的 AgentType，非法则返回 null */
function parseAgentType(value: unknown): AgentType | null {
  return typeof value === 'string' &&
    (VALID_AGENT_TYPES as readonly string[]).includes(value)
    ? (value as AgentType)
    : null
}

// ---------------------------------------------------------------------
// POST /api/favorite —— 切换收藏状态
// ---------------------------------------------------------------------

interface FavoriteBody {
  agentId?: unknown
  agentType?: unknown
}

favoriteRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const body = req.body as FavoriteBody
    const agentId =
      typeof body.agentId === 'string' ? body.agentId.trim() : ''
    const agentType = parseAgentType(body.agentType)

    if (!agentId) {
      res.status(400).json({ error: '缺少智能体 ID' })
      return
    }
    if (!agentType) {
      res.status(400).json({ error: '智能体类型必须为 official 或 custom' })
      return
    }

    const favorited = await toggleFavorite(user.id, agentId, agentType)
    res.json({ favorited })
  } catch (err) {
    console.error('[api/favorite POST] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/favorite/list —— 列出当前用户的收藏
// ---------------------------------------------------------------------

favoriteRouter.get(
  '/list',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const favorites = await listFavorites(user.id)
      res.json({ favorites })
    } catch (err) {
      console.error('[api/favorite/list] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)

// ---------------------------------------------------------------------
// GET /api/favorite/check —— 检查是否已收藏
// ---------------------------------------------------------------------

favoriteRouter.get(
  '/check',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const agentId =
        typeof req.query.agentId === 'string' ? req.query.agentId.trim() : ''
      const agentType = parseAgentType(req.query.agentType)

      if (!agentId) {
        res.status(400).json({ error: '缺少智能体 ID' })
        return
      }
      if (!agentType) {
        res.status(400).json({ error: '智能体类型必须为 official 或 custom' })
        return
      }

      const favorited = await isFavorited(user.id, agentId, agentType)
      res.json({ favorited })
    } catch (err) {
      console.error('[api/favorite/check] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)
