// =====================================================================
// CodeReviewCard：Reviewer 角色产出的代码审查卡片
// ---------------------------------------------------------------------
// - 三维度评分雷达图（security / maintainability / performance）
//   使用 recharts RadarChart 渲染，暗色模式适配
// - issues 列表：按 severity（critical / warning / info）配色 + 行号
// - 总体评语 summary
// - 入场动画：slide-up-fade（与 PlanPanel 一致）
// =====================================================================

import { ShieldCheck, ShieldAlert, ShieldX, Info } from 'lucide-react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'
import type { CodeReviewResult } from '@shared/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------
// 严重程度 → 配色 + 图标
// ---------------------------------------------------------------------

type Severity = CodeReviewResult['issues'][number]['severity']

interface SeverityMeta {
  label: string
  icon: typeof ShieldCheck
  text: string
  bg: string
  border: string
}

const SEVERITY_META: Record<Severity, SeverityMeta> = {
  critical: {
    label: '严重',
    icon: ShieldX,
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-200 dark:border-red-900/50',
  },
  warning: {
    label: '警告',
    icon: ShieldAlert,
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-900/50',
  },
  info: {
    label: '提示',
    icon: Info,
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-900/50',
  },
}

// ---------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------

interface CodeReviewCardProps {
  review: CodeReviewResult
  /** 可选：自定义容器类名 */
  className?: string
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

export function CodeReviewCard({ review, className }: CodeReviewCardProps) {
  const { security, maintainability, performance, issues, summary } = review

  // 雷达图数据：recharts RadarChart 要求 [{ dim, score }]
  const radarData = [
    { dim: '安全', score: security },
    { dim: '可维护', score: maintainability },
    { dim: '性能', score: performance },
  ]

  // 综合评分（取最低维度，决定卡片边框配色）
  const minScore = Math.min(security, maintainability, performance)
  const overallTone =
    minScore >= 80
      ? 'border-emerald-200 dark:border-emerald-900/60'
      : minScore >= 60
        ? 'border-amber-200 dark:border-amber-900/60'
        : 'border-red-200 dark:border-red-900/60'

  // 按严重程度分组计数
  const counts = {
    critical: issues.filter((i) => i.severity === 'critical').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  }

  return (
    <div
      className={cn(
        'w-full rounded-xl border bg-white dark:bg-gray-900 shadow-sm animate-slide-up-fade overflow-hidden',
        overallTone,
        className,
      )}
    >
      {/* 顶部：标题 + 综合评分 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-purple-500 dark:text-purple-400" />
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
            Code Review
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-medium">
          {counts.critical > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 text-red-700 dark:text-red-300">
              <ShieldX className="h-3 w-3" />
              {counts.critical}
            </span>
          )}
          {counts.warning > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
              <ShieldAlert className="h-3 w-3" />
              {counts.warning}
            </span>
          )}
          {counts.info > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 px-1.5 py-0.5 text-blue-700 dark:text-blue-300">
              <Info className="h-3 w-3" />
              {counts.info}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 p-3">
        {/* 左：雷达图 */}
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart
              data={radarData}
              cx="50%"
              cy="50%"
              outerRadius="70%"
            >
              <PolarGrid
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-700"
              />
              <PolarAngleAxis
                dataKey="dim"
                tick={{ fill: 'currentColor', fontSize: 11 }}
                className="text-gray-600 dark:text-gray-300"
              />
              <PolarRadiusAxis
                domain={[0, 100]}
                tickCount={5}
                tick={{ fill: 'currentColor', fontSize: 9 }}
                className="text-gray-400 dark:text-gray-500"
              />
              <Radar
                name="score"
                dataKey="score"
                stroke="#a855f7"
                fill="#a855f7"
                fillOpacity={0.35}
                strokeWidth={2}
                isAnimationActive
                animationDuration={500}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 右：评分数字 + 评语 */}
        <div className="flex flex-col gap-2 min-w-0">
          <div className="grid grid-cols-3 gap-2">
            <ScoreCell label="安全" score={security} />
            <ScoreCell label="可维护" score={maintainability} />
            <ScoreCell label="性能" score={performance} />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">
            {summary}
          </p>
        </div>
      </div>

      {/* Issues 列表 */}
      {issues.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-2 max-h-44 overflow-y-auto scrollbar-thin">
          <ul className="space-y-1.5">
            {issues.map((issue, idx) => {
              const meta = SEVERITY_META[issue.severity]
              const Icon = meta.icon
              return (
                <li
                  key={`issue-${idx}`}
                  className={cn(
                    'flex items-start gap-1.5 rounded-md border px-2 py-1 text-xs',
                    meta.bg,
                    meta.border,
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', meta.text)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('font-medium', meta.text)}>
                        {meta.label}
                      </span>
                      {typeof issue.line === 'number' && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          L{issue.line}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 dark:text-gray-200 leading-snug break-words">
                      {issue.message}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// 评分单元
// ---------------------------------------------------------------------

function ScoreCell({ label, score }: { label: string; score: number }) {
  const tone =
    score >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : score >= 60
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'

  return (
    <div className="flex flex-col items-center justify-center rounded-md bg-gray-50 dark:bg-gray-800/60 py-1.5">
      <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className={cn('text-base font-bold tabular-nums', tone)}>
        {score}
      </span>
    </div>
  )
}
