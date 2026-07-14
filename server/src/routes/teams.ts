// =====================================================================
// 多智能体并行协作 API（Express SSE）
// ---------------------------------------------------------------------
// POST   /api/teams/create        创建团队
// GET    /api/teams               列出我的团队
// POST   /api/teams/:id/execute   启动并行执行（SSE 多 agent 流式）
//
// 并行执行：对 team.agent_ids 中每个 agent 并行调用 chatCompletionStream，
// 通过 SSE 推送 agent_start / token / agent_done / done / error 事件，
// 每个 token 携带 agentId，前端按 agentId 路由到对应流式输出区。
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { chatCompletionStream } from '../lib/ai-client'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import { createAgentTeam, listAgentTeams, getAgentTeam } from '../lib/queries'
import { getAgentById } from '../../shared/agents'
import type { AgentTeam, ChatMessage } from '../../shared/types'

export const teamsRouter = Router()

// ---------------------------------------------------------------------
// POST /api/teams/create —— 创建团队
// ---------------------------------------------------------------------

interface CreateTeamBody {
  name?: unknown
  agentIds?: unknown
  config?: unknown
}

teamsRouter.post('/create', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const body = req.body as CreateTeamBody
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const agentIds = Array.isArray(body.agentIds)
      ? body.agentIds.filter((a): a is string => typeof a === 'string')
      : []
    const config =
      body.config && typeof body.config === 'object'
        ? (body.config as Record<string, unknown>)
        : {}

    if (!name || name.length > 50) {
      res.status(400).json({ error: '团队名称需 1-50 个字符' })
      return
    }
    if (agentIds.length === 0 || agentIds.length > 6) {
      res.status(400).json({ error: '请选择 1-6 个智能体' })
      return
    }

    const team = await createAgentTeam(user.id, name, agentIds, config)
    res.json({ team })
  } catch (err) {
    console.error('[api/teams/create] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/teams —— 列出我的团队
// ---------------------------------------------------------------------

teamsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const teams = await listAgentTeams(user.id)
    res.json({ teams })
  } catch (err) {
    console.error('[api/teams] 异常：', err)
    res.status(500).json({ error: '服务器开小差了' })
  }
})

// ---------------------------------------------------------------------
// POST /api/teams/:id/execute —— 启动并行执行（SSE 多 agent 流式）
// ---------------------------------------------------------------------

interface ExecuteBody {
  message?: unknown
}

teamsRouter.post(
  '/:id/execute',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    try {
      const teamId = req.params.id as string
      const team = await getAgentTeam(teamId, user.id)
      if (!team) {
        res.status(404).json({ error: '团队不存在或无权访问' })
        return
      }

      const body = req.body as ExecuteBody
      const message =
        typeof body.message === 'string' ? body.message.trim() : ''
      if (!message) {
        res.status(400).json({ error: '缺少执行消息' })
        return
      }

      setSSEHeaders(res)

      // 客户端断开时的取消信号
      const abortController = new AbortController()
      req.on('close', () => {
        if (!abortController.signal.aborted) {
          abortController.abort()
        }
      })

      const agentIds = team.agent_ids
      if (agentIds.length === 0) {
        sendEvent(res, 'done', {})
        res.end()
        return
      }

      const messages: ChatMessage[] = [{ role: 'user', content: message }]

      // 并行启动每个 agent 的流式调用
      // - agent_start → 通知前端创建占位区
      // - token → 增量文本（携带 agentId，前端按 agentId 路由）
      // - agent_done → 释放前端占位（失败也发送，避免前端卡住）
      await Promise.allSettled(
        agentIds.map(async (agentId) => {
          const official = getAgentById(agentId)
          const agentName = official?.name ?? agentId
          try {
            sendEvent(res, 'agent_start', { agentId, agentName })
            for await (const delta of chatCompletionStream(messages, agentId, {
              signal: abortController.signal,
            })) {
              sendEvent(res, 'token', { agentId, c: delta })
            }
            sendEvent(res, 'agent_done', { agentId })
          } catch (err) {
            console.error(
              `[api/teams/execute] AI ${agentId} 流式生成失败：`,
              err instanceof Error ? err.message : err
            )
            // 失败也发送 agent_done 以释放前端占位
            try {
              sendEvent(res, 'agent_done', { agentId })
            } catch {
              // 连接已关闭，忽略写入异常
            }
          }
        })
      )

      // 所有 agent 结束后发送 done 事件 + 关闭响应
      if (!res.writableEnded) {
        sendEvent(res, 'done', {})
        res.end()
      }
    } catch (err) {
      console.error('[api/teams/execute] 异常：', err)
      if (res.headersSent) {
        if (!res.writableEnded) {
          sendEvent(res, 'error', { message: '服务器开小差了' })
          res.end()
        }
      } else {
        res.status(500).json({ error: '服务器开小差了' })
      }
    }
  }
)
