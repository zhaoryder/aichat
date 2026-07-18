// =====================================================================
// Reviewer 角色（AI Teamwork Batch C - C3.5）
// ---------------------------------------------------------------------
// 职责：
//   - 审查 Coder 写的代码
//   - 输出结构化评分 JSON（security / maintainability / performance + issues）
//   - 评分 < 60 由 team-orchestrator 回到 Coder 修复
//
// 实现要点（真流式改造）：
//   原先用 generateObject 非流式输出 JSON，5-15s 静默期被用户误判为卡死。
//   现改为 streamText：先流式输出自然语言审查意见（逐 token 推给前端），
//   再在末尾输出 ```json 评分块，由 parseReviewResult 解析。
// =====================================================================

import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import type { CodeReviewResult } from '../../../../shared/types'

/** Reviewer 系统提示词 */
export const REVIEWER_SYSTEM_PROMPT = `你是 AI 团队的 Reviewer，专注于代码审查。

评分维度（每个 0-100）：
1. security：安全性（是否存在 XSS、注入、敏感信息泄露等）
2. maintainability：可维护性（代码结构、命名、注释、可读性）
3. performance：性能（是否存在明显性能问题、内存泄漏等）

issues 列表：
- severity: critical（必须修复）/ warning（建议修复）/ info（提示）
- message: 问题描述
- line: 可选，问题所在行号

summary：总体评语，1-2 句话。

输出要求（严格遵守）：
1. 先用自然语言流式输出你的代码审查意见，按维度逐项分析：
   - 先总览代码做了什么
   - 再按 security / maintainability / performance 顺序指出具体问题与改进建议
   - 引用具体的代码行或片段说明
2. 审查意见结束后，输出一个 JSON 评分块（必须用 \`\`\`json 代码块包裹），格式：
   \`\`\`json
   { "security": 85, "maintainability": 90, "performance": 78, "issues": [{ "severity": "warning", "message": "...", "line": 12 }], "summary": "总体评语" }
   \`\`\`
3. issues 数组允许为空 []；severity 必须是 critical / warning / info 之一
4. JSON 评分块必须是输出的最后部分，评分块之后不要再输出任何文字`

/**
 * 从 Reviewer 流式输出末尾解析 JSON 评分块。
 * 优先匹配最后一个 ```json ... ``` 代码块；失败时尝试匹配裸 JSON 对象。
 */
function parseReviewResult(text: string): CodeReviewResult | null {
  const codeBlockMatches = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/g)
  if (codeBlockMatches && codeBlockMatches.length > 0) {
    const lastBlock = codeBlockMatches[codeBlockMatches.length - 1]
    const jsonStr = lastBlock
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '')
    try {
      const obj = JSON.parse(jsonStr)
      if (
        obj &&
        typeof obj.security === 'number' &&
        typeof obj.maintainability === 'number' &&
        typeof obj.performance === 'number' &&
        Array.isArray(obj.issues) &&
        typeof obj.summary === 'string'
      ) {
        return obj as CodeReviewResult
      }
    } catch {
      /* fall through */
    }
  }

  // fallback：匹配包含 security 字段的裸 JSON 对象（允许 issues 等嵌套数组）
  const bareMatch = text.match(/\{[\s\S]*?"security"[\s\S]*?\}/)
  if (bareMatch) {
    try {
      const obj = JSON.parse(bareMatch[0])
      if (
        obj &&
        typeof obj.security === 'number' &&
        typeof obj.maintainability === 'number' &&
        typeof obj.performance === 'number' &&
        Array.isArray(obj.issues) &&
        typeof obj.summary === 'string'
      ) {
        return obj as CodeReviewResult
      }
    } catch {
      /* fall through */
    }
  }

  return null
}

/**
 * 让 Reviewer 审查代码并返回结构化评分（真流式）。
 *
 * 流程：
 *   1. 用 streamText 流式输出审查意见，每个 text-delta 通过 onToken 回调推送前端
 *   2. 流结束后从完整文本末尾解析 JSON 评分块
 *   3. 解析失败时降级为全 70 分的默认评分
 *
 * @param code 待审查的代码（通常是 Coder 刚写的 writeFile content）
 * @param context 当前协作上下文
 * @param onToken 流式 token 回调（每个 text-delta 触发一次）
 * @returns CodeReviewResult
 */
export async function runReviewer(
  code: string,
  context: string,
  onToken?: (token: string) => void,
): Promise<CodeReviewResult> {
  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  // TODO(G5): 此处未读取 teamConfig.member_model，团队会话中无法按用户配置切换成员模型。
  // 对比 leader.ts 已通过 teamConfig.leader_model 覆盖；成员角色（coder/executor/
  // reviewer/reporter）的 run* 函数当前不接受 teamConfig 参数。修复需调整函数签名
  // 及所有调用点，暂留作后续优化。
  const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

  const result = streamText({
    model: openai.chat(modelName),
    system: REVIEWER_SYSTEM_PROMPT,
    prompt:
      `请审查以下代码：\n\n\`\`\`\n${code}\n\`\`\`\n\n` +
      `当前协作上下文：\n${context || '（无）'}\n\n` +
      `请先流式输出你的代码审查意见，最后输出 JSON 评分块。`,
  })

  let fullText = ''
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta' && part.text) {
      fullText += part.text
      onToken?.(part.text)
    }
  }

  const review = parseReviewResult(fullText)
  if (review) return review

  // fallback：解析失败，返回全 70 分的默认评分（不让流程卡死）
  return {
    security: 70,
    maintainability: 70,
    performance: 70,
    issues: [],
    summary: 'Reviewer 输出解析失败，使用默认评分。',
  }
}
