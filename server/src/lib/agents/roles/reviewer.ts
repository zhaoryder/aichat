// =====================================================================
// Reviewer 角色（AI Teamwork Batch C - C3.5）
// ---------------------------------------------------------------------
// 职责：
//   - 审查 Coder 写的代码
//   - 输出结构化评分 JSON（security / maintainability / performance + issues）
//   - 评分 < 60 由 team-orchestrator 回到 Coder 修复
// 使用 generateObject + zod schema 强制结构化输出
// =====================================================================

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
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

输出要求：必须是合法 JSON，schema：
{ "security": 85, "maintainability": 90, "performance": 78, "issues": [...], "summary": "..." }`

/** zod schema：generateObject 强制输出合法 CodeReviewResult */
const REVIEW_SCHEMA = z.object({
  security: z.number().min(0).max(100).describe('安全性评分 0-100'),
  maintainability: z.number().min(0).max(100).describe('可维护性评分 0-100'),
  performance: z.number().min(0).max(100).describe('性能评分 0-100'),
  issues: z
    .array(
      z.object({
        severity: z.enum(['critical', 'warning', 'info']).describe('严重程度'),
        message: z.string().describe('问题描述'),
        line: z.number().optional().describe('问题所在行号'),
      }),
    )
    .describe('发现的问题列表'),
  summary: z.string().describe('总体评语'),
})

/**
 * 让 Reviewer 审查代码并返回结构化评分。
 *
 * @param code 待审查的代码（通常是 Coder 刚写的 writeFile content）
 * @param context 当前协作上下文
 * @returns CodeReviewResult
 */
export async function runReviewer(
  code: string,
  context: string,
): Promise<CodeReviewResult> {
  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

  const { object } = await generateObject({
    model: openai.chat(modelName),
    system: REVIEWER_SYSTEM_PROMPT,
    prompt:
      `请审查以下代码：\n\n\`\`\`\n${code}\n\`\`\`\n\n` +
      `当前协作上下文：\n${context || '（无）'}\n\n` +
      `请输出结构化评分 JSON。`,
    schema: REVIEW_SCHEMA,
  })

  return object as CodeReviewResult
}
