// =====================================================================
// PlanPanel：Plan Mode 规划执行面板
// ---------------------------------------------------------------------
// 显示 AI 拆解的 steps 列表，支持：
//   - 进度条（completed / total）
//   - step 列表：序号 + 类型图标 + 标题 + 状态徽章
//   - 当前 step 高亮 + 脉冲
//   - 编辑模式：上下移动 / 删除 / 追加 step
//   - 操作按钮："开始执行" / "暂停" / "跳过此步"
// 暗色模式 + 动画（scale + 阴影 + ease-out 0.3s）
// =====================================================================

import { useState } from 'react'
import {
  Code2,
  Palette,
  FlaskConical,
  Search,
  Rocket,
  CircleCheck,
  CirclePause,
  CirclePlay,
  CircleX,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Loader2,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react'
import type { Plan, PlanStep, PlanStepType, PlanStepStatus } from '@shared/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------
// 类型 → 图标 + 配色
// ---------------------------------------------------------------------

const STEP_TYPE_META: Record<
  PlanStepType,
  { icon: typeof Code2; label: string; color: string; bg: string }
> = {
  code: {
    icon: Code2,
    label: '代码',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
  },
  design: {
    icon: Palette,
    label: '设计',
    color: 'text-pink-600 dark:text-pink-400',
    bg: 'bg-pink-50 dark:bg-pink-950/50',
  },
  test: {
    icon: FlaskConical,
    label: '测试',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
  },
  research: {
    icon: Search,
    label: '调研',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/50',
  },
  deploy: {
    icon: Rocket,
    label: '部署',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/50',
  },
}

// ---------------------------------------------------------------------
// 状态 → 徽章
// ---------------------------------------------------------------------

const STEP_STATUS_META: Record<
  PlanStepStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }
> = {
  pending: { label: '待执行', variant: 'outline', className: 'text-gray-500 dark:text-gray-400' },
  in_progress: {
    label: '执行中',
    variant: 'default',
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  completed: {
    label: '已完成',
    variant: 'default',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  skipped: {
    label: '已跳过',
    variant: 'secondary',
    className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
  failed: {
    label: '失败',
    variant: 'destructive',
    className: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
  },
}

// ---------------------------------------------------------------------
// 组件 Props
// ---------------------------------------------------------------------

interface PlanPanelProps {
  plan: Plan | null
  /** 编辑 steps 后回调（拖拽排序 / 删除 / 追加） */
  onEdit?: (steps: PlanStep[]) => void
  /** 点击开始执行 */
  onExecute?: () => void
  /** 点击暂停 */
  onPause?: () => void
  /** 点击跳过当前 step */
  onSkip?: (stepId: number) => void
  /** 是否正在执行中（外部状态，控制按钮 disabled） */
  isExecuting?: boolean
  /** 关闭 PlanPanel */
  onClose?: () => void
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

export function PlanPanel({
  plan,
  onEdit,
  onExecute,
  onPause,
  onSkip,
  isExecuting = false,
  onClose,
}: PlanPanelProps) {
  const [editMode, setEditMode] = useState(false)
  const [newStepTitle, setNewStepTitle] = useState('')
  const [newStepType, setNewStepType] = useState<PlanStepType>('code')

  if (!plan) return null

  const steps = plan.steps ?? []
  const completedCount = steps.filter((s) => s.status === 'completed').length
  const totalCount = steps.length
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  // 当前 step：第一个 in_progress，否则第一个 pending
  const currentStep =
    steps.find((s) => s.status === 'in_progress') ??
    steps.find((s) => s.status === 'pending')

  const isRunning = isExecuting || plan.status === 'executing'
  const isPaused = plan.status === 'paused'
  const isDone = plan.status === 'completed' || plan.status === 'failed'

  // -----------------------------------------------------------------
  // 编辑模式操作
  // -----------------------------------------------------------------

  const handleMoveStep = (idx: number, direction: 'up' | 'down') => {
    if (!onEdit) return
    const newSteps = [...steps]
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= newSteps.length) return
    ;[newSteps[idx], newSteps[targetIdx]] = [newSteps[targetIdx], newSteps[idx]]
    // 重新编号
    onEdit(newSteps.map((s, i) => ({ ...s, id: i + 1 })))
  }

  const handleDeleteStep = (idx: number) => {
    if (!onEdit) return
    const newSteps = steps.filter((_, i) => i !== idx)
    onEdit(newSteps.map((s, i) => ({ ...s, id: i + 1 })))
  }

  const handleAddStep = () => {
    if (!onEdit || !newStepTitle.trim()) return
    const newStep: PlanStep = {
      id: steps.length + 1,
      title: newStepTitle.trim(),
      type: newStepType,
      status: 'pending',
    }
    onEdit([...steps, newStep])
    setNewStepTitle('')
  }

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 animate-slide-up-fade">
      {/* 顶部：goal + 进度条 + 操作按钮 */}
      <div className="px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <CirclePlay className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                Plan Mode
              </span>
              {plan.status && (
                <Badge
                  variant={STEP_STATUS_META[mapPlanStatusToStepStatus(plan.status)].variant}
                  className={cn(
                    'ml-1 text-[10px] py-0 px-1.5',
                    STEP_STATUS_META[mapPlanStatusToStepStatus(plan.status)].className,
                  )}
                >
                  {PLAN_STATUS_LABELS[plan.status]}
                </Badge>
              )}
            </div>
            <h3 className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {plan.goal}
            </h3>
            {/* 进度条 */}
            <div className="mt-2 flex items-center gap-2">
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-amber-500 transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                {completedCount}/{totalCount}
              </span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex shrink-0 items-center gap-1">
            {!isRunning && !isDone && (
              <Button
                size="sm"
                onClick={onExecute}
                className="gap-1 transition-transform duration-300 ease-out hover:scale-[1.02]"
              >
                <CirclePlay className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {isPaused ? '继续执行' : '开始执行'}
                </span>
              </Button>
            )}
            {isRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={onPause}
                className="gap-1 transition-transform duration-300 ease-out hover:scale-[1.02]"
              >
                <CirclePause className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">暂停</span>
              </Button>
            )}
            {isRunning && currentStep && onSkip && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSkip(currentStep.id)}
                className="gap-1 transition-transform duration-300 ease-out hover:scale-[1.02]"
              >
                <CircleX className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">跳过此步</span>
              </Button>
            )}
            {!isRunning && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditMode((v) => !v)}
                className="gap-1"
                title={editMode ? '完成编辑' : '编辑步骤'}
              >
                {editMode ? <CircleCheck className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              </Button>
            )}
            {onClose && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="h-7 w-7 p-0"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Steps 列表 */}
      <div className="max-h-72 overflow-y-auto px-3 pb-3 scrollbar-thin">
        <ol className="space-y-1.5">
          {steps.map((step, idx) => {
            const typeMeta = STEP_TYPE_META[step.type]
            const statusMeta = STEP_STATUS_META[step.status]
            const TypeIcon = typeMeta.icon
            const isCurrent = currentStep?.id === step.id && step.status === 'in_progress'
            const isCompleted = step.status === 'completed'
            const isFailed = step.status === 'failed'

            return (
              <li
                key={`step-${step.id}-${idx}`}
                className={cn(
                  'group relative flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-all duration-300 ease-out',
                  isCurrent
                    ? 'border-primary bg-primary/5 shadow-md scale-[1.01] ring-1 ring-primary/20'
                    : isCompleted
                      ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/30'
                      : isFailed
                        ? 'border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/30'
                        : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-sm',
                )}
              >
                {/* 序号 + 类型图标 */}
                <div
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                    typeMeta.bg,
                  )}
                >
                  {isCompleted ? (
                    <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <TypeIcon className={cn('h-4 w-4', typeMeta.color)} />
                  )}
                </div>

                {/* 标题 + 状态 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                      #{step.id}
                    </span>
                    <p
                      className={cn(
                        'truncate text-sm font-medium',
                        isCompleted
                          ? 'text-gray-500 dark:text-gray-400 line-through'
                          : 'text-gray-800 dark:text-gray-200',
                      )}
                    >
                      {step.title}
                    </p>
                  </div>
                  {step.result && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                      {step.result}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className={cn('py-0 text-[10px]', typeMeta.color, typeMeta.bg)}
                    >
                      {typeMeta.label}
                    </Badge>
                    <Badge
                      variant={statusMeta.variant}
                      className={cn('py-0 text-[10px]', statusMeta.className)}
                    >
                      {isCurrent && (
                        <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                      )}
                      {statusMeta.label}
                    </Badge>
                  </div>
                </div>

                {/* 编辑模式操作 */}
                {editMode && !isRunning && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleMoveStep(idx, 'up')}
                      disabled={idx === 0}
                      className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30"
                      title="上移"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveStep(idx, 'down')}
                      disabled={idx === steps.length - 1}
                      className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30"
                      title="下移"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStep(idx)}
                      className="rounded p-1 text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* 拖拽手柄（非编辑模式不显示） */}
                {editMode && !isRunning && (
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300 dark:text-gray-600" />
                )}
              </li>
            )
          })}

          {/* 编辑模式：追加 step */}
          {editMode && !isRunning && (
            <li className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={newStepTitle}
                  onChange={(e) => setNewStepTitle(e.target.value)}
                  placeholder="新步骤标题..."
                  className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAddStep()
                    }
                  }}
                />
                <select
                  value={newStepType}
                  onChange={(e) => setNewStepType(e.target.value as PlanStepType)}
                  className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-1.5 py-0.5 text-xs text-gray-700 dark:text-gray-300 focus:border-primary focus:outline-none"
                >
                  <option value="code">代码</option>
                  <option value="design">设计</option>
                  <option value="test">测试</option>
                  <option value="research">调研</option>
                  <option value="deploy">部署</option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddStep}
                  disabled={!newStepTitle.trim()}
                  className="h-7 gap-1 px-2"
                >
                  <Plus className="h-3 w-3" />
                  添加
                </Button>
              </div>
            </li>
          )}
        </ol>

        {/* 空状态 */}
        {steps.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Plan 没有 steps
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// 辅助：plan 状态映射到 step 状态徽章（仅用于显示）
// ---------------------------------------------------------------------

function mapPlanStatusToStepStatus(planStatus: Plan['status']): PlanStepStatus {
  switch (planStatus) {
    case 'executing':
      return 'in_progress'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'paused':
      return 'skipped'
    default:
      return 'pending'
  }
}

const PLAN_STATUS_LABELS: Record<Plan['status'], string> = {
  draft: '草稿',
  planning: '规划中',
  ready: '待执行',
  executing: '执行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
}
