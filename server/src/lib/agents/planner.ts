// =====================================================================
// Planner：AI 自动生成结构化开发计划
// ---------------------------------------------------------------------
// 输入：用户用自然语言描述的需求（goal）
// 输出：{ goal, steps: Array<{id, title, type}> }
//
// 使用 Vercel AI SDK v7 的 generateObject + zod schema，
// 强制模型输出合法 JSON。模型走 Agnes API（agnes-2.0-flash）。
// =====================================================================

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'

/** Planner 系统提示词：要求模型输出 3-7 个 step */
const PLANNER_SYSTEM_PROMPT = `你是一个高级技术规划师。用户描述一个需求，你输出结构化的开发计划。

要求：
1. 拆分为 3-7 个 step
2. 每个 step 有明确的 title 和 type
3. type 可选：code（写代码）、design（设计 UI）、test（测试）、research（调研）、deploy（部署）
4. 步骤顺序合理：先 research/design，再 code，再 test，最后 deploy
5. 输出必须是合法 JSON，格式：{"goal": "...", "steps": [{"id":1,"title":"...","type":"code"}]}`

/** zod schema：generateObject 用，强制输出合法结构 */
const PLAN_SCHEMA = z.object({
  goal: z.string().describe('需求总结，一句话描述用户目标'),
  steps: z.array(
    z.object({
      id: z.number().describe('步骤序号，从 1 开始递增'),
      title: z.string().describe('步骤标题，简洁明确，不超过 30 字'),
      type: z
        .enum(['code', 'design', 'test', 'research', 'deploy'])
        .describe('步骤类型'),
    }),
  ).describe('步骤列表，3-7 个'),
})

/** generatePlan 输出类型 */
export interface GeneratedPlan {
  goal: string
  steps: Array<{
    id: number
    title: string
    type: 'code' | 'design' | 'test' | 'research' | 'deploy'
  }>
}

/**
 * 调用 AI 生成结构化开发计划。
 *
 * @param goal 用户描述的需求
 * @returns { goal, steps } 结构化计划
 */
export async function generatePlan(goal: string): Promise<GeneratedPlan> {
  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  // 模型名从环境变量读取，默认 agnes-2.0-flash（生产环境）
  const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

  const { object } = await generateObject({
    // .chat() 走 /chat/completions 端点（OpenAI 兼容服务都支持）
    model: openai.chat(modelName),
    system: PLANNER_SYSTEM_PROMPT,
    prompt: `请为以下需求生成开发计划：\n\n${goal}`,
    schema: PLAN_SCHEMA,
  })

  return object
}
