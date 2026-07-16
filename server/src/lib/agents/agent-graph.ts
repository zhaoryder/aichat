// =====================================================================
// Agent Graph — 多步骤创作 Pipeline 编排
// ---------------------------------------------------------------------
// 当前实现：async/await 串行编排（USE_LANGGRAPH = false）
// 未来扩展：若需要更复杂的状态机（如分镜 → TTS → 字幕 → 合成 → 审核 → 发布
//   的多分支条件流转），可切换为 LangGraph StateGraph 实现
// =====================================================================

import type { AICreatorConfig } from '../../../../shared/ai-creators/types'
import { getSpecialtyAgent } from './specialty'
import * as tools from './agent-tools'
import type { SpecialtyOutput } from './specialty/types'

/** LangGraph 开关（默认关闭，用 async/await 串行） */
export const USE_LANGGRAPH = false

/** Pipeline 步骤状态 */
export interface PipelineStep {
  name: string
  status: 'pending' | 'running' | 'done' | 'failed'
  startedAt?: string
  finishedAt?: string
  result?: unknown
  error?: string
}

/** Pipeline 执行结果 */
export interface PipelineResult {
  steps: PipelineStep[]
  finalResult?: SpecialtyOutput
}

/**
 * 多步骤创作 pipeline（串行执行，记录每步状态）
 *
 * 当前步骤：
 * 1. specialty_generate — 调用对应 SpecialtyAgent.generate()
 * 2. persist_post — 持久化到 posts 表（由调用方负责，这里只标记 skipped）
 *
 * 未来可扩展为：
 * - 分镜 → TTS → 字幕 → FFmpeg 合成 → 审核 → 发布
 * - 多 agent 协作（编剧 → 画师 → 配音 → 剪辑）
 */
export async function runCreationPipeline(params: {
  creator: AICreatorConfig
  topic: string
  contentHint?: string
  onProgress?: (step: PipelineStep) => void
}): Promise<PipelineResult> {
  const { creator, topic, contentHint, onProgress } = params
  const steps: PipelineStep[] = []

  // LLM 代理函数（包装 agent-tools.llmComplete）
  const llm = (system: string, user: string) =>
    tools.llmComplete({ system_prompt: system, user_prompt: user })

  // Step 1: specialty 生成
  const step1: PipelineStep = {
    name: `${creator.specialty}_generate`,
    status: 'running',
    startedAt: new Date().toISOString(),
  }
  steps.push(step1)
  onProgress?.(step1)

  try {
    const agent = getSpecialtyAgent(creator.specialty)
    const output = await agent.generate({ creator, topic, contentHint, llm })

    step1.status = 'done'
    step1.finishedAt = new Date().toISOString()
    step1.result = {
      postType: output.postType,
      contentLength: output.content.length,
      hasMedia: Object.keys(output.metadata).length > 0,
    }
    onProgress?.(step1)

    // Step 2: 持久化（由 agent-runtime.actPublish 或 studio route 负责）
    const step2: PipelineStep = {
      name: 'persist_post',
      status: 'done',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      result: 'skipped (handled by caller)',
    }
    steps.push(step2)
    onProgress?.(step2)

    return { steps, finalResult: output }
  } catch (err) {
    step1.status = 'failed'
    step1.finishedAt = new Date().toISOString()
    step1.error = err instanceof Error ? err.message : String(err)
    onProgress?.(step1)
    return { steps }
  }
}

/**
 * LangGraph 占位实现（未来切换用）
 *
 * 当 USE_LANGGRAPH = true 时，可在此处用 LangGraph 的 StateGraph 重新实现
 * 多步骤 pipeline，支持条件分支、并行节点、状态回滚等高级能力。
 *
 * 示例（未启用）：
 * ```typescript
 * import { StateGraph, END } from '@langchain/langgraph'
 *
 * const graph = new StateGraph({
 *   channels: {
 *     creator: ...,
 *     topic: ...,
 *     output: ...,
 *   }
 * })
 * graph.addNode('generate', generateNode)
 * graph.addNode('review', reviewNode)
 * graph.addNode('publish', publishNode)
 * graph.addEdge('generate', 'review')
 * graph.addConditionalEdges('review', routeByQuality, { pass: 'publish', fail: 'generate' })
 * graph.addEdge('publish', END)
 * ```
 */
export async function runCreationPipelineWithLangGraph(): Promise<PipelineResult> {
  throw new Error('LangGraph pipeline not yet implemented. Set USE_LANGGRAPH = false and use runCreationPipeline().')
}
