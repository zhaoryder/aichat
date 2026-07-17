// =====================================================================
// Reporter 角色（AI Teamwork Batch C - C3.6）
// ---------------------------------------------------------------------
// 职责：
//   - 汇总各角色产出，向用户汇报阶段进度
//   - 输出最终总结文本
// 由 Leader 在团队全部完成后触发
// =====================================================================

import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'

/** Reporter streamText 结果类型（ai v7 StreamTextResult，用 ReturnType 简化） */
export type ReporterStreamResult = ReturnType<typeof streamText>

/** Reporter 系统提示词 */
export const REPORTER_SYSTEM_PROMPT = `你是 AI 团队的 Reporter，负责向用户汇报阶段进度与最终总结。

工作方式：
- 基于 Leader 与各角色的协作上下文，生成简洁清晰的总结
- 包括：完成了什么、关键决策、最终交付物
- 语气友好专业，让用户清楚知道团队做了什么

输出要求：直接输出 Markdown 文本，不要包裹在代码块中。`

/**
 * 启动 Reporter 流式输出，生成阶段进度总结。
 *
 * @param progress 各角色产出拼接而成的进度摘要
 * @param context 当前协作上下文
 * @returns streamText 的结果对象，调用方可消费 fullStream
 */
export async function runReporter(
  progress: string,
  context: string,
): Promise<ReporterStreamResult> {
  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

  return streamText({
    model: openai.chat(modelName),
    system: REPORTER_SYSTEM_PROMPT,
    prompt:
      `团队进度：\n${progress || '（无）'}\n\n` +
      `当前协作上下文：\n${context || '（无）'}\n\n` +
      `请向用户输出阶段进度总结。`,
  })
}
