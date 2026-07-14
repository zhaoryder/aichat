// =====================================================================
// 联机共聊房间 API（Express SSE）
// ---------------------------------------------------------------------
// POST   /api/rooms/create            创建房间（房主自动加入）
// POST   /api/rooms/:id/join          加入房间
// POST   /api/rooms/:id/leave         离开房间
// GET    /api/rooms                   列出活跃房间
// GET    /api/rooms/:id               获取房间详情（参与者 + 历史消息）
// POST   /api/rooms/:id/messages      发送消息（SSE 流式 AI 回复）
// DELETE /api/rooms/:id              房主关闭房间
// POST   /api/rooms/:id/kick/:userId  房主踢人
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { chatCompletionStream } from '../lib/ai-client'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import {
  addRoomMessage,
  closeRoom,
  createRoom,
  getRoom,
  joinRoom,
  kickParticipant,
  leaveRoom,
  listActiveRooms,
  listRoomMessages,
  listRoomParticipants,
} from '../lib/queries'
import type { ChatMessage } from '../../shared/types'

export const roomsRouter = Router()

// ---------------------------------------------------------------------
// POST /api/rooms/create —— 创建房间（房主自动加入）
// ---------------------------------------------------------------------

interface CreateRoomBody {
  name?: unknown
  agentId?: unknown
}

roomsRouter.post('/create', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const body = req.body as CreateRoomBody
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : ''

    if (name.length < 1 || name.length > 50) {
      res.status(400).json({ error: '房间名称需 1-50 个字符' })
      return
    }
    if (!agentId) {
      res.status(400).json({ error: '请选择智能体' })
      return
    }

    const room = await createRoom(user.id, name, agentId)
    // 房主自动加入为参与者
    await joinRoom(room.id, user.id)
    res.json({ room })
  } catch (err) {
    console.error('[api/rooms/create] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/rooms/:id/join —— 加入房间
// ---------------------------------------------------------------------

roomsRouter.post('/:id/join', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const id = req.params.id as string
    const room = await getRoom(id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    if (room.status === 'closed') {
      res.status(400).json({ error: '房间已关闭' })
      return
    }

    await joinRoom(id, user.id)
    res.json({ success: true })
  } catch (err) {
    console.error('[api/rooms/join] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/rooms/:id/leave —— 离开房间
// ---------------------------------------------------------------------

roomsRouter.post('/:id/leave', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const id = req.params.id as string
    await leaveRoom(id, user.id)
    res.json({ success: true })
  } catch (err) {
    console.error('[api/rooms/leave] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/rooms —— 列出活跃房间
// ---------------------------------------------------------------------

roomsRouter.get('/', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rooms = await listActiveRooms()
    res.json({ rooms })
  } catch (err) {
    console.error('[api/rooms/list] 异常：', err)
    res.status(500).json({ error: '服务器开小差了' })
  }
})

// ---------------------------------------------------------------------
// GET /api/rooms/:id —— 获取房间详情（参与者 + 历史消息）
// ---------------------------------------------------------------------

roomsRouter.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const room = await getRoom(id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }

    const participants = await listRoomParticipants(id)
    const messages = await listRoomMessages(id)
    res.json({ room, participants, messages })
  } catch (err) {
    console.error('[api/rooms/:id] 异常：', err)
    res.status(500).json({ error: '服务器开小差了' })
  }
})

// ---------------------------------------------------------------------
// POST /api/rooms/:id/messages —— 发送消息（SSE 流式 AI 回复）
// ---------------------------------------------------------------------

interface SendMessageBody {
  content?: unknown
}

roomsRouter.post(
  '/:id/messages',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    try {
      const id = req.params.id as string
      const body = req.body as SendMessageBody
      const content = typeof body.content === 'string' ? body.content.trim() : ''

      if (!content) {
        res.status(400).json({ error: '消息内容不能为空' })
        return
      }
      if (content.length > 5000) {
        res.status(400).json({ error: '消息内容最多 5000 个字符' })
        return
      }

      const room = await getRoom(id)
      if (!room) {
        res.status(404).json({ error: '房间不存在' })
        return
      }
      if (room.status === 'closed') {
        res.status(400).json({ error: '房间已关闭' })
        return
      }

      // 1. 保存用户消息
      await addRoomMessage({
        roomId: id,
        userId: user.id,
        role: 'user',
        content,
      })

      // 2. 设置 SSE headers
      setSSEHeaders(res)

      // 3. 拉取房间历史消息转为 ChatMessage[]
      const history = await listRoomMessages(id)
      const messages: ChatMessage[] = history.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      // 4. AbortController + req.on('close')
      const abortController = new AbortController()
      req.on('close', () => {
        if (!abortController.signal.aborted) {
          abortController.abort()
        }
      })

      // 5-6. 流式输出 token 并累积 fullText
      let fullText = ''
      try {
        const gen = chatCompletionStream(messages, room.agent_id, {
          signal: abortController.signal,
        })
        for await (const delta of gen) {
          fullText += delta
          // 5. 流式输出 token 事件
          sendEvent(res, 'token', { c: delta })
        }

        // 6. 累积结束后保存 AI 消息
        if (fullText.trim()) {
          await addRoomMessage({
            roomId: id,
            userId: null,
            role: 'assistant',
            content: fullText,
            agentId: room.agent_id,
          })
        }

        // 7. 发送 done 事件
        sendEvent(res, 'done', {})
      } catch (err) {
        // 保存已生成的部分回复（若有）
        if (fullText.trim()) {
          try {
            await addRoomMessage({
              roomId: id,
              userId: null,
              role: 'assistant',
              content: fullText,
              agentId: room.agent_id,
            })
          } catch {
            // 保存失败不影响错误推送
          }
        }
        sendEvent(res, 'error', {
          message: err instanceof Error ? err.message : 'AI 回复失败',
        })
      } finally {
        res.end()
      }
    } catch (err) {
      console.error('[api/rooms/messages] 异常：', err)
      if (res.headersSent) {
        sendEvent(res, 'error', { message: '服务器开小差了' })
        res.end()
      } else {
        res.status(500).json({ error: '服务器开小差了' })
      }
    }
  }
)

// ---------------------------------------------------------------------
// DELETE /api/rooms/:id —— 房主关闭房间
// ---------------------------------------------------------------------

roomsRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const id = req.params.id as string
    const room = await getRoom(id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    if (room.host_id !== user.id) {
      res.status(403).json({ error: '仅房主可关闭房间' })
      return
    }

    await closeRoom(id, user.id)
    res.json({ success: true })
  } catch (err) {
    console.error('[api/rooms/delete] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/rooms/:id/kick/:userId —— 房主踢人
// ---------------------------------------------------------------------

roomsRouter.post(
  '/:id/kick/:userId',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    try {
      const id = req.params.id as string
      const targetUserId = req.params.userId as string
      await kickParticipant(id, user.id, targetUserId)
      res.json({ success: true })
    } catch (err) {
      console.error('[api/rooms/kick] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)
