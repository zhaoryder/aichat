// =====================================================================
// Executor 角色（AI Teamwork Batch C - C3.4）
// ---------------------------------------------------------------------
// 职责：
//   - 在沙箱中运行代码、跑测试、捕获错误
//   - 调用 bash / readFile / listFiles 工具
//   - 若发现错误，由 team-orchestrator 回到 Coder 修复
// =====================================================================

import { streamText, isStepCount, tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createVibeTools } from '../../vibe-tools'
import { loadSkillTools, loadSkillSystemPrompt } from '../../skill-registry'
import { z } from 'zod'
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
- 若测试失败，明确指出错误信息与涉及的文件

## 重要：bash 命令执行流程
- bash 工具的命令由前端 WebContainer 沙箱执行
- 调用 bash 后，必须立即调用 readTerminal 工具读取真实输出
- 不要假设命令执行成功，必须通过 readTerminal 验证结果
- 如果命令失败，读取错误信息并报告给 Leader`

/** bash stub：明确告知 AI bash 命令由前端 WebContainer 沙箱执行
 * 后端无法访问真实 shell（npm install / git init / npm test 等由前端执行）。
 * 调用后 AI 必须再调用 readTerminal 工具读取前端真实终端输出。 */
const bashStub = tool({
  description: '在 WebContainer 沙箱中执行 shell 命令（如 npm install / npm test / git status）。命令由前端沙箱执行，调用后请使用 readTerminal 工具读取真实输出。',
  inputSchema: z.object({
    command: z.string().describe('要执行的 shell 命令'),
  }),
  execute: async () => ({
    note: 'bash 命令已由前端 WebContainer 沙箱执行。请调用 readTerminal 工具获取真实输出。',
    output: '',
  }),
})

/** 创建绑定到指定用户/项目上下文的 Executor 工具集 */
function createExecutorTools(userId: string, projectId?: string): ToolSet {
  const vibeTools = createVibeTools(userId, projectId)
  return {
    bash: bashStub,
    readFile: vibeTools.readFile,
    executeCode: vibeTools.executeCode,
    readTerminal: vibeTools.readTerminal, // 让 AI 能读取前端真实终端输出
    listFiles: vibeTools.listFiles,
    install: vibeTools.install,
    // A1 自动调试闭环工具（由前端 WebContainer 沙箱拦截执行）
    getIframeErrors: vibeTools.getIframeErrors,
    getConsoleLogs: vibeTools.getConsoleLogs,
    verifyRendering: vibeTools.verifyRendering,
  }
}

/**
 * Executor 工具集：偏向运行/查看。
 * @deprecated 使用 createExecutorTools(userId, projectId) 创建绑定用户上下文的工具集。
 */
export const executorTools: ToolSet = createExecutorTools('', undefined)

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
  // 加载用户已安装且启用的 skill 工具（含 bash stub 由前端桥接）
  // createVibeTools 闭包捕获 userId/projectId，无需 globalThis（P0-2 修复）
  const skillTools = await loadSkillTools(userId, projectId)
  const activeTools: ToolSet =
    Object.keys(skillTools).length > 0
      ? skillTools
      : createExecutorTools(userId, projectId)
  const skillPromptSuffix = await loadSkillSystemPrompt(userId)

  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  // TODO(G5): 此处未读取 teamConfig.member_model，团队会话中无法按用户配置切换成员模型。
  // 对比 leader.ts 已通过 teamConfig.leader_model 覆盖；成员角色（coder/executor/
  // reviewer/reporter）的 run* 函数当前不接受 teamConfig 参数。修复需调整函数签名
  // 及所有调用点，暂留作后续优化。
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
