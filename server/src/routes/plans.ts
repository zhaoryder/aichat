// =====================================================================
// Plan Mode API
// ---------------------------------------------------------------------
// 挂载在 /api 下，提供以下端点：
//   POST   /vibe-code/plan          生成 plan（调 AI 拆解 step），保存到 plans 表
//   GET    /plans/:id               查询 plan
//   PATCH  /plans/:id               编辑 steps（拖拽排序 / 删除 / 追加）/ goal
//   POST   /plans/:id/execute       SSE 流式执行：按 step 推进，每步 token + done
//   POST   /plans/:id/pause         暂停执行
//   POST   /plans/:id/skip/:stepId  跳过某 step
// =====================================================================

import { Router, Request, Response } from 'express'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { authMiddleware } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import { generatePlan } from '../lib/agents/planner'
import { loadSkillTools, loadSkillSystemPrompt } from '../lib/skill-registry'
import { createVibeTools } from '../lib/vibe-tools'
import type { Plan, PlanStep } from '../../shared/types'

export const plansRouter = Router()

// ---------------------------------------------------------------------
// 辅助：规范化 step（确保 id 从 1 递增、status 默认 pending）
// ---------------------------------------------------------------------

/** 把 step 数组的 id 重排为 1..N，保留原顺序 */
function renumberSteps(steps: PlanStep[]): PlanStep[] {
  return steps.map((s, i) => ({ ...s, id: i + 1 }))
}

/** 把 plans 表行（snake_case jsonb）转为 Plan 类型 */
function rowToPlan(row: Record<string, unknown>): Plan {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    project_id: (row.project_id as string | null) ?? null,
    goal: row.goal as string,
    steps: (row.steps as PlanStep[]) ?? [],
    current_step: (row.current_step as number) ?? 0,
    status: (row.status as Plan['status']) ?? 'draft',
    mode: (row.mode as Plan['mode']) ?? 'single',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/** 校验 steps 数组结构合法性 */
function isValidSteps(steps: unknown): steps is PlanStep[] {
  if (!Array.isArray(steps)) return false
  for (const s of steps) {
    if (typeof s !== 'object' || s === null) return false
    const step = s as Partial<PlanStep>
    if (typeof step.title !== 'string' || !step.title) return false
    if (
      !['code', 'design', 'test', 'research', 'deploy'].includes(step.type ?? '')
    ) {
      return false
    }
  }
  return true
}

// ---------------------------------------------------------------------
// POST /vibe-code/plan —— 生成 plan（调 AI 拆解 step）
// ---------------------------------------------------------------------

interface CreatePlanBody {
  goal?: unknown
  mode?: unknown
  projectId?: unknown
}

plansRouter.post(
  '/vibe-code/plan',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const body = req.body as CreatePlanBody
    const goal = typeof body.goal === 'string' ? body.goal.trim() : ''
    const mode =
      typeof body.mode === 'string' &&
      ['single', 'plan', 'team'].includes(body.mode)
        ? (body.mode as Plan['mode'])
        : 'plan'
    const projectId =
      typeof body.projectId === 'string' ? body.projectId : null

    if (!goal) {
      res.status(400).json({ error: 'goal 必填' })
      return
    }

    try {
      // 1. 调 AI 生成 plan
      const generated = await generatePlan(goal)

      // 2. 规范化 step：补全 status='pending'，renumber
      const steps: PlanStep[] = renumberSteps(
        generated.steps.map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          status: 'pending' as const,
        })),
      )

      // 3. 保存到 plans 表
      const { data, error } = await supabase
        .from('plans')
        .insert({
          user_id: user.id,
          project_id: projectId,
          goal: generated.goal,
          steps,
          current_step: 0,
          status: 'ready',
          mode,
        })
        .select()
        .single()

      if (error) throw error
      if (!data) {
        res.status(500).json({ error: '保存 plan 失败' })
        return
      }

      res.json({ plan: rowToPlan(data as unknown as Record<string, unknown>) })
    } catch (err) {
      console.error('[POST /vibe-code/plan] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '生成 plan 失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// GET /plans/:id —— 查询 plan
// ---------------------------------------------------------------------

plansRouter.get(
  '/plans/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const { id } = req.params

    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        res.status(404).json({ error: 'Plan 不存在' })
        return
      }

      const row = data as unknown as Record<string, unknown>
      // 仅本人可读
      if (row.user_id !== user.id) {
        res.status(403).json({ error: '无权访问该 plan' })
        return
      }

      res.json({ plan: rowToPlan(row) })
    } catch (err) {
      console.error('[GET /plans/:id] error:', err)
      res.status(500).json({ error: '获取 plan 失败' })
    }
  },
)

// ---------------------------------------------------------------------
// PATCH /plans/:id —— 编辑 steps（拖拽排序 / 删除 / 追加）/ goal
// ---------------------------------------------------------------------

interface UpdatePlanBody {
  steps?: unknown
  goal?: unknown
}

plansRouter.patch(
  '/plans/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const { id } = req.params
    const body = req.body as UpdatePlanBody

    try {
      // 先查 plan，确认权限
      const { data: existing, error: queryError } = await supabase
        .from('plans')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (queryError) throw queryError
      if (!existing) {
        res.status(404).json({ error: 'Plan 不存在' })
        return
      }
      const existingRow = existing as unknown as Record<string, unknown>
      if (existingRow.user_id !== user.id) {
        res.status(403).json({ error: '无权修改该 plan' })
        return
      }

      // 构造更新对象
      const update: Record<string, unknown> = {}
      if (typeof body.goal === 'string' && body.goal.trim()) {
        update.goal = body.goal.trim()
      }
      if (body.steps !== undefined) {
        if (!isValidSteps(body.steps)) {
          res.status(400).json({ error: 'steps 结构不合法' })
          return
        }
        // 规范化：renumber + 补全 status（已存在的 step 保留 status，新增的设为 pending）
        const oldStepsById = new Map<number, PlanStep>(
          (existingRow.steps as PlanStep[] ?? []).map((s) => [s.id, s]),
        )
        const normalized = renumberSteps(
          (body.steps as PlanStep[]).map((s, i) => {
            const old = oldStepsById.get(s.id) ?? oldStepsById.get(i + 1)
            return {
              id: i + 1,
              title: s.title,
              type: s.type,
              status: s.status ?? old?.status ?? 'pending',
              ...(s.agent_role ? { agent_role: s.agent_role } : {}),
              ...(s.result ? { result: s.result } : {}),
              ...(s.started_at ? { started_at: s.started_at } : {}),
              ...(s.completed_at ? { completed_at: s.completed_at } : {}),
            } as PlanStep
          }),
        )
        update.steps = normalized
      }

      if (Object.keys(update).length === 0) {
        res.status(400).json({ error: '未提供任何可更新字段' })
        return
      }

      const { data, error } = await supabase
        .from('plans')
        .update(update)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      res.json({ plan: rowToPlan(data as unknown as Record<string, unknown>) })
    } catch (err) {
      console.error('[PATCH /plans/:id] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '更新 plan 失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// POST /plans/:id/execute —— SSE 流式执行
// ---------------------------------------------------------------------
// 遍历 steps，对每个 step：
//   1. 发送 event: step_start data: { stepId }
//   2. 调 streamText 让 AI 完成该 step（基于前序结果上下文）
//   3. 流式发送 event: token data: { c: string }
//   4. 发送 event: step_done data: { stepId, result }
// 全部完成后发送 event: done
// 支持 abortSignal（客户端断开连接时取消）
// ---------------------------------------------------------------------

plansRouter.post(
  '/plans/:id/execute',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const { id } = req.params

    try {
      // 加载 plan
      const { data: planRow, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (planError) throw planError
      if (!planRow) {
        res.status(404).json({ error: 'Plan 不存在' })
        return
      }
      const row = planRow as unknown as Record<string, unknown>
      if (row.user_id !== user.id) {
        res.status(403).json({ error: '无权执行该 plan' })
        return
      }

      const plan = rowToPlan(row)
      if (!plan.steps || plan.steps.length === 0) {
        res.status(400).json({ error: 'Plan 没有 steps，无法执行' })
        return
      }

      // 状态校验：executing 中拒绝；已完成/失败/暂停则重置未完成 step 后允许重新执行
      if (plan.status === 'executing') {
        res.status(400).json({ error: 'Plan 正在执行中，请先暂停' })
        return
      }
      if (
        plan.status === 'completed' ||
        plan.status === 'failed' ||
        plan.status === 'paused'
      ) {
        const resetSteps = plan.steps.map((s) =>
          s.status === 'completed' || s.status === 'skipped'
            ? s
            : { ...s, status: 'pending' as const },
        )
        await supabase
          .from('plans')
          .update({ status: 'executing', steps: resetSteps })
          .eq('id', id)
        plan.steps = resetSteps
        plan.status = 'executing'
      }

      // 标记为 executing
      await supabase
        .from('plans')
        .update({ status: 'executing' })
        .eq('id', id)

      // 设置 SSE 头
      setSSEHeaders(res)

      // abortSignal：客户端断开时取消
      const abortController = new AbortController()
      req.on('close', () => {
        if (!abortController.signal.aborted) {
          abortController.abort()
        }
      })

      // 加载 skill 工具（createVibeTools 闭包捕获 userId/projectId，无需 globalThis）
      const planProjectId = plan.project_id ?? undefined
      const skillTools = await loadSkillTools(user.id, planProjectId)
      const activeTools =
        Object.keys(skillTools).length > 0
          ? skillTools
          : createVibeTools(user.id, planProjectId)
      const skillPromptSuffix = await loadSkillSystemPrompt(user.id)

      // 构造 OpenAI client
      const openai = createOpenAI({
        apiKey: process.env.AGNES_API_KEY!,
        baseURL: process.env.AGNES_API_BASE!,
      })
      const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

      const EXEC_SYSTEM_PROMPT =
        `你是一个 Vibe Coding Agent，正在按计划逐步执行任务。` +
        `当前整体目标：${plan.goal}\n\n` +
        `工作方式：\n` +
        `- 每一步会单独发给你，你只需完成当前 step` +
        (skillPromptSuffix ? `\n\n--- 已安装 Skill 能力说明 ---\n${skillPromptSuffix}` : '')

      // 累积的执行上下文（前序 step 的 result）
      const stepContext: Array<{ title: string; result: string }> = []
      let allSuccess = true
      let anySuccess = plan.steps.some(
        (s) => s.status === 'completed',
      )

      for (let i = 0; i < plan.steps.length; i++) {
        if (abortController.signal.aborted) break

        const step = plan.steps[i]

        // 跳过已完成或已跳过的 step
        if (step.status === 'completed' || step.status === 'skipped') {
          if (step.result) {
            stepContext.push({ title: step.title, result: step.result })
          }
          continue
        }

        // 标记当前 step 状态为 in_progress
        const nowIso = new Date().toISOString()
        const updatedStepsInProgress = plan.steps.map((s, idx) =>
          idx === i
            ? { ...s, status: 'in_progress' as const, started_at: nowIso }
            : s,
        )
        await supabase
          .from('plans')
          .update({
            steps: updatedStepsInProgress,
            current_step: i,
            status: 'executing',
          })
          .eq('id', id)

        // 发送 step_start 事件
        sendEvent(res, 'step_start', { stepId: step.id, step })

        // 构造 step 提示
        const contextText =
          stepContext.length > 0
            ? stepContext
                .map(
                  (c, idx) =>
                    `Step ${idx + 1}「${c.title}」已完成，结果：\n${c.result}`,
                )
                .join('\n\n')
            : '（无前序步骤）'

        const stepPrompt = `当前需要完成的步骤：\n标题：${step.title}\n类型：${step.type}\n\n前序步骤完成情况：\n${contextText}\n\n请完成当前步骤。`

        // 调 streamText
        let stepResult = ''
        try {
          const result = streamText({
            model: openai.chat(modelName),
            system: EXEC_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: stepPrompt }],
            tools: activeTools,
            abortSignal: abortController.signal,
            onFinish: ({ text }) => {
              stepResult = text
            },
          })

          // 流式转发 token
          for await (const part of result.fullStream) {
            if (abortController.signal.aborted) break
            switch (part.type) {
              case 'text-delta': {
                if (part.text) {
                  sendEvent(res, 'token', { c: part.text, stepId: step.id })
                }
                break
              }
              case 'tool-call': {
                sendEvent(res, 'tool_call', {
                  id: part.toolCallId,
                  name: part.toolName,
                  args: part.input ?? {},
                  stepId: step.id,
                })
                break
              }
              case 'tool-result': {
                sendEvent(res, 'tool_result', {
                  id: part.toolCallId,
                  name: part.toolName,
                  result: part.output,
                  stepId: step.id,
                })
                break
              }
              case 'tool-error': {
                sendEvent(res, 'tool_result', {
                  id: part.toolCallId,
                  name: part.toolName,
                  result: {
                    error:
                      part.error instanceof Error
                        ? part.error.message
                        : '工具执行失败',
                  },
                  stepId: step.id,
                })
                break
              }
              default:
                break
            }
          }

          // 标记 step 完成
          const completedIso = new Date().toISOString()
          const updatedStepsCompleted = updatedStepsInProgress.map((s, idx) =>
            idx === i
              ? {
                  ...s,
                  status: 'completed' as const,
                  result: stepResult || '(无文本输出)',
                  completed_at: completedIso,
                }
              : s,
          )
          await supabase
            .from('plans')
            .update({ steps: updatedStepsCompleted, current_step: i + 1 })
            .eq('id', id)

          // 累积上下文
          stepContext.push({ title: step.title, result: stepResult })
          anySuccess = true

          // 发送 step_done 事件
          sendEvent(res, 'step_done', {
            stepId: step.id,
            result: stepResult || '(无文本输出)',
          })
        } catch (stepErr) {
          // 单步失败：标记 failed，继续下一步
          allSuccess = false
          const failedIso = new Date().toISOString()
          const errMsg =
            stepErr instanceof Error ? stepErr.message : '执行失败'
          const updatedStepsFailed = updatedStepsInProgress.map((s, idx) =>
            idx === i
              ? {
                  ...s,
                  status: 'failed' as const,
                  result: errMsg,
                  completed_at: failedIso,
                }
              : s,
          )
          await supabase
            .from('plans')
            .update({
              steps: updatedStepsFailed,
              status: 'failed',
            })
            .eq('id', id)

          sendEvent(res, 'step_done', {
            stepId: step.id,
            result: errMsg,
            error: true,
          })

          // 单步失败时继续执行后续 step
          continue
        }
      }

      // 标记 plan 最终状态
      // - 所有 step 都 completed → 'completed'
      // - 有 step failed 但也有 completed → 'completed'（部分成功）
      // - 所有 step 都 failed → 'failed'
      const finalStatus = abortController.signal.aborted
        ? 'paused'
        : anySuccess
          ? 'completed'
          : 'failed'
      await supabase
        .from('plans')
        .update({ status: finalStatus })
        .eq('id', id)

      // 发送 done 事件
      sendEvent(res, 'done', { status: finalStatus })
    } catch (err) {
      console.error('[POST /plans/:id/execute] error:', err)
      if (!res.headersSent) {
        res.status(500).json({
          error: err instanceof Error ? err.message : '执行 plan 失败',
        })
      } else {
        sendEvent(res, 'error', {
          error: err instanceof Error ? err.message : '执行 plan 失败',
        })
      }
    } finally {
      if (res.headersSent) res.end()
    }
  },
)

// ---------------------------------------------------------------------
// POST /plans/:id/pause —— 暂停执行
// ---------------------------------------------------------------------

plansRouter.post(
  '/plans/:id/pause',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const { id } = req.params

    try {
      // 校验权限
      const { data: existing, error: queryError } = await supabase
        .from('plans')
        .select('user_id, status')
        .eq('id', id)
        .maybeSingle()

      if (queryError) throw queryError
      if (!existing) {
        res.status(404).json({ error: 'Plan 不存在' })
        return
      }
      const row = existing as unknown as Record<string, unknown>
      if (row.user_id !== user.id) {
        res.status(403).json({ error: '无权操作该 plan' })
        return
      }

      const { error } = await supabase
        .from('plans')
        .update({ status: 'paused' })
        .eq('id', id)

      if (error) throw error
      res.json({ success: true })
    } catch (err) {
      console.error('[POST /plans/:id/pause] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '暂停 plan 失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// POST /plans/:id/skip/:stepId —— 跳过某 step
// ---------------------------------------------------------------------

plansRouter.post(
  '/plans/:id/skip/:stepId',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const id = req.params.id as string
    const stepId = req.params.stepId as string
    const stepIdNum = parseInt(stepId, 10)
    if (!Number.isFinite(stepIdNum)) {
      res.status(400).json({ error: 'stepId 必须为数字' })
      return
    }

    try {
      // 加载 plan
      const { data: existing, error: queryError } = await supabase
        .from('plans')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (queryError) throw queryError
      if (!existing) {
        res.status(404).json({ error: 'Plan 不存在' })
        return
      }
      const row = existing as unknown as Record<string, unknown>
      if (row.user_id !== user.id) {
        res.status(403).json({ error: '无权操作该 plan' })
        return
      }

      const plan = rowToPlan(row)
      const targetIdx = plan.steps.findIndex((s) => s.id === stepIdNum)
      if (targetIdx < 0) {
        res.status(404).json({ error: 'Step 不存在' })
        return
      }

      // 标记该 step 为 skipped，current_step 推进
      const updatedSteps = plan.steps.map((s, idx) =>
        idx === targetIdx
          ? { ...s, status: 'skipped' as const, completed_at: new Date().toISOString() }
          : s,
      )
      const newCurrent = Math.max(plan.current_step, targetIdx + 1)

      const { data, error } = await supabase
        .from('plans')
        .update({ steps: updatedSteps, current_step: newCurrent })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      res.json({ plan: rowToPlan(data as unknown as Record<string, unknown>) })
    } catch (err) {
      console.error('[POST /plans/:id/skip/:stepId] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '跳过 step 失败',
      })
    }
  },
)
