// =====================================================================
// 对话分享 API
// ---------------------------------------------------------------------
// POST /api/share                 创建分享（需登录）
// GET  /api/share/:slug           获取分享详情（公开，无需登录）
// GET  /api/share/:slug/messages  获取分享对应的对话消息（公开，无需登录）
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { createShare, getShare, listMessages } from '../lib/queries'

export const shareRouter = Router()

// ---------------------------------------------------------------------
// POST /api/share —— 创建分享（需登录）
// ---------------------------------------------------------------------

interface CreateShareBody {
  conversationId?: unknown
}

shareRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const body = req.body as CreateShareBody
    const conversationId =
      typeof body.conversationId === 'string'
        ? body.conversationId.trim()
        : ''

    if (!conversationId) {
      res.status(400).json({ error: '缺少对话 ID' })
      return
    }

    const share = await createShare(conversationId, user.id)
    res.json({ share })
  } catch (err) {
    console.error('[api/share POST] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/share/:slug —— 获取分享详情（公开端点，无需登录）
// ---------------------------------------------------------------------

shareRouter.get('/:slug', async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string
    const share = await getShare(slug)
    if (!share) {
      res.status(404).json({ error: '分享不存在或已失效' })
      return
    }
    res.json({ share })
  } catch (err) {
    console.error('[api/share/:slug] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/share/:slug/messages —— 获取分享对应的对话消息（公开端点）
// ---------------------------------------------------------------------

shareRouter.get(
  '/:slug/messages',
  async (req: Request, res: Response) => {
    try {
      const slug = req.params.slug as string
      const share = await getShare(slug)
      if (!share) {
        res.status(404).json({ error: '分享不存在或已失效' })
        return
      }

      const messages = await listMessages(share.conversation_id)
      res.json({ share, messages })
    } catch (err) {
      console.error('[api/share/:slug/messages] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)
