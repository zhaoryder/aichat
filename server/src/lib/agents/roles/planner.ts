// =====================================================================
// Planner 角色（AI Teamwork Batch C - C3.2）
// ---------------------------------------------------------------------
// 复用 Batch B 的 planner.generatePlan，作为团队成员时输出更细：
//   - runPlanner(goal, context, onToken?) → 返回 PlanStep[]
//   - 系统提示词强调团队成员协作视角，输出含 step.estimated_minutes
//
// 实现要点（真流式改造）：
//   原先用 generateObject 非流式输出 JSON，5-15s 静默期被用户误判为卡死。
//   现改为 streamText：先流式输出自然语言规划思考（逐 token 推给前端），
//   再在末尾输出 ```json 步骤块，由 parsePlanSteps 解析。
// =====================================================================

import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { generatePlan as generatePlanLegacy } from '../planner'
import type { PlanStep } from '../../../../shared/types'

/** 团队版 Planner 系统提示词：更细的拆解 */
export const PLANNER_SYSTEM_PROMPT = `你是 AI 团队的 Planner，作为团队成员工作。
你的职责：
1. 把 Leader 分配的目标拆解为 3-7 个具体的 step
2. 每个 step 必须有明确的标题、类型、估算时长（分钟）
3. 识别 step 之间的依赖关系，按合理顺序输出
4. 输出顺序：先 research/design，再 code，再 test，最后 deploy

输出要求（严格遵守）：
1. 先用自然语言流式输出你的规划思考过程，说明：
   - 你如何理解 Leader 分配的目标
   - 你打算拆成哪几个阶段、各自的依赖关系
   - 估算总时长
2. 思考过程结束后，输出一个 JSON 步骤块（必须用 \`\`\`json 代码块包裹），格式：
   \`\`\`json
   { "steps": [{ "id": 1, "title": "...", "type": "code"|"design"|"test"|"research"|"deploy", "estimated_minutes": 5 }] }
   \`\`\`
3. 步骤数量 3-7 个，id 从 1 开始递增
4. JSON 步骤块必须是输出的最后部分，之后不要再输出任何文字`

/** 团队版 Planner 输出：更细的 step 含估算时长 */
export interface TeamPlanStep extends PlanStep {
  estimated_minutes?: number
}

/** JSON 步骤块的运行时形状 */
interface RawPlanStep {
  id: number
  title: string
  type: 'code' | 'design' | 'test' | 'research' | 'deploy'
  estimated_minutes?: number
}

/**
 * 从 Planner 流式输出末尾解析 JSON 步骤块。
 * 优先匹配最后一个 ```json ... ``` 代码块；失败时尝试匹配裸 JSON 对象。
 */
function parsePlanSteps(text: string): RawPlanStep[] | null {
  const codeBlockMatches = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/g)
  if (codeBlockMatches && codeBlockMatches.length > 0) {
    const lastBlock = codeBlockMatches[codeBlockMatches.length - 1]
    const jsonStr = lastBlock
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '')
    try {
      const obj = JSON.parse(jsonStr)
      if (obj && Array.isArray(obj.steps) && obj.steps.length > 0) {
        return obj.steps as RawPlanStep[]
      }
    } catch {
      /* fall through */
    }
  }

  // fallback：匹配包含 "steps" 字段的裸 JSON 对象
  const bareMatch = text.match(/\{[\s\S]*?"steps"[\s\S]*?\}/)
  if (bareMatch) {
    try {
      const obj = JSON.parse(bareMatch[0])
      if (obj && Array.isArray(obj.steps) && obj.steps.length > 0) {
        return obj.steps as RawPlanStep[]
      }
    } catch {
      /* fall through */
    }
  }

  return null
}

/**
 * 团队成员视角的 Planner：拆解任务为更细的 step（真流式）。
 *
 * 流程：
 *   1. 用 streamText 流式输出规划思考，每个 text-delta 通过 onToken 回调推送前端
 *   2. 流结束后从完整文本末尾解析 JSON 步骤块
 *   3. 解析失败时降级为单步 plan（直接 code 类型，把 goal 作为标题）
 *
 * @param goal Leader 分配的目标
 * @param context 当前协作上下文
 * @param onToken 流式 token 回调（每个 text-delta 触发一次）
 * @returns PlanStep[]（含 estimated_minutes）
 */
export async function runPlanner(
  goal: string,
  context: string,
  onToken?: (token: string) => void,
): Promise<TeamPlanStep[]> {
  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

  const result = streamText({
    model: openai.chat(modelName),
    system: PLANNER_SYSTEM_PROMPT,
    prompt:
      `目标：${goal}\n\n` +
      `当前协作上下文：\n${context || '（无）'}\n\n` +
      `请先流式输出你的规划思考过程，最后输出 JSON 步骤块。`,
  })

  let fullText = ''
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta' && part.text) {
      fullText += part.text
      onToken?.(part.text)
    }
  }

  const steps = parsePlanSteps(fullText)
  if (steps) {
    return steps.map((s) => ({
      id: s.id,
      title: s.title,
      type: s.type,
      status: 'pending' as const,
      estimated_minutes: s.estimated_minutes,
    }))
  }

  // fallback：解析失败，返回单步 plan
  return [
    {
      id: 1,
      title: goal,
      type: 'code' as const,
      status: 'pending' as const,
      estimated_minutes: 10,
    },
  ]
}

/**
 * 复用 Batch B 的 legacy generatePlan。
 * 当 teamConfig 不含 planner 时，仍可用此函数兜底生成 plan。
 */
export { generatePlanLegacy as generatePlan }
