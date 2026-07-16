// =====================================================================
// Leader 角色（AI Teamwork Batch C - C3.1）
// ---------------------------------------------------------------------
// 职责：
//   - 拆解用户的整体目标为可执行任务
//   - 分配给团队其他角色（Planner / Coder / Executor / Reviewer / Reporter）
//   - 汇总各角色输出，决定下一步走向
//
// Leader 不直接调用工具（如 writeFile / bash），只做决策与分配，
// 因此 leaderTools 为空 ToolSet。
//
// 调用 Agnes API：agnes-2.0-flash
// =====================================================================

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { TeamRole, TeamConfig } from '../../../../shared/types'

/** Leader 系统提示词 */
export const LEADER_SYSTEM_PROMPT = `你是 AI 团队的 Leader，负责：
1. 拆解用户的整体目标为可执行任务
2. 分配给团队其他角色（Planner / Coder / Executor / Reviewer / Reporter）
3. 汇总各角色输出，决定下一步走向

工作原则：
- 若团队中有 Planner，优先让 Planner 细化步骤
- 若无 Planner，自行拆解并直接派给 Coder
- Coder 完成后若团队中有 Reviewer，触发 Reviewer 评分
- 任一维度评分 < 60 或执行失败，回到 Coder 修复（最多 3 轮）
- 全部完成后触发 Reporter 汇总

输出要求：
- 仅输出 JSON：{ "nextRole": "leader"|"planner"|"coder"|"executor"|"reviewer"|"reporter"|"done", "task": "..." }
- task 字段描述分配给下一个角色的具体任务
- 若任务已完成则 nextRole = "done"`

/** Leader 不直接调工具 */
export const leaderTools = {}

/** Leader 决策的输出结构 */
export interface LeaderDecision {
  /** 下一个执行的角色；'done' 表示全部完成 */
  nextRole: TeamRole | 'done'
  /** 分配给该角色的任务描述 */
  task: string
}

/** zod schema：generateObject 强制结构化输出 */
const LEADER_SCHEMA = z.object({
  nextRole: z
    .enum(['leader', 'planner', 'coder', 'executor', 'reviewer', 'reporter', 'done'])
    .describe('下一个执行的角色，done 表示全部完成'),
  task: z.string().describe('分配给该角色的具体任务描述'),
})

/**
 * 让 Leader 决策下一步角色与任务。
 *
 * @param goal 用户整体目标
 * @param context 当前协作上下文（已完成角色产出的摘要、当前轮次等）
 * @param teamConfig 团队配置（含启用的角色）
 * @returns { nextRole, task }
 */
export async function runLeader(
  goal: string,
  context: string,
  teamConfig: TeamConfig,
): Promise<LeaderDecision> {
  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  const modelName = teamConfig.leader_model || process.env.AGNES_MODEL || 'agnes-2.0-flash'

  const { object } = await generateObject({
    model: openai.chat(modelName),
    system: LEADER_SYSTEM_PROMPT,
    prompt:
      `用户目标：${goal}\n\n` +
      `团队已启用角色：${teamConfig.roles.join(', ')}\n\n` +
      `当前协作上下文：\n${context || '（初始状态，无前序输出）'}\n\n` +
      `请决定下一步该由哪个角色执行，并给出具体任务。`,
    schema: LEADER_SCHEMA,
  })

  // normalize：done 不属于 TeamRole，由调用方单独处理
  return {
    nextRole: object.nextRole as TeamRole | 'done',
    task: object.task,
  }
}
