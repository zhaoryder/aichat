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
import { createVibeTools } from '../../vibe-tools'
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

流式输出要求（重要）：
- 在调用任何工具之前，必须先输出一段文字说明你的意图与计划，例如：
  "我来分析一下任务，打算先创建 index.html，包含..."
  "我先用 writeFile 写入基础结构，包含标题、表单和按钮..."
- 每次工具调用返回结果后，再输出一段文字说明结果与下一步打算
- 不要在没有任何文字输出的情况下直接调用工具——这会让用户看不到任何反馈
- 工具调用之间用文字串起完整的工作流叙述，让用户能跟上你的思路

代码要求：
1. 完整 HTML 文件（<!DOCTYPE html> 到 </html>）
2. CSS 在 <style>，JS 在 <script>，不用外部 CDN（除非用户明确要求）
3. 现代美观设计，有动画和交互
4. 功能完整可用

重要：
- 始终通过 writeFile 工具输出代码（path 设为 "index.html"）
- 不要在普通回复中直接粘贴大段代码
- 如果 Leader 或 Reviewer 给出修改意见，请基于意见调整代码

自主调试（重要）：
- writeFile 后主动调用 captureIframeSnapshot 捕获 iframe DOM 结构化快照
  · 检查 DOM 树是否符合预期（表单 / 按钮 / 图片 / 链接数量）
  · 检查可见文本是否正确显示
  · 检查主容器计算样式（display / backgroundColor / fontSize）是否符合设计
  · 这相当于让你"看到"渲染后的页面，用于验证 UI 实现质量
- 若 captureIframeSnapshot 显示异常（元素缺失 / 布局错乱 / 文本不对），主动修复
- 若 getIframeErrors / getConsoleLogs 显示错误，立即修复而非继续推进
- 完成代码前必须确认 captureIframeSnapshot 输出符合需求`

/** 创建绑定到指定用户/项目上下文的 Coder 工具集 */
function createCoderTools(userId: string, projectId?: string): ToolSet {
  const vibeTools = createVibeTools(userId, projectId)
  return {
    writeFile: vibeTools.writeFile,
    readFile: vibeTools.readFile,
    executeCode: vibeTools.executeCode,
    webSearch: vibeTools.webSearch,
    generateImage: vibeTools.generateImage,
    generateVideo: vibeTools.generateVideo,
    readTerminal: vibeTools.readTerminal,
    listFiles: vibeTools.listFiles,
    install: vibeTools.install,
    // A1 自动调试闭环工具（由前端 WebContainer 沙箱拦截执行）
    getIframeErrors: vibeTools.getIframeErrors,
    getConsoleLogs: vibeTools.getConsoleLogs,
    verifyRendering: vibeTools.verifyRendering,
    // P2-8 多模态：DOM 结构化快照（让 AI"看到"渲染后的页面）
    captureIframeSnapshot: vibeTools.captureIframeSnapshot,
  }
}

/**
 * Coder 工具集：从 vibe-tools.ts 引用，只保留写代码相关。
 * @deprecated 使用 createCoderTools(userId, projectId) 创建绑定用户上下文的工具集。
 */
export const coderTools: ToolSet = createCoderTools('', undefined)

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
  // 加载用户已安装且启用的 skill 工具（含 bash / writeFile 等 stub）
  // createVibeTools 闭包捕获 userId/projectId，无需 globalThis（P0-2 修复）
  const skillTools = await loadSkillTools(userId, projectId)
  const activeTools: ToolSet =
    Object.keys(skillTools).length > 0
      ? skillTools
      : createCoderTools(userId, projectId)
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
