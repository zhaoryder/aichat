// =====================================================================
// SubAgentCard：SubAgent 并行执行可视化卡片
// ---------------------------------------------------------------------
// 当 Leader 决定并行派发多个子任务时（nextRole='parallel'），
// 显示每个 SubAgent 的实时流式输出 / 状态 / 耗时。
//
// 数据来源：
//   - 后端 team-orchestrator.ts 发送 SSE 事件：
//     - role: 'sub_agent'  → 创建占位卡片
//     - sub_agent_token    → 追加流式 token 到对应 taskId
//     - sub_agent_done     → 标记完成，挂载 results
//
// UI 结构：
//   - 卡片标题：并行子任务数 + 总体进度（N/M 完成）
//   - 子任务列表：每个子任务一行，可展开查看流式输出
//   - 状态点：running（脉冲）/ success（绿）/ error（红）
// =====================================================================

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
} from 'lucide-react'
import type { TeamRole } from '@shared/types'
import { cn } from '@/lib/utils'

/** 单个 SubAgent 状态信息 */
export interface SubAgentInfo {
  /** SubAgent 任务 ID（后端 crypto.randomUUID() 生成） */
  taskId: string
  /** 角色 */
  role: TeamRole
  /** 流式累积的输出文本 */
  output: string
  /** 状态：running / success / error */
  status: 'running' | 'success' | 'error'
  /** 失败时的错误信息 */
  error?: string
  /** 耗时（ms），完成时填充 */
  durationMs?: number
}

interface SubAgentCardProps {
  /** 子任务列表 */
  subAgents: SubAgentInfo[]
  className?: string
}

/** 角色配色（与 VibeCodePage ROLE_BADGE_META 保持一致） */
const ROLE_META: Record<
  TeamRole,
  { label: string; dot: string; text: string; bg: string }
> = {
  leader: {
    label: 'Leader',
    dot: 'bg-purple-500',
    text: 'text-purple-600 dark:text-purple-300',
    bg: 'bg-purple-50 dark:bg-purple-950/40',
  },
  planner: {
    label: 'Planner',
    dot: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
  },
  coder: {
    label: 'Coder',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
  },
  executor: {
    label: 'Executor',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
  },
  reviewer: {
    label: 'Reviewer',
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/40',
  },
  reporter: {
    label: 'Reporter',
    dot: 'bg-gray-500',
    text: 'text-gray-600 dark:text-gray-300',
    bg: 'bg-gray-50 dark:bg-gray-800/60',
  },
}

/** 状态点元数据 */
function getStatusMeta(status: SubAgentInfo['status']) {
  switch (status) {
    case 'running':
      return {
        icon: Loader2,
        iconClass: 'animate-spin text-blue-500 dark:text-blue-400',
        dotClass: 'bg-blue-500 animate-pulse',
        label: '执行中',
        labelClass: 'text-blue-600 dark:text-blue-400',
      }
    case 'success':
      return {
        icon: CheckCircle2,
        iconClass: 'text-emerald-500 dark:text-emerald-400',
        dotClass: 'bg-emerald-500',
        label: '完成',
        labelClass: 'text-emerald-600 dark:text-emerald-400',
      }
    case 'error':
      return {
        icon: XCircle,
        iconClass: 'text-red-500 dark:text-red-400',
        dotClass: 'bg-red-500',
        label: '失败',
        labelClass: 'text-red-600 dark:text-red-400',
      }
  }
}

export function SubAgentCard({ subAgents, className }: SubAgentCardProps) {
  // 默认全部展开；用户可点击折叠
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(subAgents.map((s) => s.taskId)),
  )

  const toggle = (taskId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const total = subAgents.length
  const successCount = subAgents.filter((s) => s.status === 'success').length
  const errorCount = subAgents.filter((s) => s.status === 'error').length
  const runningCount = subAgents.filter((s) => s.status === 'running').length
  const allDone = runningCount === 0

  // 卡片整体色调：全部成功 → emerald；有失败 → red；运行中 → blue
  const overallTone = !allDone
    ? 'border-blue-200 dark:border-blue-900/60'
    : errorCount > 0
      ? 'border-red-200 dark:border-red-900/60'
      : 'border-emerald-200 dark:border-emerald-900/60'

  return (
    <div
      className={cn(
        'w-full rounded-xl border bg-white dark:bg-gray-900 shadow-sm animate-slide-up-fade overflow-hidden',
        overallTone,
        className,
      )}
    >
      {/* 顶部：标题 + 进度统计 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users className="h-4 w-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
            并行子任务
          </span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
            {successCount + errorCount}/{total}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-medium shrink-0">
          {runningCount > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 px-1.5 py-0.5 text-blue-700 dark:text-blue-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              {runningCount}
            </span>
          )}
          {successCount > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              {successCount}
            </span>
          )}
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 text-red-700 dark:text-red-300">
              <XCircle className="h-3 w-3" />
              {errorCount}
            </span>
          )}
        </div>
      </div>

      {/* 子任务列表 */}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {subAgents.map((agent) => {
          const meta = ROLE_META[agent.role]
          const statusMeta = getStatusMeta(agent.status)
          const StatusIcon = statusMeta.icon
          const expanded = expandedIds.has(agent.taskId)
          const hasOutput = agent.output.trim().length > 0 || agent.error

          return (
            <li key={agent.taskId} className="px-3 py-2">
              <button
                type="button"
                onClick={() => hasOutput && toggle(agent.taskId)}
                className={cn(
                  'flex w-full items-center gap-2 text-left',
                  !hasOutput && 'cursor-default',
                )}
              >
                {/* 展开图标 */}
                {hasOutput ? (
                  expanded ? (
                    <ChevronDown className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
                  )
                ) : (
                  <span className="w-3 shrink-0" />
                )}

                {/* 角色配色点 */}
                <span
                  className={cn(
                    'inline-block h-2 w-2 rounded-full shrink-0',
                    meta.dot,
                  )}
                />

                {/* 角色名 */}
                <span
                  className={cn(
                    'text-xs font-semibold shrink-0',
                    meta.text,
                  )}
                >
                  {meta.label}
                </span>

                {/* 状态图标 + 文本 */}
                <span className="ml-auto flex items-center gap-1 shrink-0">
                  <StatusIcon className={cn('h-3 w-3', statusMeta.iconClass)} />
                  <span className={cn('text-[10px]', statusMeta.labelClass)}>
                    {statusMeta.label}
                  </span>
                  {typeof agent.durationMs === 'number' && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      ·{(agent.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </span>
              </button>

              {/* 展开内容：流式输出 / 错误信息 */}
              {expanded && hasOutput && (
                <div className="mt-1.5 pl-5">
                  <pre
                    className={cn(
                      'whitespace-pre-wrap break-words rounded-md px-2 py-1.5 text-[11px] leading-relaxed font-mono max-h-32 overflow-y-auto scrollbar-thin',
                      agent.status === 'error'
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                        : 'bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200',
                    )}
                  >
                    {agent.error
                      ? `❌ ${agent.error}`
                      : agent.output || '(无文本输出)'}
                  </pre>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
