// =====================================================================
// Executor 角色（AI Teamwork Batch C - C3.4）
// ---------------------------------------------------------------------
// 职责：
//   - 在沙箱中运行代码、跑测试、捕获错误
//   - 调用 bash / readFile / listFiles 工具
//   - 若发现错误，由 team-orchestrator 回到 Coder 修复
// =====================================================================

import { streamText, isStepCount } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { vibeCodeTools, setVibeContext } from '../../vibe-tools'
import { loadSkillTools, loadSkillSystemPrompt } from '../../skill-registry'
import type { ToolSet } from 'ai'

/** Executor streamText 结果类型 */
export type ExecutorStreamResult = ReturnType<typeof streamText>

/** Executor 系统提示词 */
export const EXECUTOR_SYSTEM_PROMPT = `你是 AI 团队的 Executor，专注于在沙箱中运行代码、跑测试、捕获错误。

工作方式：
- 调用 bash 工具执行 shell 命令（如 npm install / npm test / git status）
- 调用 readFile 工具读取代码或日志
- 调用 listFiles 工具查看目录结构
- 捕获命令的输出（stdout / stderr）并整理为简短报告

输出要求：
- 用文字总结执行结果：是否通过 / 失败原因 / 建议下一步
- 不要直接修改代码（修改由 Coder 负责）
- 若测试失败，明确指出错误信息与涉及的文件`

/** Executor 工具集：偏向运行/查看 */
export const executorTools: ToolSet = {
  bash: vibeCodeTools.executeCode, // 兼容：bash 在 skill-registry 中是 stub，这里用 executeCode 兜底
  readFile: vibeCodeTools.readFile,
  executeCode: vibeCodeTools.executeCode,
}

/**
 * 启动 Executor 流式输出。
 *
 * @param task Leader 分配的任务描述（通常是"运行测试并报告结果"）
 * @param context 当前协作上下文（如 Coder 刚写的代码摘要）
 * @param userId 用户 ID（用于加载用户已安装的 skill 工具）
 * @param projectId 项目 ID（用于 writeFile 上下文）
 * @returns streamText 的结果对象，调用方可消费 fullStream
 */
export async function runExecutor(
  task: string,
  context: string,
  userId: string,
  projectId?: string,
): Promise<ExecutorStreamResult> {
  // 设置 Vibe 上下文
  setVibeContext(userId, projectId)

  // 加载用户已安装且启用的 skill 工具（含 bash stub 由前端桥接）
  const skillTools = await loadSkillTools(userId)
  const activeTools: ToolSet =
    Object.keys(skillTools).length > 0 ? skillTools : executorTools
  const skillPromptSuffix = await loadSkillSystemPrompt(userId)

  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

  const systemPrompt = skillPromptSuffix
    ? EXECUTOR_SYSTEM_PROMPT + skillPromptSuffix
    : EXECUTOR_SYSTEM_PROMPT

  const userPrompt =
    `任务：${task}\n\n` +
    `当前协作上下文：\n${context || '（无）'}\n\n` +
    `请执行代码或测试并报告结果。`

  return streamText({
    model: openai.chat(modelName),
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: activeTools,
    // ai v7：用 stopWhen: isStepCount(N) 替代旧 maxSteps
    stopWhen: isStepCount(8),
  })
}
