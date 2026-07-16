// =====================================================================
// 内部 API（M3e）
// ---------------------------------------------------------------------
// 供外部 cron / 调试 / HF Space 调用的内部端点。
// 鉴权用 INTERNAL_API_TOKEN 环境变量（通过 X-Internal-Token header 传入）。
//
// 端点：
//   POST /api/internal/tick                 — 手动触发一次 agent 循环
//                                              body: { target_ai_id?: string }
//   POST /api/internal/orchestrator/start    — 启动自动循环
//   POST /api/internal/orchestrator/stop     — 停止自动循环
//   GET  /api/internal/orchestrator/status   — 查询循环状态
// =====================================================================

import { Router, Request, Response, NextFunction } from 'express'
import {
  tickAgent,
  startOrchestrator,
  stopOrchestrator,
  getOrchestratorStatus,
} from '../lib/agents/agent-orchestrator'

export const internalRouter = Router()

// ----------------------------------------------------------------------
// 鉴权中间件：X-Internal-Token
// ----------------------------------------------------------------------

const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN

if (!INTERNAL_TOKEN) {
  console.warn(
    '[internal] 警告：未配置 INTERNAL_API_TOKEN 环境变量，内部 API 将拒绝所有请求'
  )
}

internalRouter.use((req: Request, res: Response, next: NextFunction) => {
  // 如果未配置 token，则禁用所有内部 API
  if (!INTERNAL_TOKEN) {
    return res.status(503).json({ error: 'INTERNAL_API_TOKEN 未配置' })
  }

  const token =
    (req.headers['x-internal-token'] as string) ||
    (req.headers['x-internal-api-token'] as string) ||
    (req.query.token as string)

  if (token !== INTERNAL_TOKEN) {
    return res.status(401).json({ error: 'invalid internal token' })
  }

  next()
})

// ----------------------------------------------------------------------
// POST /api/internal/tick — 手动触发一次 agent 循环
// ----------------------------------------------------------------------

interface TickBody {
  target_ai_id?: string
}

internalRouter.post('/tick', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as TickBody
    const result = await tickAgent(body.target_ai_id)
    res.json(result)
  } catch (err) {
    console.error('[internal/tick] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'tick 失败',
    })
  }
})

// ----------------------------------------------------------------------
// POST /api/internal/orchestrator/start — 启动自动循环
// ----------------------------------------------------------------------

interface StartBody {
  interval_ms?: number
}

internalRouter.post('/orchestrator/start', (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as StartBody
    const intervalMs = typeof body.interval_ms === 'number' ? body.interval_ms : 60_000
    startOrchestrator(intervalMs)
    res.json({ ok: true, interval_ms: intervalMs })
  } catch (err) {
    console.error('[internal/orchestrator/start] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '启动失败',
    })
  }
})

// ----------------------------------------------------------------------
// POST /api/internal/orchestrator/stop — 停止自动循环
// ----------------------------------------------------------------------

internalRouter.post('/orchestrator/stop', (_req: Request, res: Response) => {
  try {
    stopOrchestrator()
    res.json({ ok: true })
  } catch (err) {
    console.error('[internal/orchestrator/stop] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '停止失败',
    })
  }
})

// ----------------------------------------------------------------------
// GET /api/internal/orchestrator/status — 查询循环状态
// ----------------------------------------------------------------------

internalRouter.get('/orchestrator/status', (_req: Request, res: Response) => {
  try {
    const status = getOrchestratorStatus()
    res.json(status)
  } catch (err) {
    console.error('[internal/orchestrator/status] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '查询失败',
    })
  }
})
