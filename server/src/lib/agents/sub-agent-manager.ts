// =====================================================================
// SubAgent 并行执行框架
// ---------------------------------------------------------------------
// 管理多个并行子 agent，每个子 agent 独立 streamText 调用与工具集。
// Leader 可创建 SubAgent 并行执行任务（如同时让 Coder 写 HTML + CSS + JS）。
// 结果合并后返回给 Leader。
// =====================================================================

import { streamText, isStepCount } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createVibeTools } from '../vibe-tools'
import { loadSkillTools } from '../skill-registry'
import type { ToolSet } from 'ai'
import type { TeamRole } from '../../../shared/types'

/** SubAgent 任务定义 */
export interface SubAgentTask {
  id: string
  role: TeamRole
  task: string
  context: string
  userId: string
  projectId?: string
}

/** SubAgent 执行结果 */
export interface SubAgentResult {
  taskId: string
  role: TeamRole
  success: boolean
  output: string
  toolCalls: Array<{ name: string; args: unknown; result?: unknown }>
  error?: string
  durationMs: number
}

/**
 * SubAgent 管理器：并行执行多个子 agent 任务。
 * 每个 SubAgent 独立 streamText 调用、独立工具集、独立 AbortController。
 */
export class SubAgentManager {
  private activeAgents: Map<string, AbortController> = new Map()

  constructor(
    private onToken: (taskId: string, token: string, role: TeamRole) => void,
  ) {}

  /**
   * 并行执行多个 SubAgent 任务。
   * @param tasks 任务列表
   * @returns 所有任务结果（按传入顺序，Promise.all 语义）
   */
  async runParallel(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const promises = tasks.map((task) => this.runSingle(task))
    return Promise.all(promises)
  }

  /**
   * 执行单个 SubAgent 任务（可独立调用）。
   */
  async runSingle(task: SubAgentTask): Promise<SubAgentResult> {
    const startTime = Date.now()
    const abortController = new AbortController()
    this.activeAgents.set(task.id, abortController)

    let output = ''
    const toolCalls: Array<{ name: string; args: unknown }> = []

    try {
      const skillTools = await loadSkillTools(task.userId, task.projectId)
      const activeTools: ToolSet =
        Object.keys(skillTools).length > 0
          ? skillTools
          : (createVibeTools(task.userId, task.projectId) as ToolSet)

      const openai = createOpenAI({
        apiKey: process.env.AGNES_API_KEY!,
        baseURL: process.env.AGNES_API_BASE!,
      })
      const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

      const result = streamText({
        model: openai.chat(modelName),
        system: this.getRolePrompt(task.role),
        messages: [
          {
            role: 'user',
            content:
              task.task + (task.context ? `\n\n上下文：\n${task.context}` : ''),
          },
        ],
        tools: activeTools,
        stopWhen: isStepCount(8),
        abortSignal: abortController.signal,
      })

      for await (const part of result.fullStream) {
        if (abortController.signal.aborted) break
        if (part.type === 'text-delta' && part.text) {
          output += part.text
          this.onToken(task.id, part.text, task.role)
        }
        if (part.type === 'tool-call') {
          toolCalls.push({ name: part.toolName, args: part.input })
        }
      }

      return {
        taskId: task.id,
        role: task.role,
        success: true,
        output,
        toolCalls,
        durationMs: Date.now() - startTime,
      }
    } catch (err) {
      return {
        taskId: task.id,
        role: task.role,
        success: false,
        output,
        toolCalls,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      }
    } finally {
      this.activeAgents.delete(task.id)
    }
  }

  /** 中止指定任务 */
  abort(taskId: string): void {
    const controller = this.activeAgents.get(taskId)
    if (controller) {
      controller.abort()
      this.activeAgents.delete(taskId)
    }
  }

  /** 中止所有任务 */
  abortAll(): void {
    for (const controller of this.activeAgents.values()) {
      controller.abort()
    }
    this.activeAgents.clear()
  }

  private getRolePrompt(role: TeamRole): string {
    const prompts: Record<TeamRole, string> = {
      leader: '你是 Leader，负责拆解任务并协调其他角色。',
      planner: '你是 Planner，负责输出详细的步骤拆解。',
      coder: '你是 Coder，负责编写代码。在调用任何工具之前，必须先输出一段文字说明你的意图与计划。',
      executor: '你是 Executor，负责执行命令、运行测试、捕获错误。',
      reviewer: '你是 Reviewer，负责结构化代码评分与问题清单。',
      reporter: '你是 Reporter，负责汇总阶段进度并输出最终总结。',
    }
    return prompts[role]
  }
}
