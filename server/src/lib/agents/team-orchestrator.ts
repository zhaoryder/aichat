// =====================================================================
// Team Orchestrator（AI Teamwork Batch C - C4）
// ---------------------------------------------------------------------
// 异步状态机：协调 6 个角色按序接力，通过 SSE 把进度推给前端。
//
// 核心流程：
//   1. startTeamSession(userId, goal, config)
//      → 创建 team_sessions 记录，返回 session
//   2. runTeamStep(sessionId, res)
//      → Leader 决策下一步角色
//      → SSE event: role data: { role, task }
//      → 调对应角色的 run 函数
//      → Coder 完成后，若团队含 Reviewer，触发 Reviewer
//      → Reviewer 评分 < 60 → 回到 Coder 修复（最多 3 轮）
//      → 全部完成 → Leader 触发 Reporter → event: done
//      → 失败 → event: error
//
// 每条 SSE 事件都带 role 字段，前端按 role 路由到对应消息气泡。
// =====================================================================

import { Response } from 'express'
import { supabase } from '../supabase'
import { setSSEHeaders, sendEvent } from '../sse'
import { setVibeContext } from '../vibe-tools'
import {
  runLeader,
  runPlanner,
  runCoder,
  runExecutor,
  runReviewer,
  runReporter,
} from './roles'
import type {
  TeamSession,
  TeamMessage,
  TeamConfig,
  TeamRole,
  CodeReviewResult,
} from '../../../shared/types'

/** 最大 Coder 修复轮次（Reviewer 评分 < 60 时回到 Coder） */
const MAX_CODER_ROUNDS = 3
/** Leader 决策循环上限（防死循环） */
const MAX_LEADER_ROUNDS = 12

// ---------------------------------------------------------------------
// 辅助：team_sessions 表行 → TeamSession 类型
// ---------------------------------------------------------------------

function rowToSession(row: Record<string, unknown>): TeamSession {
  const currentRole = row.current_role as TeamRole | null | undefined
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    plan_id: (row.plan_id as string | null) ?? null,
    goal: row.goal as string,
    roles: (row.roles as TeamRole[]) ?? [],
    current_role: currentRole ?? null,
    status: (row.status as TeamSession['status']) ?? 'active',
    transcript: (row.transcript as TeamMessage[]) ?? [],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/** 把 message 追加到 transcript 并持久化 */
async function appendTranscript(
  sessionId: string,
  message: TeamMessage,
): Promise<void> {
  // 先读现有 transcript
  const { data, error } = await supabase
    .from('team_sessions')
    .select('transcript')
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !data) {
    console.error('[team-orchestrator] appendTranscript read error:', error)
    return
  }

  const transcript = (data.transcript as TeamMessage[]) ?? []
  transcript.push(message)

  await supabase
    .from('team_sessions')
    .update({ transcript })
    .eq('id', sessionId)
}

/** 更新 session 的 current_role 与 status */
async function updateSessionState(
  sessionId: string,
  currentRole: TeamRole | null,
  status: TeamSession['status'],
): Promise<void> {
  await supabase
    .from('team_sessions')
    .update({
      current_role: currentRole,
      status,
    })
    .eq('id', sessionId)
}

/** 构造协作上下文摘要（给 Leader / 各角色看） */
function buildContext(transcript: TeamMessage[]): string {
  if (transcript.length === 0) return '（初始状态，无前序输出）'
  return transcript
    .slice(-6) // 最近 6 条消息，避免 prompt 过长
    .map((m) => {
      const roleLabel = m.agent_role ? `[${m.agent_role}]` : '[user]'
      const content =
        m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content
      return `${roleLabel} ${content}`
    })
    .join('\n\n')
}

// ---------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------

/**
 * 创建 team_session 并返回。
 *
 * @param userId 用户 ID
 * @param goal 用户描述的目标
 * @param config 团队配置（roles / leader_model / member_model）
 * @returns 创建后的 TeamSession
 */
export async function startTeamSession(
  userId: string,
  goal: string,
  config: TeamConfig,
): Promise<TeamSession> {
  // 确保至少有 Leader + Coder（默认）
  const roles = config.roles && config.roles.length > 0
    ? config.roles
    : (['leader', 'coder'] as TeamRole[])

  const { data, error } = await supabase
    .from('team_sessions')
    .insert({
      user_id: userId,
      goal,
      roles,
      current_role: null,
      status: 'active',
      transcript: [],
    })
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('创建 team_session 失败')

  return rowToSession(data as unknown as Record<string, unknown>)
}

/**
 * 异步状态机：跑一轮 Team 协作。
 *
 * 流程：
 *   1. Leader 决策下一步角色 → SSE event: role data: { role, task }
 *   2. 调对应角色的 run 函数，流式输出 → SSE event: token data: { c, role }
 *   3. Coder 完成后，若 team 含 Reviewer → 触发 Reviewer → SSE event: review
 *   4. 任一维度 < 60 → 回到 Coder 修复（最多 MAX_CODER_ROUNDS 轮）
 *   5. 全部完成 → Leader 触发 Reporter → SSE event: done
 *
 * @param sessionId team_sessions.id
 * @param res Express Response（用于 SSE 推流）
 */
export async function runTeamStep(
  sessionId: string,
  res: Response,
): Promise<void> {
  // 设置 SSE 响应头
  setSSEHeaders(res)

  // abortSignal：客户端断开时取消
  const abortController = new AbortController()
  res.on('close', () => {
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
  })

  try {
    // 加载 session
    const { data: sessionRow, error: sessionError } = await supabase
      .from('team_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionError) throw sessionError
    if (!sessionRow) {
      sendEvent(res, 'error', { error: 'team_session 不存在' })
      res.end()
      return
    }

    const session = rowToSession(sessionRow as unknown as Record<string, unknown>)

    if (session.status === 'paused') {
      sendEvent(res, 'error', { error: 'team_session 已暂停，无法执行' })
      res.end()
      return
    }

    if (session.status === 'completed' || session.status === 'failed') {
      sendEvent(res, 'error', { error: `team_session 已 ${session.status}` })
      res.end()
      return
    }

    // 提取用户目标（transcript 中的最后一条 user 消息，或 session.goal）
    const lastUserMsg = [...session.transcript]
      .reverse()
      .find((m) => m.role === 'user')
    const goal = lastUserMsg?.content || session.goal

    // 设置 Vibe 上下文（Coder / Executor 工具会用到）
    setVibeContext(session.user_id, session.plan_id ?? undefined)

    // 累积最近一次 Coder 写的代码（供 Reviewer 审查）
    let latestCode = ''
    let coderRound = 0
    let leaderRound = 0

    // 协作循环
    while (leaderRound < MAX_LEADER_ROUNDS) {
      leaderRound++
      if (abortController.signal.aborted) break

      // ---------- Step 1: Leader 决策 ----------
      const context = buildContext(session.transcript)
      let decision
      try {
        decision = await runLeader(goal, context, {
          roles: session.roles,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Leader 决策失败'
        sendEvent(res, 'error', { error: msg, role: 'leader' })
        await updateSessionState(sessionId, null, 'failed')
        break
      }

      if (abortController.signal.aborted) break

      // Leader 决定结束 → 触发 Reporter
      if (decision.nextRole === 'done') {
        await runReporterAndEmit(sessionId, session, res, abortController.signal)
        await updateSessionState(sessionId, null, 'completed')
        sendEvent(res, 'done', { status: 'completed' })
        break
      }

      const nextRole = decision.nextRole
      const task = decision.task

      // 更新 current_role
      await updateSessionState(sessionId, nextRole, 'active')

      // SSE 推送 role 事件（前端按 role 创建新消息占位）
      sendEvent(res, 'role', { role: nextRole, task })

      // ---------- Step 2: 调对应角色 ----------
      try {
        if (nextRole === 'planner') {
          await runPlannerRole(sessionId, session, task, res, abortController.signal)
        } else if (nextRole === 'coder') {
          latestCode = await runCoderRole(
            sessionId,
            session,
            task,
            res,
            abortController.signal,
          )
          coderRound++

          // ---------- Step 3: Reviewer 评分（若团队含） ----------
          if (
            session.roles.includes('reviewer') &&
            latestCode &&
            coderRound <= MAX_CODER_ROUNDS
          ) {
            const review = await runReviewerRole(
              sessionId,
              session,
              latestCode,
              context,
              res,
              abortController.signal,
            )

            // 任一维度 < 60 → 让 Leader 在下一轮回到 Coder 修复
            if (review) {
              const minScore = Math.min(
                review.security,
                review.maintainability,
                review.performance,
              )
              if (minScore < 60 && coderRound >= MAX_CODER_ROUNDS) {
                // 已达修复上限：标记 failed
                sendEvent(res, 'error', {
                  error: `代码评分过低（${minScore}），已达最大修复轮次`,
                  role: 'reviewer',
                })
                await updateSessionState(sessionId, null, 'failed')
                sendEvent(res, 'done', { status: 'failed' })
                break
              }
            }
          }
        } else if (nextRole === 'executor') {
          await runExecutorRole(
            sessionId,
            session,
            task,
            res,
            abortController.signal,
          )

          // 若 team 没有 reviewer，但 executor 失败 → 让 Leader 决策回到 coder
        } else if (nextRole === 'reviewer') {
          // Leader 直接派 reviewer：用 latestCode 兜底
          if (latestCode) {
            await runReviewerRole(
              sessionId,
              session,
              latestCode,
              context,
              res,
              abortController.signal,
            )
          }
        } else if (nextRole === 'reporter') {
          // Leader 直接派 reporter
          await runReporterAndEmit(sessionId, session, res, abortController.signal)
          await updateSessionState(sessionId, null, 'completed')
          sendEvent(res, 'done', { status: 'completed' })
          break
        } else if (nextRole === 'leader') {
          // Leader 自循环：什么都不做，下一轮再决策
          // 把 Leader 的 task 作为一条 assistant 消息记录
          const leaderMsg: TeamMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            agent_role: 'leader',
            content: task,
            timestamp: new Date().toISOString(),
          }
          await appendTranscript(sessionId, leaderMsg)
          session.transcript.push(leaderMsg)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : `${nextRole} 执行失败`
        sendEvent(res, 'error', { error: msg, role: nextRole })
        // 不直接 failed：让 Leader 在下一轮决策
        // 但若已超出循环上限，标记 failed
        if (leaderRound >= MAX_LEADER_ROUNDS) {
          await updateSessionState(sessionId, null, 'failed')
          sendEvent(res, 'done', { status: 'failed' })
          break
        }
      }
    }

    // 循环用尽仍未完成：标记 failed
    if (leaderRound >= MAX_LEADER_ROUNDS) {
      await updateSessionState(sessionId, null, 'failed')
      if (!res.writableEnded) {
        sendEvent(res, 'error', { error: '协作循环超出上限' })
        sendEvent(res, 'done', { status: 'failed' })
      }
    }
  } catch (err) {
    console.error('[team-orchestrator] runTeamStep error:', err)
    if (!res.writableEnded) {
      sendEvent(res, 'error', {
        error: err instanceof Error ? err.message : 'team 执行失败',
      })
    }
  } finally {
    if (!res.writableEnded) {
      res.end()
    }
  }
}

// ---------------------------------------------------------------------
// 内部：执行单个角色并消费流式输出
// ---------------------------------------------------------------------

/** 执行 Planner：把步骤拆解作为 assistant 消息追加到 transcript */
async function runPlannerRole(
  sessionId: string,
  session: TeamSession,
  task: string,
  res: Response,
  signal: AbortSignal,
): Promise<void> {
  const context = buildContext(session.transcript)
  const steps = await runPlanner(task, context)

  // 把步骤列表渲染为 markdown
  const stepsText = steps
    .map(
      (s, i) =>
        `${i + 1}. **${s.title}** (${s.type})` +
        (s.estimated_minutes ? ` · ${s.estimated_minutes}min` : ''),
    )
    .join('\n')

  const content = `已拆解 ${steps.length} 个步骤：\n\n${stepsText}`

  // 推送 token（一次性，planner 不流式）
  sendEvent(res, 'token', { c: content, role: 'planner' })

  // 追加 transcript
  const msg: TeamMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    agent_role: 'planner',
    content,
    timestamp: new Date().toISOString(),
  }
  await appendTranscript(sessionId, msg)
  session.transcript.push(msg)

  // signal 中断时直接返回，由调用循环统一处理
  if (signal.aborted) return
}

/**
 * 执行 Coder：流式消费 token + 工具调用，返回最新 writeFile 的 content。
 */
async function runCoderRole(
  sessionId: string,
  session: TeamSession,
  task: string,
  res: Response,
  signal: AbortSignal,
): Promise<string> {
  const context = buildContext(session.transcript)
  const result = await runCoder(task, context, session.user_id, session.plan_id ?? undefined)

  let assistantText = ''
  let latestCode = ''

  for await (const part of result.fullStream) {
    if (signal.aborted) break
    switch (part.type) {
      case 'text-delta': {
        if (part.text) {
          assistantText += part.text
          sendEvent(res, 'token', { c: part.text, role: 'coder' })
        }
        break
      }
      case 'tool-call': {
        // 追踪 writeFile 工具调用的 content（供 Reviewer 审查）
        if (part.toolName === 'writeFile') {
          const input = part.input as { content?: unknown } | undefined
          if (input && typeof input.content === 'string' && input.content) {
            latestCode = input.content
          }
        }
        sendEvent(res, 'tool_call', {
          id: part.toolCallId,
          name: part.toolName,
          args: part.input ?? {},
          role: 'coder',
        })
        break
      }
      case 'tool-result': {
        sendEvent(res, 'tool_result', {
          id: part.toolCallId,
          name: part.toolName,
          result: part.output,
          role: 'coder',
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
          role: 'coder',
        })
        break
      }
      default:
        break
    }
  }

  // 追加 transcript
  const msg: TeamMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    agent_role: 'coder',
    content: assistantText || '(无文本输出)',
    timestamp: new Date().toISOString(),
    tool_calls: latestCode
      ? [{ id: 'coder-writeFile', name: 'writeFile', args: { path: 'index.html', content: latestCode } }]
      : undefined,
  }
  await appendTranscript(sessionId, msg)
  session.transcript.push(msg)

  return latestCode
}

/** 执行 Executor：流式消费 token + 工具调用 */
async function runExecutorRole(
  sessionId: string,
  session: TeamSession,
  task: string,
  res: Response,
  signal: AbortSignal,
): Promise<void> {
  const context = buildContext(session.transcript)
  const result = await runExecutor(task, context, session.user_id, session.plan_id ?? undefined)

  let assistantText = ''

  for await (const part of result.fullStream) {
    if (signal.aborted) break
    switch (part.type) {
      case 'text-delta': {
        if (part.text) {
          assistantText += part.text
          sendEvent(res, 'token', { c: part.text, role: 'executor' })
        }
        break
      }
      case 'tool-call': {
        sendEvent(res, 'tool_call', {
          id: part.toolCallId,
          name: part.toolName,
          args: part.input ?? {},
          role: 'executor',
        })
        break
      }
      case 'tool-result': {
        sendEvent(res, 'tool_result', {
          id: part.toolCallId,
          name: part.toolName,
          result: part.output,
          role: 'executor',
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
          role: 'executor',
        })
        break
      }
      default:
        break
    }
  }

  const msg: TeamMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    agent_role: 'executor',
    content: assistantText || '(无文本输出)',
    timestamp: new Date().toISOString(),
  }
  await appendTranscript(sessionId, msg)
  session.transcript.push(msg)
}

/**
 * 执行 Reviewer：调 AI 返回结构化评分，发送 review 事件。
 * @returns CodeReviewResult 或 null（失败时）
 */
async function runReviewerRole(
  sessionId: string,
  session: TeamSession,
  code: string,
  context: string,
  res: Response,
  signal: AbortSignal,
): Promise<CodeReviewResult | null> {
  if (signal.aborted) return null

  let review: CodeReviewResult | null = null
  try {
    review = await runReviewer(code, context)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Reviewer 失败'
    sendEvent(res, 'error', { error: msg, role: 'reviewer' })
    return null
  }

  if (!review) return null

  // 发送 review 事件（前端展示 CodeReviewCard）
  sendEvent(res, 'review', { review, role: 'reviewer' })

  // 追加 transcript（以 JSON 摘要形式记录）
  const reviewText =
    `代码评分：security=${review.security}, ` +
    `maintainability=${review.maintainability}, ` +
    `performance=${review.performance}\n` +
    `问题：${review.issues.length} 个\n` +
    `总结：${review.summary}`

  const msg: TeamMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    agent_role: 'reviewer',
    content: reviewText,
    timestamp: new Date().toISOString(),
  }
  await appendTranscript(sessionId, msg)
  session.transcript.push(msg)

  return review
}

/** 执行 Reporter：生成总结并发送 done 事件 */
async function runReporterAndEmit(
  sessionId: string,
  session: TeamSession,
  res: Response,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return

  const progress = session.transcript
    .map((m) => {
      const roleLabel = m.agent_role ? `[${m.agent_role}]` : '[user]'
      return `${roleLabel} ${m.content}`
    })
    .join('\n')

  const context = buildContext(session.transcript)
  let summary = ''
  try {
    summary = await runReporter(progress, context)
  } catch {
    summary = '团队已完成所有任务。'
  }

  // 流式发送 summary（拆为短句以便前端逐字显示）
  sendEvent(res, 'token', { c: summary, role: 'reporter' })

  const msg: TeamMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    agent_role: 'reporter',
    content: summary,
    timestamp: new Date().toISOString(),
  }
  await appendTranscript(sessionId, msg)
  session.transcript.push(msg)
}

/**
 * 追加一条 user 消息到 transcript（用于 /api/team/:id/message 端点）。
 */
export async function appendUserMessage(
  sessionId: string,
  userId: string,
  message: string,
): Promise<TeamSession> {
  const msg: TeamMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  }
  await appendTranscript(sessionId, msg)

  // 重新加载 session
  const { data, error } = await supabase
    .from('team_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('team_session 不存在')

  const session = rowToSession(data as unknown as Record<string, unknown>)

  // 校验权限
  if (session.user_id !== userId) {
    throw new Error('无权访问该 team_session')
  }

  return session
}

/**
 * 标记 session 为 paused（用户主动停止）。
 */
export async function pauseTeamSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  // 校验权限
  const { data, error } = await supabase
    .from('team_sessions')
    .select('user_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('team_session 不存在')

  const row = data as unknown as Record<string, unknown>
  if (row.user_id !== userId) {
    throw new Error('无权操作该 team_session')
  }

  const { error: updateError } = await supabase
    .from('team_sessions')
    .update({ status: 'paused' })
    .eq('id', sessionId)

  if (updateError) throw updateError
}

/** 获取 team_session（含权限校验） */
export async function getTeamSession(
  sessionId: string,
  userId: string,
): Promise<TeamSession> {
  const { data, error } = await supabase
    .from('team_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('team_session 不存在')

  const session = rowToSession(data as unknown as Record<string, unknown>)
  if (session.user_id !== userId) {
    throw new Error('无权访问该 team_session')
  }

  return session
}
