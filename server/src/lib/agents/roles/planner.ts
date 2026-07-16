// =====================================================================
// Planner 角色（AI Teamwork Batch C - C3.2）
// ---------------------------------------------------------------------
// 复用 Batch B 的 planner.generatePlan，作为团队成员时输出更细：
//   - runPlanner(goal, context) → 返回 PlanStep[]
//   - 系统提示词强调团队成员协作视角，输出含 step.estimated_minutes
// =====================================================================

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { generatePlan as generatePlanLegacy } from '../planner'
import type { PlanStep } from '../../../../shared/types'

/** 团队版 Planner 系统提示词：更细的拆解 */
export const PLANNER_SYSTEM_PROMPT = `你是 AI 团队的 Planner，作为团队成员工作。
你的职责：
1. 把 Leader 分配的目标拆解为 3-7 个具体的 step
2. 每个 step 必须有明确的标题、类型、估算时长（分钟）
3. 识别 step 之间的依赖关系，按合理顺序输出
4. 输出必须是合法 JSON，schema 如下：
   { "steps": [{ "id": 1, "title": "...", "type": "code"|"design"|"test"|"research"|"deploy", "estimated_minutes": 5 }] }`

/** zod schema：generateObject 强制结构化输出 */
const PLANNER_SCHEMA = z.object({
  steps: z
    .array(
      z.object({
        id: z.number().describe('步骤序号，从 1 开始'),
        title: z.string().describe('步骤标题，简洁明确'),
        type: z
          .enum(['code', 'design', 'test', 'research', 'deploy'])
          .describe('步骤类型'),
        estimated_minutes: z.number().describe('估算时长（分钟）'),
      }),
    )
    .describe('步骤列表，3-7 个'),
})

/** 团队版 Planner 输出：更细的 step 含估算时长 */
export interface TeamPlanStep extends PlanStep {
  estimated_minutes?: number
}

/**
 * 团队成员视角的 Planner：拆解任务为更细的 step。
 *
 * @param goal Leader 分配的目标
 * @param context 当前协作上下文
 * @returns PlanStep[]（含 estimated_minutes）
 */
export async function runPlanner(
  goal: string,
  context: string,
): Promise<TeamPlanStep[]> {
  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

  const { object } = await generateObject({
    model: openai.chat(modelName),
    system: PLANNER_SYSTEM_PROMPT,
    prompt:
      `目标：${goal}\n\n` +
      `当前协作上下文：\n${context || '（无）'}\n\n` +
      `请输出更细的步骤拆解。`,
    schema: PLANNER_SCHEMA,
  })

  // 把团队版 step 映射回 PlanStep 兼容结构
  return object.steps.map((s) => ({
    id: s.id,
    title: s.title,
    type: s.type,
    status: 'pending' as const,
    estimated_minutes: s.estimated_minutes,
  }))
}

/**
 * 复用 Batch B 的 legacy generatePlan。
 * 当 teamConfig 不含 planner 时，仍可用此函数兜底生成 plan。
 */
export { generatePlanLegacy as generatePlan }
