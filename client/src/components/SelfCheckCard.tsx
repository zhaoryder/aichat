// =====================================================================
// SelfCheckCard：开发完整性自检卡片
// ---------------------------------------------------------------------
// Coder 完成 writeFile 后，team-orchestrator 自动调用 runSelfCheck
// 执行 6 项静态检查（HTML 结构 / Meta 标签 / CSS / JS / 标签闭合 / 长度）
// 通过 SSE self_check 事件把 SelfCheckResult 推给前端。
//
// UI 结构：
//   - 顶部：标题 + 通过/未通过 状态徽章
//   - 6 项检查列表：✅/❌ + 检查项 + 详细信息
//   - 入场动画：slide-up-fade
// =====================================================================

import { CheckCircle2, XCircle, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 自检结果数据结构（与后端 self-check.ts SelfCheckResult 一致） */
export interface SelfCheckResultData {
  passed: boolean
  checks: Array<{
    name: string
    passed: boolean
    message: string
  }>
  summary: string
}

interface SelfCheckCardProps {
  result: SelfCheckResultData
  className?: string
}

export function SelfCheckCard({ result, className }: SelfCheckCardProps) {
  const { passed, checks, summary } = result
  const failedCount = checks.filter((c) => !c.passed).length

  return (
    <div
      className={cn(
        'w-full rounded-xl border bg-white dark:bg-gray-900 shadow-sm animate-slide-up-fade overflow-hidden',
        passed
          ? 'border-emerald-200 dark:border-emerald-900/60'
          : 'border-amber-200 dark:border-amber-900/60',
        className,
      )}
    >
      {/* 顶部：标题 + 状态徽章 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <ListChecks className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
            开发完整性自检
          </span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
            {checks.length - failedCount}/{checks.length}
          </span>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0',
            passed
              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
          )}
        >
          {passed ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          {passed ? '通过' : `${failedCount} 项未过`}
        </span>
      </div>

      {/* 检查项列表 */}
      <ul className="px-3 py-2 space-y-1">
        {checks.map((check, idx) => (
          <li
            key={`check-${idx}`}
            className={cn(
              'flex items-start gap-1.5 rounded-md px-2 py-1 text-xs',
              check.passed
                ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                : 'bg-amber-50 dark:bg-amber-950/30',
            )}
          >
            {check.passed ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500 dark:text-emerald-400" />
            ) : (
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500 dark:text-amber-400" />
            )}
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  'font-medium',
                  check.passed
                    ? 'text-gray-800 dark:text-gray-200'
                    : 'text-amber-700 dark:text-amber-300',
                )}
              >
                {check.name}
              </span>
              <span className="text-gray-500 dark:text-gray-400 ml-1">
                · {check.message}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* 总结 */}
      <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed">
          {summary}
        </p>
      </div>
    </div>
  )
}
