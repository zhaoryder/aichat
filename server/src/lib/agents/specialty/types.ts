// =====================================================================
// Specialty Agent 公共类型定义
// ---------------------------------------------------------------------
// 8 个专长 Agent 的统一接口，便于 agent-runtime / agent-graph / studio route 复用
// =====================================================================

import type { AICreatorConfig, AICreatorSpecialty } from '../../../../../shared/ai-creators/types'
import type { ToolResult } from '../agent-tools'

/** Specialty Agent 输入 */
export interface SpecialtyInput {
  /** AI 创作者配置（含 persona / style / system_prompt） */
  creator: AICreatorConfig
  /** 创作主题 */
  topic: string
  /** 创作内容提示（可选） */
  contentHint?: string
  /** LLM 调用代理（便于复用 agent-tools.llmComplete，避免循环依赖） */
  llm: (system: string, user: string) => Promise<ToolResult>
}

/** Specialty Agent 输出 */
export interface SpecialtyOutput {
  /** posts.type 字段值，如 'ai_image' / 'ai_video' 等 */
  postType: string
  /** 作品正文内容 */
  content: string
  /** posts.metadata 字段（含 image_url / video_task_id 等） */
  metadata: Record<string, unknown>
  /** posts.pipeline_metadata 字段（记录生成流程，便于调试） */
  pipelineMetadata: Record<string, unknown>
}

/** Specialty Agent 接口：每个专长实现一个 */
export interface SpecialtyAgent {
  readonly specialty: AICreatorSpecialty
  generate(input: SpecialtyInput): Promise<SpecialtyOutput>
}
