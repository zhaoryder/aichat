// =====================================================================
// Coder 角色（AI Teamwork Batch C - C3.3）
// ---------------------------------------------------------------------
// 职责：
//   - 写代码（调用 writeFile / bash / readFile / install 等工具）
//   - 输出流式 token，由 team-orchestrator 转发到前端
// 工具集从 vibe-tools.ts 引用：
//   - writeFile / readFile / executeCode / webSearch / generateImage / generateVideo
// =====================================================================

import { streamText, isStepCount } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { vibeCodeTools, setVibeContext } from '../../vibe-tools'
import { loadSkillTools, loadSkillSystemPrompt } from '../../skill-registry'
import type { ToolSet } from 'ai'

/** Coder streamText 结果类型（ai v7 StreamTextResult 含 3 个泛型参数，用 ReturnType 简化） */
export type CoderStreamResult = ReturnType<typeof streamText>

/** Coder 系统提示词 */
export const CODER_SYSTEM_PROMPT = `你是 AI 团队的 Coder，专注于写代码。

工作方式：
- 调用 writeFile 工具写入完整 HTML 文件到 index.html（或其他指定路径）
- 调用 readFile 工具读取已有文件
- 调用 bash / executeCode 工具运行命令或代码片段
- 输出代码后用文字简短说明本次改动

代码要求：
1. 完整 HTML 文件（<!DOCTYPE html> 到 </html>）
2. CSS 在 <style>，JS 在 <script>，不用外部 CDN（除非用户明确要求）
3. 现代美观设计，有动画和交互
4. 功能完整可用

重要：
- 始终通过 writeFile 工具输出代码（path 设为 "index.html"）
- 不要在普通回复中直接粘贴大段代码
- 如果 Leader 或 Reviewer 给出修改意见，请基于意见调整代码`

/** Coder 工具集：从 vibe-tools.ts 引用，只保留写代码相关 */
export const coderTools: ToolSet = {
  writeFile: vibeCodeTools.writeFile,
  readFile: vibeCodeTools.readFile,
  executeCode: vibeCodeTools.executeCode,
  webSearch: vibeCodeTools.webSearch,
  generateImage: vibeCodeTools.generateImage,
  generateVideo: vibeCodeTools.generateVideo,
}

/**
 * 启动 Coder 流式输出。
 *
 * @param task Leader 分配的任务描述
 * @param context 当前协作上下文
 * @param userId 用户 ID（用于加载用户已安装的 skill 工具）
 * @param projectId 项目 ID（用于 writeFile 上下文）
 * @returns streamText 的结果对象，调用方可消费 fullStream
 */
export async function runCoder(
  task: string,
  context: string,
  userId: string,
  projectId?: string,
): Promise<CoderStreamResult> {
  // 设置 Vibe 上下文（writeFile/readFile 工具会用到）
  setVibeContext(userId, projectId)

  // 加载用户已安装且启用的 skill 工具（含 bash / writeFile 等 stub）
  const skillTools = await loadSkillTools(userId)
  const activeTools: ToolSet =
    Object.keys(skillTools).length > 0 ? skillTools : coderTools
  const skillPromptSuffix = await loadSkillSystemPrompt(userId)

  const openai = createOpenAI({
    apiKey: process.env.AGNES_API_KEY!,
    baseURL: process.env.AGNES_API_BASE!,
  })
  const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

  const systemPrompt = skillPromptSuffix
    ? CODER_SYSTEM_PROMPT + skillPromptSuffix
    : CODER_SYSTEM_PROMPT

  const userPrompt =
    `任务：${task}\n\n` +
    `当前协作上下文：\n${context || '（无）'}\n\n` +
    `请完成代码编写，使用 writeFile 工具输出代码。`

  return streamText({
    model: openai.chat(modelName),
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: activeTools,
    // ai v7：用 stopWhen: isStepCount(N) 替代旧 maxSteps
    // Coder 允许多轮工具调用（如先读再写）
    stopWhen: isStepCount(10),
  })
}
