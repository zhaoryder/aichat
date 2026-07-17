// =====================================================================
// StatusBar：Vibe Coding 页面底部状态栏
// ---------------------------------------------------------------------
// 类似 VS Code 底部状态栏，分三区显示项目实时状态：
//   - 左侧：viewMode + 流式生成状态 + Plan/Team 模式
//   - 中间：Dev Server 状态 + URL
//   - 右侧：错误数 / 文件数 / tokens / 沙箱状态
// 暗色模式支持，可点击项通过回调暴露交互。
// =====================================================================

import {
  AlertTriangle,
  Boxes,
  Brain,
  Circle,
  CircleDot,
  FileText,
  Loader2,
  Terminal as TerminalIcon,
  Users,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export interface StatusBarProps {
  /** 当前 token 数（流式输出累计） */
  tokenCount: number
  /** 文件数（WebContainer 中的文件总数） */
  fileCount: number
  /** dev server 是否运行中 */
  devServerRunning: boolean
  /** dev server URL（如 http://localhost:5173） */
  devServerUrl?: string | null
  /** 当前是否有错误（iframe error / terminal error） */
  hasErrors: boolean
  /** 错误数量 */
  errorCount: number
  /** 当前是否在流式生成中 */
  isStreaming: boolean
  /** Plan Mode 是否开启 */
  planMode: boolean
  /** Teamwork 是否开启 */
  teamMode: boolean
  /** 当前 viewMode */
  viewMode: 'split' | 'code' | 'preview'
  /** 沙箱是否就绪 */
  sandboxReady: boolean
  /** 可选：点击 dev server 状态打开 URL */
  onDevServerClick?: () => void
  /** 可选：点击错误数查看错误 */
  onErrorClick?: () => void
}

/** viewMode 文案 */
const VIEW_MODE_LABEL: Record<StatusBarProps['viewMode'], string> = {
  split: '分屏',
  code: '代码',
  preview: '预览',
}

/** viewMode 对应小图标 */
function ViewModeIcon({ mode }: { mode: StatusBarProps['viewMode'] }) {
  if (mode === 'code') return <TerminalIcon className="h-3 w-3" />
  if (mode === 'preview') return <Circle className="h-3 w-3" />
  return <CircleDot className="h-3 w-3" />
}

/**
 * 通用状态栏项：可点击则渲染 button，否则渲染 span。
 * 统一 hover 高亮与圆角样式。
 */
function StatusItem({
  children,
  onClick,
  className,
  title,
  ariaLabel,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  title?: string
  ariaLabel?: string
}) {
  const base = cn(
    'flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors',
    onClick
      ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700'
      : 'cursor-default',
    className,
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={base}
        title={title}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    )
  }
  return (
    <span className={base} title={title} aria-label={ariaLabel}>
      {children}
    </span>
  )
}

export function StatusBar({
  tokenCount,
  fileCount,
  devServerRunning,
  devServerUrl,
  hasErrors,
  errorCount,
  isStreaming,
  planMode,
  teamMode,
  viewMode,
  sandboxReady,
  onDevServerClick,
  onErrorClick,
}: StatusBarProps) {
  return (
    <div
      role="status"
      aria-label="状态栏"
      className="flex h-6 items-center justify-between gap-2 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 px-2"
    >
      {/* ---------- 左侧区：viewMode + streaming + plan/team ---------- */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <StatusItem>
          <ViewModeIcon mode={viewMode} />
          <span>{VIEW_MODE_LABEL[viewMode]}</span>
        </StatusItem>

        {isStreaming && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <StatusItem className="text-red-500 dark:text-red-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>生成中</span>
            </StatusItem>
          </>
        )}

        {planMode && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <StatusItem>
              <Brain className="h-3 w-3" />
              <span>Plan</span>
            </StatusItem>
          </>
        )}

        {teamMode && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <StatusItem>
              <Users className="h-3 w-3" />
              <span>Team</span>
            </StatusItem>
          </>
        )}
      </div>

      {/* ---------- 中间区：Dev Server 状态 + URL ---------- */}
      <div className="flex items-center">
        <StatusItem
          onClick={onDevServerClick}
          title={devServerRunning && devServerUrl ? devServerUrl : undefined}
          ariaLabel={
            devServerRunning ? 'Dev Server 运行中' : 'Dev Server 未运行'
          }
          className={cn(!onDevServerClick && 'cursor-default')}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              devServerRunning
                ? 'bg-green-500'
                : 'bg-gray-400 dark:bg-gray-500',
            )}
          />
          {devServerRunning ? (
            <span className="flex items-center gap-1.5 min-w-0">
              <span>Dev Server</span>
              {devServerUrl && (
                <span className="font-mono text-[10px] truncate text-gray-500 dark:text-gray-500 max-w-[160px]">
                  {devServerUrl}
                </span>
              )}
            </span>
          ) : (
            <span>Dev Server 未运行</span>
          )}
        </StatusItem>
      </div>

      {/* ---------- 右侧区：错误 + 文件 + tokens + 沙箱 ---------- */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        {hasErrors && (
          <>
            <StatusItem
              onClick={onErrorClick}
              className="text-red-500 dark:text-red-400 hover:underline"
              ariaLabel={`${errorCount} 个错误`}
            >
              <AlertTriangle className="h-3 w-3" />
              <span>{errorCount} 个错误</span>
            </StatusItem>
            <Separator orientation="vertical" className="h-3" />
          </>
        )}

        <StatusItem>
          <FileText className="h-3 w-3" />
          <span>{fileCount} 文件</span>
        </StatusItem>
        <Separator orientation="vertical" className="h-3" />

        <StatusItem>
          <Boxes className="h-3 w-3" />
          <span className="font-mono">{tokenCount}</span>
          <span>tokens</span>
        </StatusItem>
        <Separator orientation="vertical" className="h-3" />

        <StatusItem>
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              sandboxReady ? 'bg-green-500' : 'bg-yellow-500',
            )}
          />
          <span>{sandboxReady ? '沙箱就绪' : '沙箱未就绪'}</span>
        </StatusItem>
      </div>
    </div>
  )
}

export default StatusBar
