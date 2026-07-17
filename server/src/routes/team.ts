// =====================================================================
// AI Teamwork API（Batch C - C5）
// ---------------------------------------------------------------------
// 挂载在 /api 下（与 skillsRouter / plansRouter 一样）：
//   POST /api/team/start        创建会话 + 立即开始 SSE 流
//   POST /api/team/:id/message  追加用户消息并触发下一轮 runTeamStep
//   GET  /api/team/:id/stream   拉取当前 session 状态（简化版，返回 JSON）
//   POST /api/team/:id/stop     标记 status='paused'
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import {
  startTeamSession,
  runTeamStep,
  appendUserMessage,
  pauseTeamSession,
  getTeamSession,
  reactivateTeamSession,
} from '../lib/agents/team-orchestrator'
import type { TeamConfig, TeamRole } from '../../shared/types'

export const teamRouter = Router()

/** 校验 roles 数组：必须是 1-6 个合法 TeamRole */
function validateRoles(roles: unknown): roles is TeamRole[] {
  const validRoles: TeamRole[] = [
    'leader',
    'planner',
    'coder',
    'executor',
    'reviewer',
    'reporter',
  ]
  if (!Array.isArray(roles)) return false
  if (roles.length === 0 || roles.length > 6) return false
  for (const r of roles) {
    if (typeof r !== 'string' || !validRoles.includes(r as TeamRole)) return false
  }
  return true
}

// ---------------------------------------------------------------------
// POST /api/team/start —— 创建会话 + 立即开始 SSE 流
// ---------------------------------------------------------------------

interface StartBody {
  goal?: unknown
  config?: unknown
}

teamRouter.post(
  '/team/start',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    const body = req.body as StartBody
    const goal = typeof body.goal === 'string' ? body.goal.trim() : ''

    if (!goal) {
      res.status(400).json({ error: 'goal 必填' })
      return
    }

    // 解析 config（roles / leader_model / member_model）
    const config: TeamConfig = { roles: ['leader', 'coder'] }
    if (body.config && typeof body.config === 'object') {
      const cfg = body.config as {
        roles?: unknown
        leader_model?: unknown
        member_model?: unknown
      }
      if (validateRoles(cfg.roles)) {
        config.roles = cfg.roles
      }
      if (typeof cfg.leader_model === 'string' && cfg.leader_model) {
        config.leader_model = cfg.leader_model
      }
      if (typeof cfg.member_model === 'string' && cfg.member_model) {
        config.member_model = cfg.member_model
      }
    }

    // 校验 leader 必须在 roles 中（保证协作可启动）
    if (!config.roles.includes('leader')) {
      res
        .status(400)
        .json({ error: '团队必须包含 Leader 角色' })
      return
    }

    try {
      // 1. 创建 session
      const session = await startTeamSession(user.id, goal, config)

      // 2. 立即开始 SSE 流（先把 sessionId 推给客户端，再跑协作）
      setSSEHeaders(res)
      sendEvent(res, 'start', { sessionId: session.id })

      // 3. 跑 team 协作状态机（异步，内部会持续推 SSE 事件）
      await runTeamStep(session.id, res)
    } catch (err) {
      console.error('[POST /api/team/start] error:', err)
      if (!res.headersSent) {
        res.status(500).json({
          error: err instanceof Error ? err.message : '启动 team 失败',
        })
      } else {
        sendEvent(res, 'error', {
          error: err instanceof Error ? err.message : '启动 team 失败',
        })
      }
    }
  },
)

// ---------------------------------------------------------------------
// POST /api/team/:id/message —— 追加用户消息 + 触发下一轮协作
// ---------------------------------------------------------------------

interface MessageBody {
  message?: unknown
}

teamRouter.post(
  '/team/:id/message',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const sessionId = req.params.id as string
    const body = req.body as MessageBody
    const message = typeof body.message === 'string' ? body.message.trim() : ''

    if (!message) {
      res.status(400).json({ error: 'message 必填' })
      return
    }

    try {
      // 1. 追加 user 消息到 transcript
      const session = await appendUserMessage(sessionId, user.id, message)

      // 2. 若 session 已 completed / failed，重新激活为 active
      // （用户发新消息相当于继续对话）
      if (session.status === 'completed' || session.status === 'failed') {
        await reactivateTeamSession(sessionId)
        // 同步本地 session 对象，保持与 DB 一致
        session.status = 'active'
        session.current_role_name = null
      }

      // 3. 立即开始 SSE 流
      setSSEHeaders(res)
      sendEvent(res, 'start', { sessionId })

      // 4. 跑协作
      await runTeamStep(sessionId, res)
    } catch (err) {
      console.error('[POST /api/team/:id/message] error:', err)
      if (!res.headersSent) {
        res.status(500).json({
          error: err instanceof Error ? err.message : '发送消息失败',
        })
      } else {
        sendEvent(res, 'error', {
          error: err instanceof Error ? err.message : '发送消息失败',
        })
      }
    }
  },
)

// ---------------------------------------------------------------------
// GET /api/team/:id/stream —— 拉取当前 session 状态（简化版）
// ---------------------------------------------------------------------
// spec 中写"简化：复用 start 的流，或返回当前 transcript"
// 这里返回当前 transcript（JSON），不重新跑协作

teamRouter.get(
  '/team/:id/stream',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const sessionId = req.params.id as string

    try {
      const session = await getTeamSession(sessionId, user.id)
      res.json({ session })
    } catch (err) {
      console.error('[GET /api/team/:id/stream] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '获取 team 状态失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// POST /api/team/:id/stop —— 标记 status='paused'
// ---------------------------------------------------------------------

teamRouter.post(
  '/team/:id/stop',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const sessionId = req.params.id as string

    try {
      await pauseTeamSession(sessionId, user.id)
      res.json({ success: true })
    } catch (err) {
      console.error('[POST /api/team/:id/stop] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '停止 team 失败',
      })
    }
  },
)
