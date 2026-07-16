// =====================================================================
// Agent Orchestrator（M3c.3）
// ---------------------------------------------------------------------
// 调度器：每分钟随机抽 1 个 AI creator 执行 think → act → observe 循环
// 可移植设计：既能在 Railway in-process 跑，也能在 HF Space 跑
// 失败静默：单次 runOnce 抛错只 console.error，不影响下一轮
// =====================================================================

import { AI_CREATORS, pickRandomAICreator } from '../../../../shared/ai-creators'
import type { AICreatorConfig } from '../../../../shared/ai-creators/types'
import { AIAgent } from './agent-runtime'
import { supabase } from '../supabase'

// ----------------------------------------------------------------------
// 状态
// ----------------------------------------------------------------------

/** 缓存 agent 实例（ai_creator_id → AIAgent） */
const agentInstances = new Map<string, AIAgent>()

/** 定时器句柄 */
let timer: NodeJS.Timeout | null = null

/** 总 tick 数（统计用） */
let ticksCompleted = 0

/** 每 hour 内每个 creator 的调用计数（限流：每小时同一 creator 最多 3 次） */
const hourlyCallCount = new Map<string, number>()
let lastHourReset = Date.now()

// ----------------------------------------------------------------------
// 公开 API
// ----------------------------------------------------------------------

/**
 * 查找 AI creator 对应的 profiles.user_id
 * 用 is_ai=true AND ai_creator_id=... 过滤
 */
export async function findAIUserId(aiCreatorId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_ai', true)
      .eq('ai_creator_id', aiCreatorId)
      .maybeSingle()
    return data?.id ?? null
  } catch {
    return null
  }
}

/**
 * 获取或创建 agent 实例（懒加载）
 * 找不到对应 profiles 行时返回 null（说明 seed-ai-creators 还没跑）
 */
export async function getAgent(aiCreatorId: string): Promise<AIAgent | null> {
  // 1. 命中缓存
  const cached = agentInstances.get(aiCreatorId)
  if (cached) return cached

  // 2. 找配置
  const config: AICreatorConfig | undefined = AI_CREATORS.find((c) => c.id === aiCreatorId)
  if (!config) {
    console.error(`[orchestrator] 未找到 AI creator 配置: ${aiCreatorId}`)
    return null
  }

  // 3. 创建实例
  const agent = new AIAgent(config, supabase)

  // 4. 查 profiles 找 user_id
  const userId = await findAIUserId(aiCreatorId)
  if (userId) {
    agent.bindToUser(userId)
  } else {
    console.warn(`[orchestrator] ${aiCreatorId} 未在 profiles 表注册，将只能执行 rest/study`)
  }

  // 5. 缓存
  agentInstances.set(aiCreatorId, agent)
  return agent
}

/**
 * 执行一次 agent tick（随机抽 1 个 creator）
 * @param targetCreatorId 可选，指定 creator（调试用）
 */
export async function tickAgent(targetCreatorId?: string): Promise<{
  ok: boolean
  creator_id?: string
  action?: string
  result?: string
  error?: string
}> {
  // 1. 小时重置（限流统计）
  const now = Date.now()
  if (now - lastHourReset > 60 * 60 * 1000) {
    hourlyCallCount.clear()
    lastHourReset = now
  }

  // 2. 选 creator
  let creator: AICreatorConfig
  if (targetCreatorId) {
    const found = AI_CREATORS.find((c) => c.id === targetCreatorId)
    if (!found) {
      return { ok: false, error: `未找到 creator: ${targetCreatorId}` }
    }
    creator = found
  } else {
    // 随机抽 1 个，但跳过本小时已调用 3 次的
    let attempts = 0
    do {
      creator = pickRandomAICreator()
      const count = hourlyCallCount.get(creator.id) ?? 0
      if (count < 3) break
      attempts++
    } while (attempts < 10)

    // 如果 10 次都跳过（所有都被限流），直接用最后抽到的
  }

  // 3. 更新限流计数
  hourlyCallCount.set(creator.id, (hourlyCallCount.get(creator.id) ?? 0) + 1)

  // 4. 获取 agent 实例
  const agent = await getAgent(creator.id)
  if (!agent) {
    return { ok: false, creator_id: creator.id, error: 'agent 实例创建失败' }
  }

  // 5. runOnce
  try {
    const startTs = Date.now()
    const { action, result } = await agent.runOnce()
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1)
    ticksCompleted++

    const summary = {
      ok: result.ok,
      creator_id: creator.id,
      action: action.type,
      result: result.ok ? 'ok' : (result.error ?? 'fail'),
      elapsed_sec: elapsed,
    }
    console.log(`[orchestrator] tick #${ticksCompleted} ${creator.id} → ${action.type} ${result.ok ? '✓' : '✗'} (${elapsed}s)`)
    return summary
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[orchestrator] ${creator.id} tick 异常:`, msg)
    return { ok: false, creator_id: creator.id, error: msg }
  }
}

/**
 * 启动定时器（默认 60s 间隔）
 * 在 server/src/index.ts 或 huggingface-space/index.ts 调用
 */
export function startOrchestrator(intervalMs = 60_000): void {
  if (timer) {
    console.warn('[orchestrator] 已经在运行，忽略重复启动')
    return
  }
  console.log(`[orchestrator] 启动定时器，间隔 ${intervalMs}ms`)

  // 30s 后开始第一次 tick（避免启动瞬间其他模块未就绪）
  setTimeout(() => {
    tickAgent().catch((e) => console.error('[orchestrator] 启动首次 tick 失败:', e))
    timer = setInterval(() => {
      tickAgent().catch((e) => console.error('[orchestrator] tick 失败:', e))
    }, intervalMs)
  }, 30_000)
}

/** 停止定时器 */
export function stopOrchestrator(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
    console.log('[orchestrator] 已停止')
  }
}

/** 查询状态 */
export function getOrchestratorStatus(): {
  running: boolean
  intervalMs: number
  ticksCompleted: number
  cachedAgents: number
} {
  return {
    running: timer !== null,
    intervalMs: 60_000,
    ticksCompleted,
    cachedAgents: agentInstances.size,
  }
}

// ----------------------------------------------------------------------
// 模块加载即启动（在 Railway in-process 模式下生效）
// 在 HF Space 模式下由 huggingface-space/index.ts 显式调用 startOrchestrator
// ----------------------------------------------------------------------

// 通过环境变量控制是否自动启动（默认启动，便于 Railway in-process 模式）
// 在 HF Space 中可设 DISABLE_AUTO_ORCHESTRATOR=true 避免重复启动
const autoStart = process.env.DISABLE_AUTO_ORCHESTRATOR !== 'true'
if (autoStart) {
  startOrchestrator(60_000)
}
