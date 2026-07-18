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
// 实现要点（真流式改造）：
//   原先用 generateObject 非流式输出 JSON，5-15s 静默期被用户误判为卡死。
//   现改为 streamText：先流式输出自然语言思考过程（逐 token 推给前端），
//   再在末尾输出 ```json 决策块，由 parseLeaderDecision 解析。
//
// 调用 Agnes API：agnes-2.0-flash
// =====================================================================

import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
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
- 尽量一次性规划完整角色执行链，避免多次回到 leader 增加延迟
- 全部完成后触发 Reporter 汇总

输出要求（严格遵守）：
1. 先用自然语言流式输出你的思考过程（1-3 段），说明：
   - 你如何理解用户目标
   - 打算分配给哪个角色、为什么
   - 期望该角色产出什么
2. 思考过程结束后，输出一个 JSON 决策块（必须用 \`\`\`json 代码块包裹），格式：
   \`\`\`json
   { "nextRole": "leader"|"planner"|"coder"|"executor"|"reviewer"|"reporter"|"done", "task": "..." }
   \`\`\`
3. task 字段描述分配给下一个角色的具体任务（用中文，明确具体）
4. 若任务已完成则 nextRole = "done"
5. JSON 决策块必须是输出的最后部分，决策块之后不要再输出任何文字`

/** Leader 不直接调工具 */
export const leaderTools = {}

/** Leader 决策的输出结构 */
export interface LeaderDecision {
  /** 下一个执行的角色；'done' 表示全部完成 */
  nextRole: TeamRole | 'done'
  /** 分配给该角色的任务描述 */
  task: string
}

/**
 * 从 Leader 流式输出末尾解析 JSON 决策块。
 * 优先匹配最后一个 ```json ... ``` 代码块；失败时尝试匹配裸 JSON 对象。
 */
function parseLeaderDecision(text: string): LeaderDecision | null {
  // 1. 优先匹配所有 ```json ... ``` 代码块，取最后一个
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
        typeof obj.nextRole === 'string' &&
        typeof obj.task === 'string'
      ) {
        return {
          nextRole: obj.nextRole as TeamRole | 'done',
          task: obj.task,
        }
      }
    } catch {
      /* fall through */
    }
  }

  // 2. fallback：匹配包含 nextRole 字段的裸 JSON 对象
  const bareMatch = text.match(/\{[^{}]*"nextRole"[^{}]*\}/)
  if (bareMatch) {
    try {
      const obj = JSON.parse(bareMatch[0])
      if (
        obj &&
        typeof obj.nextRole === 'string' &&
        typeof obj.task === 'string'
      ) {
        return {
          nextRole: obj.nextRole as TeamRole | 'done',
          task: obj.task,
        }
      }
    } catch {
      /* fall through */
    }
  }

  return null
}

/**
 * 让 Leader 决策下一步角色与任务（真流式）。
 *
 * 流程：
 *   1. 用 streamText 流式输出思考过程，每个 text-delta 通过 onToken 回调推送前端
 *   2. 流结束后从完整文本末尾解析 JSON 决策块
 *   3. 解析失败时降级为 nextRole=coder + task=goal
 *
 * @param goal 用户整体目标
 * @param context 当前协作上下文（已完成角色产出的摘要、当前轮次等）
 * @param teamConfig 团队配置（含启用的角色）
 * @param onToken 流式 token 回调（每个 text-delta 触发一次）
 * @returns { nextRole, task }
 */
export async function runLeader(
  goal: string,
  context: string,
  teamConfig: TeamConfig,
  onToken?: (token: string) => void,
): Promise<LeaderDecision> {
  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  const modelName = teamConfig.leader_model || process.env.AGNES_MODEL || 'agnes-2.0-flash'

  const result = streamText({
    model: openai.chat(modelName),
    system: LEADER_SYSTEM_PROMPT,
    prompt:
      `用户目标：${goal}\n\n` +
      `团队已启用角色：${teamConfig.roles.join(', ')}\n\n` +
      `当前协作上下文：\n${context || '（初始状态，无前序输出）'}\n\n` +
      `请先流式输出你的思考过程，最后输出 JSON 决策块。`,
  })

  let fullText = ''
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta' && part.text) {
      fullText += part.text
      onToken?.(part.text)
    }
  }

  const decision = parseLeaderDecision(fullText)
  if (decision) return decision

  // fallback：解析失败，默认分配 Coder，把 goal 作为任务
  return {
    nextRole: 'coder' as TeamRole,
    task: goal,
  }
}
