// =====================================================================
// Vibe Coding：流式 + Agent 多轮 + 工具调用（spec §6.3 重写）
// ---------------------------------------------------------------------
// 关键变化：
//   1. 使用 useExternalStoreRuntime + 手动 SSE 消费（与 ChatWindow.tsx 一致）
//      → 完全绕过 @assistant-ui/react-ai-sdk 与 ai@7 的版本冲突
//   2. assistant-ui Thread + Composer（输入框在底部）
//   3. 流式 token 实时显示
//   4. 工具调用 UI：makeAssistantToolUI 注册 writeFile / webSearch /
//      generateImage / generateVideo / executeCode / readFile
//   5. writeFile 工具调用的 args.content 自动同步到右侧代码区 + iframe 预览
//
// 保留：三档布局（split/code/preview）、全屏、ESC 退出、localStorage 持久化、
//      保存项目、历史项目列表、下载、复制、修复、重置
// =====================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Bot,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Columns2,
  Copy,
  Diff,
  Download,
  Eye,
  GitBranch,
  GitCompare,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Save,
  Search,
  Image as ImageIcon,
  Video,
  Wrench,
  Sparkles,
  FileText,
  Terminal as TerminalIcon,
  ExternalLink,
  Share2,
  Square,
  Trash2,
  AlertTriangle,
  ListChecks,
  Crown,
  ClipboardList,
  Code2,
  Play,
  ShieldCheck,
  Camera,
  Command,
  Users,
} from 'lucide-react'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  makeAssistantToolUI,
  useMessage,
  useExternalStoreRuntime,
  type ExternalStoreAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react'
import {
  apiStream,
  listVibeProjects,
  saveVibeProject,
  createSnapshotApi,
  listSnapshotsApi,
  restoreSnapshotApi,
  getSnapshotDiffApi,
  createPost,
  updatePlan,
  pausePlan,
  skipPlanStep,
  executePlan,
  startTeam,
  sendTeamMessage,
  type VibeProject,
  type SnapshotDiff,
} from '@/lib/api'
import type {
  ProjectSnapshot,
  Plan,
  PlanStep,
  TeamRole,
  CodeReviewResult,
} from '@shared/types'
import { TeamToggle } from '@/components/TeamToggle'
import { CodeReviewCard } from '@/components/CodeReviewCard'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Markdown } from '@/components/Markdown'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { PlanPanel } from '@/components/PlanPanel'
import { CommandPalette, type CommandPaletteItem } from '@/components/CommandPalette'
import { StatusBar } from '@/components/StatusBar'
import { DiffViewerDialog } from '@/components/DiffViewerDialog'
import { ShareDialog } from '@/components/ShareDialog'
import { TypingCursor, ThinkingIndicator, ToolProgress } from '@/components/StreamingIndicator'
import { exportProjectAsZip } from '@/lib/export-project'

// ---------------------------------------------------------------------
// 类型 & 常量
// ---------------------------------------------------------------------

type ViewMode = 'split' | 'code' | 'preview'
type FullscreenTarget = 'code' | 'preview' | null

/** 工具调用信息（流式渲染） */
interface ToolCallInfo {
  id: string
  name: string
  args: Record<string, unknown>
  /** 工具执行结果（收到 tool_result 事件后填充） */
  result?: unknown
  /** 是否正在执行中（收到 tool_call 但未收到 tool_result） */
  isExecuting: boolean
  /** 执行是否出错（result 为 { error: string } 时标记） */
  hasError?: boolean
}

/** Vibe 对话消息：文本内容 + 工具调用列表 + 流式标记 */
interface VibeMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  toolCalls?: ToolCallInfo[]
  /** Teamwork 模式：标识该 assistant 消息由哪个角色产出 */
  agentRole?: TeamRole
  /** Teamwork 模式：Reviewer 角色产出的代码审查结果（仅 reviewer 角色消息有值） */
  review?: CodeReviewResult
}

const EXAMPLE_PROMPTS = [
  '一个带动画的登录表单',
  '贪吃蛇小游戏',
  '一个会下雪的圣诞主题页面',
  '带本地存储的待办事项 App',
]

const VIEW_MODE_KEY = 'vibe-code-view-mode'
const VIBE_MESSAGES_KEY = 'vibe-code-messages'

/** iframe 错误捕获脚本 */
const ERROR_CAPTURE_SCRIPT = `<script>
window.onerror = function(msg, url, line, col, err) {
  window.parent.postMessage({
    type: 'vibe-error',
    message: String(msg) + (err && err.stack ? '\\n' + err.stack : '')
  }, '*');
};
window.addEventListener('unhandledrejection', function(event) {
  window.parent.postMessage({
    type: 'vibe-error',
    message: 'Unhandled rejection: ' + (event.reason && event.reason.message ? event.reason.message : String(event.reason))
  }, '*');
});
</script>`

/** 在 HTML 代码中注入错误捕获脚本 */
function buildIframeSrcDoc(code: string): string {
  if (/<head[^>]*>/i.test(code)) {
    return code.replace(/<head[^>]*>/i, (m) => m + ERROR_CAPTURE_SCRIPT)
  }
  if (/<html[^>]*>/i.test(code)) {
    return code.replace(/(<html[^>]*>)/i, `$1${ERROR_CAPTURE_SCRIPT}`)
  }
  return ERROR_CAPTURE_SCRIPT + code
}

/** 从 VibeMessage[] 中提取最新 writeFile 工具调用的 content（实时同步到代码区） */
function extractLatestCode(messages: VibeMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue
    const toolCalls = msg.toolCalls
    if (!toolCalls || toolCalls.length === 0) continue
    for (let j = toolCalls.length - 1; j >= 0; j--) {
      const tc = toolCalls[j]
      if (tc.name === 'writeFile') {
        const content = tc.args?.content
        if (typeof content === 'string' && content) {
          return content
        }
      }
    }
  }
  return ''
}

/** 将 ISO 时间字符串转换为相对时间（如"3 分钟前"） */
function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month} 个月前`
  return `${Math.floor(month / 12)} 年前`
}

/**
 * 计算代码中需要高亮的行索引。
 * 采用"逐行消费"策略：对 targetLines 数组逐个匹配并消费，避免重复行全部被高亮。
 */
function computeHighlightIndices(code: string, targetLines: string[]): Set<number> {
  const codeLines = code.split('\n')
  const remaining = [...targetLines]
  const highlighted = new Set<number>()
  for (let i = 0; i < codeLines.length; i++) {
    const idx = remaining.indexOf(codeLines[i])
    if (idx >= 0) {
      highlighted.add(i)
      remaining.splice(idx, 1)
    }
  }
  return highlighted
}

// ---------------------------------------------------------------------
// 工具调用 UI 渲染器（makeAssistantToolUI）
// ---------------------------------------------------------------------

type WebSearchResult = Array<{ title: string; url: string; snippet: string }>

const WebSearchToolUI = makeAssistantToolUI<{ query: string }, WebSearchResult>({
  toolName: 'webSearch',
  render: ({ args, result, isError }) => {
    if (result === undefined) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 my-2 text-sm">
          <Search className="h-4 w-4 text-primary" />
          <span>联网搜索：{args?.query}</span>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      )
    }
    if (isError) {
      const err = result as { error?: string } | null
      return <p className="text-xs text-red-500 dark:text-red-400 my-1">搜索失败：{err?.error ?? '未知错误'}</p>
    }
    const results = result as WebSearchResult
    if (!Array.isArray(results) || results.length === 0) {
      return <p className="text-xs text-gray-500 dark:text-gray-400 my-1">未找到搜索结果</p>
    }
    return (
      <div className="my-2 space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Search className="h-3 w-3" />
          搜索结果（{results.length} 条）
        </div>
        {results.slice(0, 3).map((r, i) => (
          <a
            key={i}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-md bg-white dark:bg-gray-900 px-2 py-1 text-xs transition-transform hover:scale-[1.01]"
          >
            <div className="flex items-center gap-1">
              <ExternalLink className="h-2.5 w-2.5" />
              <span className="font-medium text-gray-700 dark:text-gray-300">{r.title}</span>
            </div>
            {r.snippet && (
              <p className="mt-0.5 line-clamp-2 text-gray-500 dark:text-gray-400">{r.snippet}</p>
            )}
          </a>
        ))}
      </div>
    )
  },
})

const GenerateImageToolUI = makeAssistantToolUI<{ prompt: string }, { url: string; prompt: string }>({
  toolName: 'generateImage',
  render: ({ args, result, isError }) => {
    if (result === undefined) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/50 px-3 py-2 my-2 text-sm">
          <ImageIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
          <span>生成图片：{args?.prompt}</span>
          <Loader2 className="h-3 w-3 animate-spin text-amber-500 dark:text-amber-400" />
        </div>
      )
    }
    if (isError) {
      return <p className="text-xs text-red-500 dark:text-red-400 my-1">图片生成失败</p>
    }
    const r = result as { url: string; prompt: string }
    return (
      <div className="my-2 inline-block rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/50 p-2">
        <img
          src={r.url}
          alt={r.prompt}
          className="max-w-xs rounded-md"
          loading="lazy"
        />
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{r.prompt}</p>
      </div>
    )
  },
})

const GenerateVideoToolUI = makeAssistantToolUI<
  { prompt: string; duration?: number },
  { taskId: string; prompt: string; duration: number }
>({
  toolName: 'generateVideo',
  render: ({ args, result, isError }) => {
    if (result === undefined) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/40 px-3 py-2 my-2 text-sm">
          <Video className="h-4 w-4 text-purple-500 dark:text-purple-400" />
          <span>生成视频：{args?.prompt}（{args?.duration ?? 5}s）</span>
          <Loader2 className="h-3 w-3 animate-spin text-purple-500 dark:text-purple-400" />
        </div>
      )
    }
    if (isError) {
      return <p className="text-xs text-red-500 dark:text-red-400 my-1">视频生成失败</p>
    }
    const r = result as { taskId: string; prompt: string; duration: number }
    return (
      <div className="my-2 rounded-lg border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/40 px-3 py-2 text-xs text-purple-700 dark:text-purple-300">
        <div className="flex items-center gap-1.5 font-medium">
          <Video className="h-3 w-3" />
          视频任务已提交
        </div>
        <div className="mt-1 text-purple-600 dark:text-purple-400">
          Task ID: {r.taskId} · {r.duration} 秒
        </div>
      </div>
    )
  },
})

const WriteFileToolUI = makeAssistantToolUI<
  { path: string; content: string },
  { success: boolean; path: string; size: number }
>({
  toolName: 'writeFile',
  render: ({ args, result, isError }) => {
    if (result === undefined) {
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
          <FileText className="h-3.5 w-3.5" />
          <span>正在写入：{args?.path ?? 'index.html'}</span>
          <Loader2 className="h-3 w-3 animate-spin" />
        </div>
      )
    }
    if (isError) {
      return <p className="text-xs text-red-500 dark:text-red-400 my-1">写入失败：{args?.path}</p>
    }
    const r = result as { success: boolean; path: string; size: number }
    return (
      <div className="my-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
        <FileText className="h-3.5 w-3.5" />
        已写入 {r.path}（{r.size} 字符）
      </div>
    )
  },
})

const ReadFileToolUI = makeAssistantToolUI<
  { path: string },
  { success: boolean; path: string; content?: string; error?: string }
>({
  toolName: 'readFile',
  render: ({ args, result }) => {
    if (result === undefined) {
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400">
          <FileText className="h-3.5 w-3.5" />
          读取文件：{args?.path}
          <Loader2 className="h-3 w-3 animate-spin" />
        </div>
      )
    }
    const r = result as { success: boolean; path: string; content?: string; error?: string }
    return (
      <div className="my-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300">
        {r.success ? `读取 ${r.path}（${r.content?.length ?? 0} 字符）` : `读取失败：${r.error}`}
      </div>
    )
  },
})

const ExecuteCodeToolUI = makeAssistantToolUI<
  { code: string },
  { success: boolean; result?: string; error?: string }
>({
  toolName: 'executeCode',
  render: ({ result }) => {
    if (result === undefined) {
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 text-xs text-indigo-700 dark:text-indigo-300">
          <TerminalIcon className="h-3.5 w-3.5" />
          执行代码...
          <Loader2 className="h-3 w-3 animate-spin" />
        </div>
      )
    }
    const r = result as { success: boolean; result?: string; error?: string }
    return (
      <div className="my-2 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-indigo-700 dark:text-indigo-300">
          <TerminalIcon className="h-3 w-3" />
          {r.success ? '代码执行结果' : '执行失败'}
        </div>
        {r.success ? (
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-indigo-900 dark:text-indigo-100">
            {r.result?.slice(0, 500)}
          </pre>
        ) : (
          <p className="mt-1 text-red-600 dark:text-red-400">{r.error}</p>
        )}
      </div>
    )
  },
})

// ---------------------------------------------------------------------
// 代码区 / 预览区（保留原实现，便于复用）
// ---------------------------------------------------------------------

function CodeArea({
  code,
  streaming,
  codeRef,
}: {
  code: string
  streaming: boolean
  codeRef: RefObject<HTMLPreElement>
}) {
  const hasCode = code.length > 0
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-3 py-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">代码</span>
        {streaming ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500 dark:bg-amber-400" />
            生成中…
          </span>
        ) : hasCode ? (
          <span className="text-xs text-gray-400 dark:text-gray-500">{code.length} 字符</span>
        ) : null}
      </div>
      {hasCode ? (
        <pre
          ref={codeRef}
          className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800/50 p-3 font-mono text-xs leading-5 text-gray-800 dark:text-gray-200 scrollbar-thin"
        >
          <code>{code}</code>
          {streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse-cursor bg-primary" />
          )}
        </pre>
      ) : (
        <EmptyState
          className="flex-1"
          title="描述需求开始生成"
          description="在左侧输入框描述你想要的页面或功能，AI 会通过 writeFile 工具生成代码"
        />
      )}
    </div>
  )
}

function PreviewArea({
  srcDoc,
  iframeKey,
  hasCode,
  devServerUrl,
}: {
  srcDoc: string
  iframeKey: number
  hasCode: boolean
  devServerUrl?: string | null
}) {
  // dev server URL 优先（WebContainer dev server），否则降级到 srcDoc
  const useDevServer = !!devServerUrl
  // iframe 加载状态：srcDoc ↔ src 模式切换时显示 loading 蒙层，避免白屏闪烁
  const [iframeLoading, setIframeLoading] = useState(false)
  // devServerUrl 或 iframeKey 变化时进入 loading 状态，等 iframe onLoad 事件清除
  useEffect(() => {
    if (hasCode || useDevServer) setIframeLoading(true)
  }, [useDevServer, devServerUrl, iframeKey])
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-3 py-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">预览</span>
        {useDevServer ? (
          <span className="flex items-center gap-1 text-xs text-emerald-500 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            dev server
          </span>
        ) : (
          hasCode && <span className="text-xs text-gray-400 dark:text-gray-500">iframe srcDoc</span>
        )}
      </div>
      {useDevServer ? (
        <iframe
          key={`dev-${iframeKey}`}
          title="vibe-code-preview"
          src={devServerUrl!}
          sandbox="allow-scripts allow-modals allow-same-origin allow-forms allow-popups"
          className="flex-1 w-full border-0 bg-white dark:bg-gray-900"
          onLoad={() => setIframeLoading(false)}
        />
      ) : hasCode ? (
        <iframe
          key={iframeKey}
          title="vibe-code-preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-modals"
          className="flex-1 w-full border-0 bg-white dark:bg-gray-900"
          onLoad={() => setIframeLoading(false)}
        />
      ) : (
        <EmptyState
          className="flex-1"
          title="预览区"
          description="AI 通过 writeFile 工具写入代码后将在此处实时预览"
        />
      )}
      {/* loading 蒙层：srcDoc ↔ src 模式切换或 iframe remount 时显示，避免白屏闪烁 */}
      {iframeLoading && (useDevServer || hasCode) && (
        <div className="absolute inset-0 top-[33px] flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>加载预览…</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Thread 内部组件：消息气泡 + Composer
// ---------------------------------------------------------------------

/** 用户消息气泡 */
function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end animate-slide-up-fade">
      <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-primary px-3 py-2 text-sm leading-relaxed text-black">
        <MessagePrimitive.Parts components={{ Text: ({ text }) => <>{text}</> }} />
      </div>
    </MessagePrimitive.Root>
  )
}

/** AI 消息气泡 */
function AssistantMessage({
  agentRole,
  review,
}: {
  agentRole?: TeamRole
  review?: CodeReviewResult
}) {
  const isRunning = useMessage((s) => s.status?.type === 'running')
  const hasText = useMessage((s) =>
    s.content.some(
      (p) => p.type === 'text' && typeof (p as { text?: string }).text === 'string' && (p as { text?: string }).text !== '',
    ),
  )
  const hasToolCalls = useMessage((s) =>
    s.content.some((p) => p.type.startsWith('tool-')),
  )
  const showTypingDots = isRunning && !hasText && !hasToolCalls

  return (
    <MessagePrimitive.Root className="flex gap-2 justify-start animate-slide-up-fade">
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition-colors',
          agentRole
            ? ROLE_BADGE_META[agentRole].avatarBg
            : 'bg-gradient-to-br from-amber-400 to-orange-500',
        )}
      >
        {agentRole ? (
          (() => {
            const Icon = ROLE_BADGE_META[agentRole].icon
            return <Icon className="h-3.5 w-3.5" />
          })()
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="flex max-w-[80%] flex-col items-start gap-1">
        {/* 角色徽章：Teamwork 模式下显示当前消息所属角色 */}
        {agentRole && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              ROLE_BADGE_META[agentRole].badgeBg,
              ROLE_BADGE_META[agentRole].text,
            )}
          >
            {(() => {
              const Icon = ROLE_BADGE_META[agentRole].icon
              return <Icon className="h-2.5 w-2.5" />
            })()}
            {ROLE_BADGE_META[agentRole].label}
          </span>
        )}
        <div className="break-words rounded-2xl bg-white dark:bg-gray-900 px-3 py-2 text-sm leading-relaxed text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-100 dark:ring-gray-800">
          {showTypingDots ? (
            <div className="flex items-center gap-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="animate-bounce-dot inline-block size-2 rounded-full bg-gray-400 dark:bg-gray-500"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          ) : (
            <MessagePrimitive.Parts
              components={{
                Text: ({ text }) =>
                  text ? (
                    <>
                      <Markdown content={text} />
                      {isRunning && <TypingCursor visible={true} />}
                    </>
                  ) : null,
              }}
            />
          )}
        </div>
        {/* CodeReviewCard：Reviewer 角色消息附带的代码审查卡片 */}
        {review && <CodeReviewCard review={review} className="w-full max-w-md" />}
      </div>
    </MessagePrimitive.Root>
  )
}

/** 角色徽章元数据：图标 + 配色（与 TeamToggle 角色配色保持一致） */
const ROLE_BADGE_META: Record<
  TeamRole,
  {
    icon: typeof Crown
    label: string
    text: string
    badgeBg: string
    avatarBg: string
  }
> = {
  leader: {
    icon: Crown,
    label: 'Leader',
    text: 'text-purple-600 dark:text-purple-300',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/60',
    avatarBg: 'bg-gradient-to-br from-purple-500 to-purple-700',
  },
  planner: {
    icon: ClipboardList,
    label: 'Planner',
    text: 'text-blue-600 dark:text-blue-300',
    badgeBg: 'bg-blue-100 dark:bg-blue-950/60',
    avatarBg: 'bg-gradient-to-br from-blue-500 to-blue-700',
  },
  coder: {
    icon: Code2,
    label: 'Coder',
    text: 'text-emerald-600 dark:text-emerald-300',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60',
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-emerald-700',
  },
  executor: {
    icon: Play,
    label: 'Executor',
    text: 'text-amber-600 dark:text-amber-300',
    badgeBg: 'bg-amber-100 dark:bg-amber-950/60',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-amber-700',
  },
  reviewer: {
    icon: ShieldCheck,
    label: 'Reviewer',
    text: 'text-red-600 dark:text-red-300',
    badgeBg: 'bg-red-100 dark:bg-red-950/60',
    avatarBg: 'bg-gradient-to-br from-red-500 to-red-700',
  },
  reporter: {
    icon: FileText,
    label: 'Reporter',
    text: 'text-gray-600 dark:text-gray-300',
    badgeBg: 'bg-gray-100 dark:bg-gray-800/80',
    avatarBg: 'bg-gradient-to-br from-gray-500 to-gray-700',
  },
}

/** 输入框（底部） */
function VibeComposer({
  disabled,
  isStreaming,
  onStop,
  value,
  onChange,
  planMode,
  hasPlan,
  teamMode,
}: {
  disabled: boolean
  isStreaming: boolean
  onStop: () => void
  value: string
  onChange: (v: string) => void
  planMode: boolean
  hasPlan: boolean
  teamMode: boolean
}) {
  return (
    <ComposerPrimitive.Root className="flex flex-col gap-2 border-t border-gray-100 dark:border-gray-800 p-3">
      <ComposerPrimitive.Input
        asChild
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            const el = e.currentTarget as unknown as HTMLButtonElement & { form?: HTMLFormElement }
            el.form?.requestSubmit()
          }
        }}
      >
        <textarea
          placeholder={
            teamMode
              ? '描述目标，多角色 AI 团队将接力协作完成...'
              : planMode && !hasPlan
                ? '描述需求，AI 会先拆解为 step 列表，确认后再执行...'
                : '描述你想要的页面或功能，AI 会自动调用工具生成代码...'
          }
          disabled={disabled}
          rows={3}
          className="w-full resize-y rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        />
      </ComposerPrimitive.Input>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => onChange(ex)}
              disabled={disabled}
              className="rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
        {isStreaming ? (
          <Button
            type="button"
            onClick={onStop}
            variant="destructive"
            className="gap-1.5 transition-transform duration-300 ease-out hover:scale-[1.02]"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            停止生成
          </Button>
        ) : (
          <ComposerPrimitive.Send asChild>
            <Button
              type="submit"
              disabled={disabled || !value.trim()}
              className="gap-1.5 transition-transform duration-300 ease-out hover:scale-[1.02]"
            >
              发送
            </Button>
          </ComposerPrimitive.Send>
        )}
      </div>
    </ComposerPrimitive.Root>
  )
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

import { AICollaboratorPicker } from '@/components/AICollaboratorPicker'
import { WebContainerSandbox, getGlobalSandbox } from '@/components/WebContainerSandbox'
import { Terminal } from '@/components/Terminal'
import { FileTree } from '@/components/FileTree'
import {
  FRONTEND_TOOLS,
  executeFrontendTool,
  setSandbox,
} from '@/lib/webcontainer-tools'

export const VibeCodePage = () => {
  const [aiCollaborator, setAiCollaborator] = useState<string | null>(null)
  const { user } = useAuth()

  // ----- 消息状态 + 流式状态（手动管理，对接 POST /api/vibe-code/stream） -----
  const [messages, setMessages] = useState<VibeMessage[]>(() => {
    try {
      const stored = localStorage.getItem(VIBE_MESSAGES_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as VibeMessage[]
        // 只恢复非流式状态的消息（避免恢复到一半的流式状态）
        return parsed.map(m => ({ ...m, isStreaming: false }))
      }
    } catch (err) {
      console.warn('[VibeCode] failed to load messages from localStorage:', err)
    }
    return []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [composerValue, setComposerValue] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  // 持久化对话记录到 localStorage（防抖 500ms，避免频繁写入）
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        // 只保存有实际内容的消息，过滤掉流式中的占位
        const toSave = messages.filter(m => m.content || (m.toolCalls && m.toolCalls.length > 0))
        const serialized = JSON.stringify(toSave)
        const MAX_STORAGE_SIZE = 4 * 1024 * 1024 // 4MB
        if (serialized.length > MAX_STORAGE_SIZE) {
          // 超限时只保留最近 50 条消息
          const trimmed = toSave.slice(-50)
          localStorage.setItem(VIBE_MESSAGES_KEY, JSON.stringify(trimmed))
        } else {
          localStorage.setItem(VIBE_MESSAGES_KEY, serialized)
        }
      } catch (err) {
        // localStorage 满了或其他错误，静默处理
        console.warn('[VibeCode] failed to save messages to localStorage:', err)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [messages])

  // ----- Plan Mode 状态（Batch B）-----
  const [planMode, setPlanMode] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planExecuting, setPlanExecuting] = useState(false)
  const planAbortRef = useRef<AbortController | null>(null)

  // ----- Teamwork 状态（Batch C）-----
  const [teamMode, setTeamMode] = useState(false)
  const [teamRoles, setTeamRoles] = useState<TeamRole[]>(['leader', 'coder'])
  const [teamSessionId, setTeamSessionId] = useState<string | null>(null)
  const teamAbortRef = useRef<AbortController | null>(null)

  // ----- WebContainer 沙箱状态（Batch D）-----
  const sandboxRef = useRef<WebContainerSandbox | null>(null)
  const [webcontainerReady, setWebcontainerReady] = useState(false)
  const [devServerUrl, setDevServerUrl] = useState<string | null>(null)
  const [showTerminal, setShowTerminal] = useState(false)
  const [sandboxError, setSandboxError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null)

  // ----- 从 messages 中提取最新代码（writeFile 工具调用的 args.content） -----
  const code = useMemo(() => extractLatestCode(messages), [messages])
  const isStreaming = isLoading

  // iframe 版本号（每次 code 变化时强制 remount，避免残留错误监听）
  // 加 500ms debounce：流式生成时 code 频繁变化，避免 iframe 持续 remount 闪烁
  const [iframeVersion, setIframeVersion] = useState(0)
  useEffect(() => {
    if (!code) return
    const timer = setTimeout(() => setIframeVersion((v) => v + 1), 500)
    return () => clearTimeout(timer)
  }, [code])

  const [lastPrompt, setLastPrompt] = useState('')

  // ----- 布局状态 -----
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY)
      if (saved === 'split' || saved === 'code' || saved === 'preview') return saved
    } catch {
      // ignore
    }
    return 'split'
  })
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState<FullscreenTarget>(null)
  const [mobileTab, setMobileTab] = useState('chat')

  // ----- 历史项目 -----
  const [projects, setProjects] = useState<VibeProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)

  // ----- 保存弹窗 -----
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [savePublic, setSavePublic] = useState(false)
  const [saving, setSaving] = useState(false)

  // ----- 修复弹窗 -----
  const [fixOpen, setFixOpen] = useState(false)
  const [fixError, setFixError] = useState('')

  // ----- 版本历史面板（Task 7.2） -----
  const snapshotProjectId = user ? `default-${user.id}` : 'default-anon'
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [currentBranch, setCurrentBranch] = useState('main')

  // ----- diff 模态 -----
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffBaseId, setDiffBaseId] = useState<string | null>(null)
  const [diffCompareId, setDiffCompareId] = useState<string>('')
  const [diffData, setDiffData] = useState<SnapshotDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  // ----- 新建 remix 分支模态 -----
  const [remixOpen, setRemixOpen] = useState(false)
  const [remixBranchName, setRemixBranchName] = useState('')
  const [remixCreating, setRemixCreating] = useState(false)

  const codeRef = useRef<HTMLPreElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)
  const prevLoadingRef = useRef(false)

  // ----- v5.0 升级状态 -----
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [diffDialogState, setDiffDialogState] = useState<{
    open: boolean
    oldCode: string
    newCode: string
    oldLabel?: string
    newLabel?: string
  }>({ open: false, oldCode: '', newCode: '' })
  const [iframeErrorCount, setIframeErrorCount] = useState(0)
  // 自动修复默认开启
  const [autoFixEnabled, setAutoFixEnabled] = useState(true)
  // 防止短时间内重复触发自动修复
  const lastAutoFixRef = useRef<number>(0)
  // 自动修复轮次计数（防死循环，最多 3 轮；用户手动发送时重置）
  const autoFixRoundRef = useRef<number>(0)

  const hasCode = code.length > 0
  const iframeSrcDoc = buildIframeSrcDoc(code)

  // ----- Effects -----

  // WebContainer 沙箱 boot（Batch D）
  // 关键：使用全局单例 + 不在 cleanup 里 teardown，避免 React StrictMode 双重挂载
  // 或页面来回切换时 boot 多次导致 "Only a single WebContainer instance can be booted" 错误
  useEffect(() => {
    // 使用全局单例（每个浏览器标签页只允许一个 WebContainer 实例）
    const sandbox = getGlobalSandbox()
    sandboxRef.current = sandbox
    setSandbox(sandbox)

    // 注册错误回调
    const unsubscribeError = sandbox.onError((err) => {
      setSandboxError(err.message)
      setWebcontainerReady(false)
    })

    // 启动 boot（幂等：已 ready 直接返回；booting 复用同一 Promise；error/idle 重新尝试）
    void sandbox.boot().then(() => {
      if (sandbox.isReady) {
        setWebcontainerReady(true)
        setSandboxError(null)
      }
    })

    return () => {
      // 关键：不调用 teardown —— 全局单例应跨页面复用，
      // 由浏览器标签页关闭时自动回收资源（避免 StrictMode 双挂载时 teardown 还没完成又 boot 报错）
      unsubscribeError()
      setSandbox(null)
      sandboxRef.current = null
    }
  }, [])

  // 组件卸载时取消进行中的流式请求
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      planAbortRef.current?.abort()
    }
  }, [])

  // 代码变化时自动滚底
  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight
    }
  }, [code])

  // ESC 退出全屏
  useEffect(() => {
    if (!fullscreen) return
    const handleEscKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(null)
    }
    document.addEventListener('keydown', handleEscKey)
    return () => document.removeEventListener('keydown', handleEscKey)
  }, [fullscreen])

  // 视图模式持久化（spec §4.6 状态记忆）
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode)
    } catch {
      // ignore
    }
  }, [viewMode])

  // 监听 messages 变化，更新 lastPrompt（取最后一条 user 消息的 content）
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && messages[i].content) {
        setLastPrompt(messages[i].content)
        break
      }
    }
  }, [messages])

  // 加载历史项目
  const loadProjects = useCallback(async () => {
    if (!user) return
    setProjectsLoading(true)
    try {
      const res = await listVibeProjects()
      setProjects(res.projects ?? [])
    } catch {
      // 静默
    } finally {
      setProjectsLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // ----- 加载快照时间线（Task 7.2） -----
  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true)
    try {
      const res = await listSnapshotsApi(snapshotProjectId, currentBranch)
      setSnapshots(res.snapshots ?? [])
    } catch {
      // 静默
    } finally {
      setSnapshotsLoading(false)
    }
  }, [snapshotProjectId, currentBranch])

  // 面板展开 / 分支切换时加载
  useEffect(() => {
    if (historyOpen && user) {
      loadSnapshots()
    }
  }, [historyOpen, user, loadSnapshots])

  // 流式结束（isLoading true→false）时自动刷新时间线
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && historyOpen) {
      loadSnapshots()
    }
    prevLoadingRef.current = isLoading
  }, [isLoading, historyOpen, loadSnapshots])

  // ----- 快照操作 -----
  const handleRestoreSnapshot = useCallback(
    async (snapshotId: string) => {
      try {
        await restoreSnapshotApi(snapshotId)
        toast.success('已回退到该快照')
        await loadSnapshots()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '回退失败')
      }
    },
    [loadSnapshots],
  )

  // 打开 diff 模态：默认与上一条快照对比
  const handleOpenDiff = useCallback(
    (snapshot: ProjectSnapshot) => {
      const others = snapshots.filter((s) => s.id !== snapshot.id)
      // 默认对比下一条（时间线上更早的快照）
      const idx = snapshots.findIndex((s) => s.id === snapshot.id)
      const defaultCompare =
        idx >= 0 && idx < snapshots.length - 1 ? snapshots[idx + 1].id : others[0]?.id ?? ''
      setDiffBaseId(snapshot.id)
      setDiffCompareId(defaultCompare)
      setDiffData(null)
      setDiffOpen(true)
    },
    [snapshots],
  )

  // 加载 diff 数据
  useEffect(() => {
    if (!diffOpen || !diffBaseId || !diffCompareId) return
    let cancelled = false
    setDiffLoading(true)
    getSnapshotDiffApi(diffBaseId, diffCompareId)
      .then((res) => {
        if (!cancelled) setDiffData(res.diff)
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : '获取 diff 失败')
        }
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [diffOpen, diffBaseId, diffCompareId])

  // 新建 remix 分支
  const handleCreateRemix = useCallback(async () => {
    const branchName = remixBranchName.trim() || 'remix'
    if (!code) {
      toast.error('当前没有代码，无法创建分支')
      return
    }
    setRemixCreating(true)
    try {
      const parentId = snapshots[0]?.id
      await createSnapshotApi({
        projectId: snapshotProjectId,
        code,
        label: `remix-${Date.now()}`,
        parentId,
        branch: branchName,
      })
      toast.success(`已创建分支「${branchName}」`)
      setRemixOpen(false)
      setRemixBranchName('')
      setCurrentBranch(branchName)
      setHistoryOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建分支失败')
    } finally {
      setRemixCreating(false)
    }
  }, [code, snapshots, snapshotProjectId])

  // 手动创建快照
  const handleCreateManualSnapshot = useCallback(async () => {
    if (!code) {
      toast.error('当前没有代码')
      return
    }
    try {
      await createSnapshotApi({
        projectId: snapshotProjectId,
        code,
        label: 'manual-save',
        branch: currentBranch,
      })
      toast.success('已创建快照')
      await loadSnapshots()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建快照失败')
    }
  }, [code, snapshotProjectId, currentBranch, loadSnapshots])

  // 分支列表（从快照中提取 + 始终包含 main）
  const branches = useMemo(() => {
    const set = new Set<string>(['main'])
    for (const s of snapshots) set.add(s.branch)
    return Array.from(set)
  }, [snapshots])

  // diff 相关数据
  const diffBaseSnapshot = useMemo(
    () => snapshots.find((s) => s.id === diffBaseId) ?? null,
    [snapshots, diffBaseId],
  )
  const diffCompareSnapshot = useMemo(
    () => snapshots.find((s) => s.id === diffCompareId) ?? null,
    [snapshots, diffCompareId],
  )
  const diffBaseHighlight = useMemo(
    () =>
      diffBaseSnapshot && diffData
        ? computeHighlightIndices(diffBaseSnapshot.code, diffData.removed)
        : new Set<number>(),
    [diffBaseSnapshot, diffData],
  )
  const diffCompareHighlight = useMemo(
    () =>
      diffCompareSnapshot && diffData
        ? computeHighlightIndices(diffCompareSnapshot.code, diffData.added)
        : new Set<number>(),
    [diffCompareSnapshot, diffData],
  )

  // ----- Teamwork 模式：调 /api/team/start 或 /api/team/:id/message（Batch C - C9） -----
  // 与 single 模式不同：后端 SSE 事件包含 role / review 字段
  //   - start 事件 { sessionId }：拿到 team_session id
  //   - role 事件 { role, task }：开启一条新的 assistant 消息占位（带 agentRole）
  //   - token 事件 { c, role }：追加到当前 assistant 消息
  //   - tool_call / tool_result：与 single 模式一致
  //   - review 事件 { review, role }：把 CodeReviewResult 挂到当前消息上
  //   - done 事件 { status }：结束流式
  //   - error 事件 { error, role }：显示错误
  const handleSendTeam = useCallback(
    async (text: string, userMsg: VibeMessage) => {
      if (isLoading) return

      // 追加 user 消息 + 立即创建 Leader 占位消息（避免 Leader 决策期间用户看到空白）
      const leaderPlaceholderId = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: leaderPlaceholderId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          agentRole: 'leader',
        },
      ])
      setIsLoading(true)

      if (teamAbortRef.current) teamAbortRef.current.abort()
      const controller = new AbortController()
      teamAbortRef.current = controller

      try {
        // 决定端点：首次调用 /team/start，后续 /team/:id/message
        const isFirstMessage = !teamSessionId
        const response = isFirstMessage
          ? await startTeam(text, { roles: teamRoles }, { signal: controller.signal })
          : await sendTeamMessage(teamSessionId, text, { signal: controller.signal })

        if (!response.body) {
          toast.error('未收到响应流')
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''
        // 当前正在写入的 assistant 消息 id（role 事件创建后赋值）
        // 初始指向 leader 占位，以便首个 role=leader 事件复用它而非重复创建
        let currentAiMsgId: string | null = leaderPlaceholderId

        while (true) {
          if (controller.signal.aborted) break
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              let data: {
                sessionId?: string
                role?: TeamRole
                task?: string
                c?: string
                id?: string
                name?: string
                args?: Record<string, unknown>
                result?: unknown
                review?: CodeReviewResult
                status?: string
                error?: string
              }
              try {
                data = JSON.parse(line.slice(6))
              } catch {
                continue
              }

              if (currentEvent === 'start' && data.sessionId) {
                // 首次消息时记录 sessionId（后续走 /team/:id/message）
                if (!teamSessionId) {
                  setTeamSessionId(data.sessionId)
                }
              } else if (currentEvent === 'role' && data.role) {
                // 新角色接力：创建新的 assistant 消息占位
                // 优化：若 role=leader 且已预创建 leader 占位（currentAiMsgId 仍指向它），复用，避免重复创建
                const canReuseLeaderPlaceholder =
                  data.role === 'leader' && currentAiMsgId === leaderPlaceholderId
                if (!canReuseLeaderPlaceholder) {
                  currentAiMsgId = crypto.randomUUID()
                  const newMsg: VibeMessage = {
                    id: currentAiMsgId,
                    role: 'assistant',
                    content: '',
                    isStreaming: true,
                    agentRole: data.role,
                  }
                  setMessages((prev) => [...prev, newMsg])
                }
              } else if (currentEvent === 'token' && data.c && currentAiMsgId) {
                // 追加 token 到当前消息
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === currentAiMsgId
                      ? { ...m, content: m.content + data.c }
                      : m,
                  ),
                )
              } else if (currentEvent === 'tool_call') {
                const { id: tcId, name: tcName, args: tcArgs } = data
                if (tcId && tcName && currentAiMsgId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentAiMsgId
                        ? {
                            ...m,
                            toolCalls: [
                              ...(m.toolCalls ?? []),
                              {
                                id: tcId,
                                name: tcName,
                                args: tcArgs ?? {},
                                isExecuting: true,
                              },
                            ],
                          }
                        : m,
                    ),
                  )

                  // 前端工具拦截（与 single 模式一致）
                  if (FRONTEND_TOOLS.has(tcName) && sandboxRef.current?.isReady) {
                    const tcArgsCopy = tcArgs ?? {}
                    void executeFrontendTool(tcName, tcArgsCopy)
                      .then((result) => {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === currentAiMsgId
                              ? {
                                  ...m,
                                  toolCalls: (m.toolCalls ?? []).map((tc) =>
                                    tc.id === tcId
                                      ? { ...tc, result, isExecuting: false }
                                      : tc,
                                  ),
                                }
                              : m,
                          ),
                        )
                        if (tcName === 'writeFile' && sandboxRef.current) {
                          void sandboxRef.current.startDevServer().then((url) => {
                            setDevServerUrl(url)
                          }).catch(() => {
                            // dev server 启动失败：静默，使用 srcDoc 降级
                          })
                        }
                      })
                      .catch((err) => {
                        const errorResult = {
                          error: err instanceof Error ? err.message : String(err),
                        }
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === currentAiMsgId
                              ? {
                                  ...m,
                                  toolCalls: (m.toolCalls ?? []).map((tc) =>
                                    tc.id === tcId
                                      ? {
                                          ...tc,
                                          result: errorResult,
                                          isExecuting: false,
                                          hasError: true,
                                        }
                                      : tc,
                                  ),
                                }
                              : m,
                          ),
                        )
                      })
                  }
                }
              } else if (currentEvent === 'tool_result') {
                const { id: trId, result: trResult } = data
                if (trId && currentAiMsgId) {
                  const hasError =
                    trResult != null &&
                    typeof trResult === 'object' &&
                    'error' in trResult
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentAiMsgId
                        ? {
                            ...m,
                            toolCalls: (m.toolCalls ?? []).map((tc) =>
                              tc.id === trId
                                ? { ...tc, result: trResult, isExecuting: false, hasError }
                                : tc,
                            ),
                          }
                        : m,
                    ),
                  )
                }
              } else if (currentEvent === 'review' && data.review && currentAiMsgId) {
                // Reviewer 角色产出 CodeReviewResult，挂到当前消息上
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === currentAiMsgId
                      ? { ...m, review: data.review }
                      : m,
                  ),
                )
              } else if (currentEvent === 'done') {
                if (currentAiMsgId) {
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id !== currentAiMsgId) return m
                      // 如果 AI 只调工具没输出文本，填充默认说明，避免空白气泡
                      const hasToolCalls = m.toolCalls && m.toolCalls.length > 0
                      const emptyContent = !m.content || m.content.trim() === ''
                      const defaultText =
                        hasToolCalls && emptyContent ? '已通过工具完成操作。' : m.content
                      return { ...m, isStreaming: false, content: defaultText }
                    }),
                  )
                }
                // status='failed' 时给出提示
                if (data.status === 'failed') {
                  toast.error('团队协作未能完成目标')
                } else {
                  toast.success('团队协作完成')
                }
                return
              } else if (currentEvent === 'error') {
                const errMsg = data.error || '团队执行失败'
                if (currentAiMsgId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentAiMsgId
                        ? {
                            ...m,
                            content: m.content
                              ? `${m.content}\n\n⚠️ 生成中断：${errMsg}`
                              : `⚠️ ${errMsg}`,
                            isStreaming: false,
                          }
                        : m,
                    ),
                  )
                } else {
                  toast.error(errMsg)
                }
              }
            }
          }
        }

        // 流自然结束但未收到 done：停止流式标记
        if (currentAiMsgId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentAiMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.isExecuting ? { ...tc, isExecuting: false } : tc,
                    ),
                  }
                : m,
            ),
          )
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // 用户主动取消：保持已生成内容，仅停止流式标记
          setMessages((prev) =>
            prev.map((m) =>
              m.isStreaming
                ? {
                    ...m,
                    isStreaming: false,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.isExecuting ? { ...tc, isExecuting: false } : tc,
                    ),
                  }
                : m,
            ),
          )
          return
        }
        const errMsg = err instanceof Error ? err.message : '团队发送失败'
        toast.error(errMsg)
      } finally {
        setIsLoading(false)
        if (teamAbortRef.current === controller) {
          teamAbortRef.current = null
        }
      }
    },
    [isLoading, teamMode, teamRoles, teamSessionId],
  )

  // ----- SSE 流式发送（对接 POST /api/vibe-code/stream） -----
  const handleSendByText = useCallback(
    async (text: string, opts?: { isAutoFix?: boolean }) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return
      // 用户手动发送时重置自动修复轮次；自动修复调用不重置，以触发 3 轮上限防死循环
      if (!opts?.isAutoFix) {
        autoFixRoundRef.current = 0
      }

      // 立即清空输入框
      setComposerValue('')

      // 构造发送给后端的 messages（包含历史 + 本次 user 消息）
      const userMsg: VibeMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
      }

      // ----- Teamwork 模式：调 /api/team/start 或 /api/team/:id/message -----
      if (teamMode) {
        await handleSendTeam(trimmed, userMsg)
        return
      }

      // ----- Plan Mode 阶段 1：生成 plan（不创建 AI 占位消息，等 plan 事件） -----
      if (planMode && !plan) {
        const messagesToSend: Array<{ role: 'user' | 'assistant'; content: string }> = []
        setMessages((prev) => {
          for (const m of prev) {
            if (m.role === 'user' || m.role === 'assistant') {
              if (m.content || (m.toolCalls && m.toolCalls.length > 0)) {
                messagesToSend.push({ role: m.role, content: m.content })
              }
            }
          }
          messagesToSend.push({ role: 'user', content: trimmed })
          return [...prev, userMsg]
        })

        setIsLoading(true)

        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
        const controller = new AbortController()
        abortControllerRef.current = controller

        try {
          const response = await apiStream(
            '/vibe-code/stream',
            { messages: messagesToSend, mode: 'plan', projectId: null },
            { signal: controller.signal },
          )

          if (!response.body) {
            toast.error('未收到响应流')
            return
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let currentEvent = ''

          while (true) {
            if (controller.signal.aborted) break
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                let data: { plan?: Plan; error?: string }
                try {
                  data = JSON.parse(line.slice(6))
                } catch {
                  continue
                }

                if (currentEvent === 'plan' && data.plan) {
                  setPlan(data.plan)
                  toast.success(`已生成 plan：${data.plan.steps?.length ?? 0} 个步骤`)
                } else if (currentEvent === 'error') {
                  toast.error(data.error || '生成 plan 失败')
                }
              }
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return
          toast.error(err instanceof Error ? err.message : '生成 plan 失败')
        } finally {
          setIsLoading(false)
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null
          }
        }
        return
      }

      // ----- 默认 single 模式（含已有 plan 的情况也走 single） -----
      const aiMsgId = crypto.randomUUID()
      const aiMsg: VibeMessage = {
        id: aiMsgId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      }

      // 本地 messages 快照（含新增的 user 消息），用于发送给后端
      const messagesToSend: Array<{ role: 'user' | 'assistant'; content: string }> = []

      setMessages((prev) => {
        for (const m of prev) {
          if (m.role === 'user' || m.role === 'assistant') {
            // 跳过空内容的 assistant 占位
            if (m.content || (m.toolCalls && m.toolCalls.length > 0)) {
              messagesToSend.push({ role: m.role, content: m.content })
            }
          }
        }
        messagesToSend.push({ role: 'user', content: trimmed })
        return [...prev, userMsg, aiMsg]
      })

      setIsLoading(true)

      // 取消上一个流（若有）
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const response = await apiStream(
          '/vibe-code/stream',
          { messages: messagesToSend },
          { signal: controller.signal },
        )

        if (!response.body) {
          // 不删除 AI 消息，显示错误
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, content: '⚠️ 未收到响应流', isStreaming: false }
                : m,
            ),
          )
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''
        let receivedAnyToken = false

        while (true) {
          if (controller.signal.aborted) break
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              let data: {
                c?: string
                id?: string
                name?: string
                args?: Record<string, unknown>
                result?: unknown
                error?: string
              }
              try {
                data = JSON.parse(line.slice(6))
              } catch {
                continue
              }

              if (currentEvent === 'token' && data.c) {
                receivedAnyToken = true
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, content: m.content + data.c } : m,
                  ),
                )
              } else if (currentEvent === 'tool_call') {
                const { id: tcId, name: tcName, args: tcArgs } = data
                if (tcId && tcName) {
                  receivedAnyToken = true
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === aiMsgId
                        ? {
                            ...m,
                            toolCalls: [
                              ...(m.toolCalls ?? []),
                              {
                                id: tcId,
                                name: tcName,
                                args: tcArgs ?? {},
                                isExecuting: true,
                              },
                            ],
                          }
                        : m,
                    ),
                  )

                  // 前端工具拦截（Batch D）：bash / writeFile / readFile / listFiles / install
                  // 由前端 WebContainer 执行，结果直接注入到 messages（不发送回后端）
                  if (FRONTEND_TOOLS.has(tcName) && sandboxRef.current?.isReady) {
                    const tcArgsCopy = tcArgs ?? {}
                    void executeFrontendTool(tcName, tcArgsCopy)
                      .then((result) => {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === aiMsgId
                              ? {
                                  ...m,
                                  toolCalls: (m.toolCalls ?? []).map((tc) =>
                                    tc.id === tcId
                                      ? { ...tc, result, isExecuting: false }
                                      : tc,
                                  ),
                                }
                              : m,
                          ),
                        )
                        // 若是 writeFile 工具，同步到 dev server 预览（HMR 自动生效）
                        if (tcName === 'writeFile' && sandboxRef.current) {
                          void sandboxRef.current.startDevServer().then((url) => {
                            setDevServerUrl(url)
                          }).catch(() => {
                            // dev server 启动失败：静默，使用 srcDoc 降级
                          })
                        }
                      })
                      .catch((err) => {
                        const errorResult = {
                          error: err instanceof Error ? err.message : String(err),
                        }
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === aiMsgId
                              ? {
                                  ...m,
                                  toolCalls: (m.toolCalls ?? []).map((tc) =>
                                    tc.id === tcId
                                      ? {
                                          ...tc,
                                          result: errorResult,
                                          isExecuting: false,
                                          hasError: true,
                                        }
                                      : tc,
                                  ),
                                }
                              : m,
                          ),
                        )
                      })
                  }
                }
              } else if (currentEvent === 'tool_result') {
                const { id: trId, result: trResult } = data
                if (trId) {
                  const hasError =
                    trResult != null &&
                    typeof trResult === 'object' &&
                    'error' in trResult
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === aiMsgId
                        ? {
                            ...m,
                            toolCalls: (m.toolCalls ?? []).map((tc) =>
                              tc.id === trId
                                ? { ...tc, result: trResult, isExecuting: false, hasError }
                                : tc,
                            ),
                          }
                        : m,
                    ),
                  )
                }
              } else if (currentEvent === 'done') {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== aiMsgId) return m
                    // 如果 AI 只调工具没输出文本，填充默认说明，避免空白气泡
                    const hasToolCalls = m.toolCalls && m.toolCalls.length > 0
                    const emptyContent = !m.content || m.content.trim() === ''
                    const defaultText =
                      hasToolCalls && emptyContent ? '已通过工具完成操作。' : m.content
                    return { ...m, isStreaming: false, content: defaultText }
                  }),
                )
              } else if (currentEvent === 'error') {
                const errMsg = data.error || 'AI 回复失败'
                if (!receivedAnyToken) {
                  // 之前未收到任何 token：把错误信息写入 AI 消息内容，让用户看到具体原因
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === aiMsgId
                        ? { ...m, content: `⚠️ ${errMsg}`, isStreaming: false }
                        : m,
                    ),
                  )
                } else {
                  setMessages((prev) =>
                    prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m)),
                  )
                }
                toast.error(errMsg)
              }
            }
          }
        }

        // 流自然结束但未收到 done：确保停止流式 + 停止工具调用执行状态
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  isStreaming: false,
                  toolCalls: (m.toolCalls ?? []).map((tc) =>
                    tc.isExecuting ? { ...tc, isExecuting: false } : tc,
                  ),
                }
              : m,
          ),
        )
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.isExecuting ? { ...tc, isExecuting: false } : tc,
                    ),
                  }
                : m,
            ),
          )
          return
        }
        // 不再删除 AI 消息，而是把错误信息显示在消息中，方便用户排查
        const errMsg = err instanceof Error ? err.message : '发送失败'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  content: m.content
                    ? `${m.content}\n\n⚠️ 生成中断：${errMsg}`
                    : `⚠️ ${errMsg}`,
                  isStreaming: false,
                }
              : m,
          ),
        )
        toast.error(errMsg)
      } finally {
        setIsLoading(false)
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    },
    [isLoading, planMode, plan, teamMode, handleSendTeam],
  )

  // ----- A1 自动调试闭环：监听 iframe error，自动发送修复请求 -----
  // iframe 内的 ERROR_CAPTURE_SCRIPT 会 postMessage('vibe-error')，这里接收并：
  // 1) 推送到 sandbox 的错误收集器（供 readTerminal 等工具读取）
  // 2) 计数（用于 StatusBar 显示）
  // 3) 流式结束后自动发送修复 prompt（最多 3 轮，防死循环；用户手动发送会重置计数）
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'vibe-error') return
      const msg = typeof event.data.message === 'string' ? event.data.message : '未知错误'
      // 推送到沙箱错误收集器（A1 自动调试闭环数据源）
      sandboxRef.current?.pushIframeError(msg)
      setIframeErrorCount((c) => c + 1)
      // 自动修复：流式生成中不触发，2s 内不重复触发
      if (autoFixEnabled && !isStreaming && Date.now() - lastAutoFixRef.current > 2000) {
        // 防死循环：最多自动修复 3 次
        if (autoFixRoundRef.current >= 3) {
          toast.warning('自动修复已达 3 次上限，请手动检查问题')
          return
        }
        lastAutoFixRef.current = Date.now()
        autoFixRoundRef.current += 1
        const round = autoFixRoundRef.current
        // 用字符串拼接避免模板字面量转义问题
        const fixPrompt =
          '页面报错了，请修复：\n' +
          '```\n' +
          msg.slice(0, 500) +
          '\n```'
        // 直接自动发送修复请求，无需用户手动点击
        // 用 setTimeout 0 确保在 message 事件回调外执行
        setTimeout(() => {
          void handleSendByText(fixPrompt, { isAutoFix: true })
          toast.info(`检测到 iframe 错误，已自动发送修复请求（第 ${round} 轮）`)
        }, 0)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [autoFixEnabled, isStreaming, handleSendByText])

  // ----- Plan Mode 阶段 2：执行 plan（走 POST /api/plans/:id/execute） -----
  const handleExecutePlan = useCallback(async () => {
    if (!plan) return
    if (planExecuting) return

    setPlanExecuting(true)
    if (planAbortRef.current) planAbortRef.current.abort()
    const controller = new AbortController()
    planAbortRef.current = controller

    // 添加 AI 占位消息显示执行输出
    const aiMsgId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      {
        id: aiMsgId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      },
    ])

    try {
      await executePlan(plan.id, {
        onStepStart: (stepId, step) => {
          setPlan((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'executing',
                  steps: prev.steps.map((s) =>
                    s.id === stepId
                      ? {
                          ...s,
                          status: 'in_progress',
                          started_at: new Date().toISOString(),
                        }
                      : s,
                  ),
                }
              : null,
          )
          // 追加步骤过渡提示到 AI 消息，避免步骤间静默给人生成断了的错觉
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    content:
                      m.content +
                      `\n\n--- 📋 步骤 ${stepId}：${step?.title ?? ''} ---\n`,
                  }
                : m,
            ),
          )
        },
        onToken: (c) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: m.content + c } : m,
            ),
          )
        },
        onToolCall: (tcId, tcName, tcArgs) => {
          // 把工具调用加入消息（与 single/team 模式一致），让用户看到执行状态
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    toolCalls: [
                      ...(m.toolCalls ?? []),
                      {
                        id: tcId,
                        name: tcName,
                        args: tcArgs,
                        isExecuting: true,
                      },
                    ],
                  }
                : m,
            ),
          )

          // 前端工具拦截：bash / writeFile / readFile / listFiles / install
          // 由前端 WebContainer 执行，结果同步到预览（与 single 模式一致）
          if (FRONTEND_TOOLS.has(tcName) && sandboxRef.current?.isReady) {
            void executeFrontendTool(tcName, tcArgs)
              .then((result) => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? {
                          ...m,
                          toolCalls: (m.toolCalls ?? []).map((tc) =>
                            tc.id === tcId
                              ? { ...tc, result, isExecuting: false }
                              : tc,
                          ),
                        }
                      : m,
                  ),
                )
                // 若是 writeFile 工具，同步到 dev server 预览（HMR 自动生效）
                if (tcName === 'writeFile' && sandboxRef.current) {
                  void sandboxRef.current.startDevServer().then((url) => {
                    setDevServerUrl(url)
                  }).catch(() => {
                    // dev server 启动失败：静默，使用 srcDoc 降级
                  })
                }
              })
              .catch((err) => {
                const errorResult = {
                  error: err instanceof Error ? err.message : String(err),
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? {
                          ...m,
                          toolCalls: (m.toolCalls ?? []).map((tc) =>
                            tc.id === tcId
                              ? {
                                  ...tc,
                                  result: errorResult,
                                  isExecuting: false,
                                  hasError: true,
                                }
                              : tc,
                          ),
                        }
                      : m,
                  ),
                )
              })
          }
        },
        onToolResult: (trId, _trName, trResult) => {
          // 后端执行的工具结果（非前端拦截的工具）
          const hasError =
            trResult != null &&
            typeof trResult === 'object' &&
            'error' in trResult
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.id === trId
                        ? { ...tc, result: trResult, isExecuting: false, hasError }
                        : tc,
                    ),
                  }
                : m,
            ),
          )
        },
        onStepDone: (stepId, result) => {
          setPlan((prev) =>
            prev
              ? {
                  ...prev,
                  steps: prev.steps.map((s) =>
                    s.id === stepId
                      ? {
                          ...s,
                          status: 'completed',
                          result: result || s.result,
                          completed_at: new Date().toISOString(),
                        }
                      : s,
                  ),
                }
              : null,
          )
        },
        onDone: (status) => {
          setPlan((prev) =>
            prev
              ? { ...prev, status: status as Plan['status'] }
              : null,
          )
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, isStreaming: false } : m,
            ),
          )
        },
        onError: (err) => {
          toast.error(err)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    content: m.content + `\n\n⚠️ ${err}`,
                  }
                : m,
            ),
          )
        },
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error(err instanceof Error ? err.message : '执行 plan 失败')
    } finally {
      setPlanExecuting(false)
      if (planAbortRef.current === controller) {
        planAbortRef.current = null
      }
    }
  }, [plan, planExecuting])

  // ----- Plan Mode：编辑 steps（拖拽 / 删除 / 追加） -----
  const handleEditPlanSteps = useCallback(
    async (newSteps: PlanStep[]) => {
      if (!plan) return
      // 先本地更新（即时反馈）
      setPlan((prev) =>
        prev ? { ...prev, steps: newSteps } : null,
      )
      // 再持久化到后端
      try {
        const res = await updatePlan(plan.id, { steps: newSteps })
        setPlan(res.plan)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '保存 plan 失败')
      }
    },
    [plan],
  )

  // ----- Plan Mode：暂停执行 -----
  const handlePausePlan = useCallback(async () => {
    if (!plan) return
    planAbortRef.current?.abort()
    try {
      await pausePlan(plan.id)
      setPlan((prev) => (prev ? { ...prev, status: 'paused' } : null))
      toast.success('已暂停 plan 执行')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '暂停失败')
    }
  }, [plan])

  // ----- Plan Mode：跳过某个 step -----
  const handleSkipPlanStep = useCallback(
    async (stepId: number) => {
      if (!plan) return
      try {
        const res = await skipPlanStep(plan.id, stepId)
        setPlan(res.plan)
        toast.success(`已跳过 step #${stepId}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '跳过失败')
      }
    },
    [plan],
  )

  // ----- assistant-ui 适配器：把 VibeMessage[] 接入 useExternalStoreRuntime -----
  const convertMessage = useCallback(
    (message: VibeMessage): ThreadMessageLike => {
      const isAssistant = message.role !== 'user'
      return {
        role: isAssistant ? 'assistant' : 'user',
        id: message.id,
        // status 仅对 assistant 消息有效，对 user 消息设置会抛 "status is only supported for assistant messages"
        ...(isAssistant && {
          status: message.isStreaming
            ? { type: 'running' }
            : { type: 'complete', reason: 'stop' },
        }),
        content: [
          { type: 'text', text: message.content },
          ...(message.toolCalls ?? []).map((tc) => ({
            type: 'tool-call' as const,
            toolName: tc.name,
            toolCallId: tc.id,
            args: tc.args as any,
            result: tc.result as any,
            isError: tc.hasError === true,
          })),
        ],
      }
    },
    [],
  )

  const adapter = useMemo<ExternalStoreAdapter<VibeMessage>>(
    () => ({
      messages,
      isRunning: isLoading,
      convertMessage,
      onNew: async (message) => {
        let text = ''
        if (typeof message.content === 'string') {
          text = message.content
        } else if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'text' && typeof part.text === 'string') {
              text += part.text
            }
          }
        }
        await handleSendByText(text)
      },
      onCancel: async () => {
        abortControllerRef.current?.abort()
        teamAbortRef.current?.abort()
      },
    }),
    [messages, isLoading, convertMessage, handleSendByText],
  )

  const runtime = useExternalStoreRuntime(adapter)

  // ----- 工具栏操作 -----

  const handleReset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    if (teamAbortRef.current) {
      teamAbortRef.current.abort()
    }
    // 重置 Teamwork 会话：下次发送是新 team session
    setTeamSessionId(null)
    setMessages([])
  }, [])

  const handleDownload = useCallback(() => {
    if (!code) return
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(lastPrompt || 'vibe-code').slice(0, 30).replace(/\s+/g, '-')}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [code, lastPrompt])

  const handleCopy = useCallback(async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      toast.success('代码已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动选择代码')
    }
  }, [code])

  const handleSave = useCallback(async () => {
    if (!code || !saveTitle.trim()) return
    setSaving(true)
    try {
      await saveVibeProject({
        title: saveTitle.trim(),
        code,
        prompt: lastPrompt,
        is_public: savePublic,
      })
      toast.success('作品保存成功！')
      setSaveOpen(false)
      setSaveTitle('')
      setSavePublic(false)
      loadProjects()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }, [code, saveTitle, savePublic, lastPrompt, loadProjects])

  // 分享到社区：将当前 Vibe Code 项目作为 project_share 类型动态发布
  const [shareLoading, setShareLoading] = useState(false)
  const handleShareToCommunity = useCallback(async () => {
    if (!code) {
      toast.info('请先生成代码后再分享')
      return
    }
    if (shareLoading) return
    setShareLoading(true)
    try {
      const title = lastPrompt.slice(0, 60) || '未命名 Vibe Code 项目'
      // 代码截断到 8000 字（避免数据库字段过大）
      const codeSnippet = code.length > 8000 ? code.slice(0, 8000) + '\n// ...' : code
      await createPost({
        type: 'project_share',
        content: `分享了一个 Vibe Code 项目：${title}`,
        metadata: {
          title,
          description: lastPrompt,
          code: codeSnippet,
          language: 'html',
        },
      })
      toast.success('已分享到社区！')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '分享失败，请重试')
    } finally {
      setShareLoading(false)
    }
  }, [code, lastPrompt, shareLoading])

  // 手动修复：发送一条 user 消息让 Agent 修复
  const handleFix = async () => {
    const errDesc = fixError.trim() || '运行时错误，请检查并修复代码中的问题'
    setFixOpen(false)
    setFixError('')
    await handleSendByText(`请修复以下问题：\n${errDesc}`)
  }

  // 加载历史项目：作为初始对话注入（user 加载指令 + assistant writeFile 工具调用）
  const handleLoadProject = useCallback(
    (project: VibeProject) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const userMsgId = `load-${project.id}-${Date.now()}`
      const aiMsgId = `load-resp-${project.id}-${Date.now()}`
      setMessages([
        {
          id: userMsgId,
          role: 'user',
          content: `加载项目「${project.title}」：\n\n${project.prompt || ''}`,
        },
        {
          id: aiMsgId,
          role: 'assistant',
          content: `已加载项目「${project.title}」。代码已显示在右侧，你可以在下方描述需要修改的内容。`,
          toolCalls: [
            {
              id: `load-writeFile-${project.id}`,
              name: 'writeFile',
              args: { path: 'index.html', content: project.code },
              result: { success: true, path: 'index.html', size: project.code.length },
              isExecuting: false,
            },
          ],
        },
      ])
      setLastPrompt(project.prompt)
      setMobileTab('preview')
    },
    [],
  )

  // ----- 视图模式按钮配置 -----
  const viewModeButtons: Array<{ mode: ViewMode; icon: ReactNode; label: string }> = [
    { mode: 'split', icon: <Columns2 className="h-4 w-4" />, label: '分屏' },
    { mode: 'code', icon: <Code className="h-4 w-4" />, label: '代码' },
    { mode: 'preview', icon: <Eye className="h-4 w-4" />, label: '预览' },
  ]

  // ----- v5.0 命令面板项（⌘K） -----
  const commandPaletteItems: CommandPaletteItem[] = useMemo(
    () => [
      {
        id: 'save',
        label: '保存项目',
        icon: Save,
        group: 'actions',
        onSelect: () => {
          setSaveTitle(lastPrompt.slice(0, 40) || '未命名项目')
          setSaveOpen(true)
        },
      },
      {
        id: 'snapshot',
        label: '创建快照',
        icon: Camera,
        group: 'actions',
        onSelect: () => {
          void handleCreateManualSnapshot()
        },
      },
      {
        id: 'share',
        label: '分享项目',
        icon: Share2,
        group: 'actions',
        onSelect: () => setShareDialogOpen(true),
      },
      {
        id: 'export',
        label: '导出为 ZIP',
        icon: Download,
        group: 'actions',
        onSelect: async () => {
          if (!sandboxRef.current?.isReady) {
            toast.error('沙箱未就绪')
            return
          }
          try {
            await exportProjectAsZip(sandboxRef.current)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : '导出失败')
          }
        },
      },
      {
        id: 'reset',
        label: '重置沙箱',
        icon: RotateCcw,
        group: 'actions',
        onSelect: () => handleReset(),
      },
      {
        id: 'clear-chat',
        label: '清空对话记录',
        icon: Trash2,
        group: 'actions',
        onSelect: () => {
          if (confirm('确认清空所有对话记录？')) {
            localStorage.removeItem(VIBE_MESSAGES_KEY)
            setMessages([])
            toast.success('对话已清空')
          }
        },
      },
      {
        id: 'view-split',
        label: '切换到分屏视图',
        icon: Columns2,
        group: 'views',
        onSelect: () => setViewMode('split'),
      },
      {
        id: 'view-code',
        label: '切换到代码视图',
        icon: Code,
        group: 'views',
        onSelect: () => setViewMode('code'),
      },
      {
        id: 'view-preview',
        label: '切换到预览视图',
        icon: Eye,
        group: 'views',
        onSelect: () => setViewMode('preview'),
      },
      {
        id: 'toggle-terminal',
        label: '切换终端',
        icon: TerminalIcon,
        group: 'tools',
        onSelect: () => setShowTerminal((v) => !v),
      },
      {
        id: 'toggle-plan',
        label: planMode ? '关闭 Plan Mode' : '开启 Plan Mode',
        icon: ListChecks,
        group: 'tools',
        onSelect: () => setPlanMode((v) => !v),
      },
      {
        id: 'toggle-team',
        label: teamMode ? '关闭 Teamwork' : '开启 Teamwork',
        icon: Users,
        group: 'tools',
        onSelect: () => setTeamMode((v) => !v),
      },
      {
        id: 'toggle-autofix',
        label: autoFixEnabled ? '关闭自动修复' : '开启自动修复',
        icon: Wrench,
        group: 'tools',
        onSelect: () => setAutoFixEnabled((v) => !v),
      },
    ],
    [planMode, teamMode, autoFixEnabled, lastPrompt, handleCreateManualSnapshot, handleReset],
  )

  // ----- 渲染：左侧面板（assistant-ui Thread + 历史项目） -----
  const renderLeftPanel = () => (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* Plan Mode：左侧消息流上方显示 PlanPanel（Batch B）—— shrink-0 防止压缩 Thread */}
      {plan && (
        <div className="shrink-0">
          <PlanPanel
            plan={plan}
            onEdit={handleEditPlanSteps}
            onExecute={handleExecutePlan}
            onPause={handlePausePlan}
            onSkip={handleSkipPlanStep}
            isExecuting={planExecuting}
            onClose={() => {
              if (planExecuting) {
                toast.info('请先暂停 plan 执行')
                return
              }
              setPlan(null)
              setPlanMode(false)
            }}
          />
        </div>
      )}

      {/* Thread：消息区 + Composer（输入框在底部）—— min-h 防止被 PlanPanel + 历史项目挤压到 0 */}
      <ThreadPrimitive.Root className="flex min-h-[200px] flex-1 flex-col overflow-hidden">
        <ThreadPrimitive.Viewport
          ref={conversationRef}
          className="flex-1 overflow-y-auto scrollbar-thin"
        >
          <div className="mx-auto max-w-full space-y-3 px-3 py-4">
            <ThreadPrimitive.Empty>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bot className="mb-2 h-10 w-10 text-gray-300 dark:text-gray-600" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Vibe Coding Agent</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  描述需求开始对话，Agent 会自动调用工具
                </p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  支持多轮修改、联网搜索、生成图片/视频
                </p>
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages>
              {({ message }) => {
                if (message.role === 'user') return <UserMessage />
                // Teamwork 模式：从 VibeMessage 中读取 agentRole / review（C7 / C9）
                const vibeMsg = messages.find((m) => m.id === message.id)
                // v5.0：判断是否为最后一条 assistant 消息（用于流式指示器）
                const isLastAssistant =
                  messages.length > 0 &&
                  messages[messages.length - 1].id === message.id &&
                  messages[messages.length - 1].role === 'assistant'
                // v5.0：查找正在执行的工具调用（如果有）
                const executingTool = vibeMsg?.toolCalls?.find((tc) => tc.isExecuting)
                return (
                  <>
                    <AssistantMessage
                      agentRole={vibeMsg?.agentRole}
                      review={vibeMsg?.review}
                    />
                    {/* v5.0 流式指示器：仅在最后一条 assistant 消息后显示 */}
                    {isLastAssistant && isStreaming && !vibeMsg?.content && (
                      <ThinkingIndicator
                        visible={true}
                        role={vibeMsg?.agentRole ? ROLE_BADGE_META[vibeMsg.agentRole].label : undefined}
                      />
                    )}
                    {executingTool && (
                      <ToolProgress name={executingTool.name} isExecuting={true} />
                    )}
                  </>
                )
              }}
            </ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>

        {/* Composer（输入框在底部，spec §6.3） */}
        <VibeComposer
          disabled={isStreaming || planExecuting}
          isStreaming={isStreaming || planExecuting}
          onStop={() => {
            abortControllerRef.current?.abort()
            planAbortRef.current?.abort()
            teamAbortRef.current?.abort()
          }}
          value={composerValue}
          onChange={setComposerValue}
          planMode={planMode}
          hasPlan={!!plan}
          teamMode={teamMode}
        />
      </ThreadPrimitive.Root>

      {/* 历史项目 */}
      <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 p-3 max-h-48 overflow-y-auto scrollbar-thin">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400">我的项目</h3>
          {projects.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{projects.length}</span>
          )}
        </div>
        {!user ? (
          <p className="py-2 text-center text-xs text-gray-400 dark:text-gray-500">
            <Link to="/auth/login" className="text-primary hover:underline">
              登录
            </Link>
            后可保存项目
          </p>
        ) : projectsLoading ? (
          <div className="flex justify-center py-2">
            <Spinner size="sm" />
          </div>
        ) : projects.length === 0 ? (
          <p className="py-2 text-center text-xs text-gray-400 dark:text-gray-500">
            还没有项目，生成后点击「保存」
          </p>
        ) : (
          <div className="space-y-1.5">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => handleLoadProject(p)}
                className="block w-full rounded-lg border border-gray-100 dark:border-gray-800 px-2.5 py-1.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{p.title}</p>
                {p.prompt && (
                  <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">{p.prompt}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 版本历史面板（Task 7.2）—— 折叠式，默认收起 */}
      <div className="shrink-0 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          <div className="flex items-center gap-1.5">
            {historyOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            )}
            <History className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">版本历史</span>
          </div>
          {snapshots.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{snapshots.length}</span>
          )}
        </button>

        {historyOpen && (
          <div className="max-h-64 overflow-y-auto px-3 pb-3 scrollbar-thin">
            {/* 分支切换器 */}
            <div className="mb-2 flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 shrink-0 text-gray-400 dark:text-gray-500" />
              <div className="flex flex-wrap gap-1">
                {branches.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setCurrentBranch(b)}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs transition-colors',
                      currentBranch === b
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="mb-2 flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                onClick={handleCreateManualSnapshot}
                disabled={isStreaming || !hasCode}
              >
                <Plus className="h-3 w-3" />
                快照
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setRemixOpen(true)}
                disabled={isStreaming || !hasCode}
              >
                <GitBranch className="h-3 w-3" />
                新建 Remix 分支
              </Button>
            </div>

            {/* 时间线 */}
            {snapshotsLoading ? (
              <div className="flex justify-center py-3">
                <Spinner size="sm" />
              </div>
            ) : snapshots.length === 0 ? (
              <p className="py-2 text-center text-xs text-gray-400 dark:text-gray-500">
                还没有快照，生成代码后会自动保存
              </p>
            ) : (
              <div className="relative space-y-1.5 pl-3">
                {/* 时间线竖线 */}
                <div className="absolute bottom-1 left-1 top-1 w-px bg-gray-200 dark:bg-gray-700" />
                {snapshots.map((s) => (
                  <div
                    key={s.id}
                    className="relative rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-2.5 py-1.5 transition-colors hover:border-gray-200 dark:hover:border-gray-700"
                  >
                    {/* 时间线圆点 */}
                    <div className="absolute -left-[7px] top-3 h-2 w-2 rounded-full bg-primary ring-2 ring-white dark:ring-gray-900" />
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex min-w-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span className="truncate">{relativeTime(s.created_at)}</span>
                      </div>
                      {s.label && (
                        <span className="truncate text-xs text-gray-400 dark:text-gray-500">
                          {s.label}
                        </span>
                      )}
                    </div>
                    {/* 操作按钮 */}
                    <div className="mt-1 flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleRestoreSnapshot(s.id)}
                        disabled={isStreaming}
                        className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-primary disabled:opacity-50"
                        title="回退到此快照"
                      >
                        <RotateCcw className="h-3 w-3" />
                        回退
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDiff(s)}
                        disabled={snapshots.length < 2}
                        className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-primary disabled:opacity-50"
                        title="与其他快照对比"
                      >
                        <GitCompare className="h-3 w-3" />
                        对比
                      </button>
                      {/* v5.0：与当前代码对比（使用 DiffViewerDialog） */}
                      <button
                        type="button"
                        onClick={() =>
                          setDiffDialogState({
                            open: true,
                            oldCode: s.code,
                            newCode: code,
                            oldLabel: s.label ? `${s.label} · ${relativeTime(s.created_at)}` : relativeTime(s.created_at),
                            newLabel: '当前代码',
                          })
                        }
                        disabled={!hasCode}
                        className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-primary disabled:opacity-50"
                        title="与当前代码对比"
                      >
                        <Diff className="h-3 w-3" />
                        当前
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // ----- 渲染：右侧主区（代码 + 预览） -----
  const renderRightPanel = () => {
    if (viewMode === 'code') {
      return (
        <div className="h-full p-2">
          <CodeArea code={code} streaming={isStreaming} codeRef={codeRef} />
        </div>
      )
    }
    if (viewMode === 'preview') {
      return (
        <div className="h-full p-2">
          <PreviewArea
            srcDoc={iframeSrcDoc}
            iframeKey={iframeVersion}
            hasCode={hasCode}
            devServerUrl={devServerUrl}
          />
        </div>
      )
    }
    // split
    return (
      <div className="grid h-full grid-rows-2 gap-2 p-2">
        <CodeArea code={code} streaming={isStreaming} codeRef={codeRef} />
        <PreviewArea
          srcDoc={iframeSrcDoc}
          iframeKey={iframeVersion}
          hasCode={hasCode}
          devServerUrl={devServerUrl}
        />
      </div>
    )
  }

  // ----- 渲染：工具栏 -----
  const renderToolbar = () => (
    <div className="flex items-center gap-2 flex-wrap min-w-0 justify-end">
      {/* Plan Mode 开关（Batch B） */}
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors',
          planMode
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
        )}
        title="开启后 AI 会先规划步骤，确认后再执行"
      >
        <ListChecks className="h-3.5 w-3.5" />
        <span className="text-xs font-medium hidden sm:inline">Plan Mode</span>
        <Switch
          checked={planMode}
          onCheckedChange={(checked) => {
            setPlanMode(checked)
            // 关闭 Plan Mode 时不强制清空 plan（让用户仍可看到历史 plan）
            // 但开启时若已有 plan，保留
            // Plan 与 Teamwork 可共存：Teamwork 团队可围绕 Plan 协作
          }}
          disabled={isStreaming || planExecuting}
          className="scale-90"
        />
      </div>

      {/* Teamwork 开关 + 角色选择（Batch C - C6） */}
      <TeamToggle
        enabled={teamMode}
        onToggle={(v) => {
          // Plan 与 Teamwork 可共存：Teamwork 团队可围绕 Plan 协作
          setTeamMode(v)
          // 关闭 Teamwork 时清空 sessionId（下次开启是新会话）
          if (!v) setTeamSessionId(null)
        }}
        roles={teamRoles}
        onRolesChange={setTeamRoles}
        disabled={isStreaming || planExecuting}
      />

      <Separator orientation="vertical" className="hidden md:block h-6" />

      {/* 终端切换按钮（Batch D） */}
      <button
        type="button"
        onClick={() => setShowTerminal((v) => !v)}
        disabled={!webcontainerReady}
        title={
          !webcontainerReady
            ? '沙箱未就绪，无法使用终端'
            : showTerminal
              ? '收起终端'
              : '展开终端'
        }
        className={cn(
          'hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
          showTerminal
            ? 'bg-primary/10 text-primary'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300',
          !webcontainerReady && 'opacity-40 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent',
        )}
      >
        <TerminalIcon className="h-4 w-4" />
      </button>

      <Separator orientation="vertical" className="hidden md:block h-6" />

      {/* 视图模式切换（桌面） */}
      <div className="hidden md:flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800/50">
        {viewModeButtons.map((btn) => (
          <button
            key={btn.mode}
            type="button"
            onClick={() => setViewMode(btn.mode)}
            title={btn.label}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              viewMode === btn.mode
                ? 'bg-white dark:bg-gray-900 text-primary shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {btn.icon}
          </button>
        ))}
      </div>

      <Separator orientation="vertical" className="hidden md:block h-6" />

      {/* 全屏（桌面） */}
      <button
        type="button"
        onClick={() => setFullscreen(viewMode === 'code' ? 'code' : 'preview')}
        title="全屏"
        className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <Maximize2 className="h-4 w-4" />
      </button>

      {/* v5.0 新功能按钮：分享 / 导出 / 命令面板 / 自动修复开关 */}
      <button
        type="button"
        onClick={() => setShareDialogOpen(true)}
        title="分享项目"
        className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <Share2 className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => {
          if (!sandboxRef.current?.isReady) {
            toast.error('沙箱未就绪')
            return
          }
          void exportProjectAsZip(sandboxRef.current).catch((err: unknown) => {
            toast.error(err instanceof Error ? err.message : '导出失败')
          })
        }}
        title="导出为 ZIP"
        className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <Download className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        title="命令面板 (⌘K)"
        className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <Command className="h-4 w-4" />
      </button>

      {/* v5.0 自动修复开关（A1 自动调试闭环） */}
      <div
        className={cn(
          'hidden md:flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors',
          autoFixEnabled
            ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400',
        )}
        title="开启后检测到 iframe 错误自动准备修复提示"
      >
        <Wrench className="h-3.5 w-3.5" />
        <span className="text-xs hidden lg:inline">自动修复</span>
        <Switch
          checked={autoFixEnabled}
          onCheckedChange={setAutoFixEnabled}
          className="scale-90"
          aria-label="自动修复开关"
        />
      </div>

      {/* 收起/展开左侧（桌面） */}
      <button
        type="button"
        onClick={() => setLeftCollapsed((v) => !v)}
        title={leftCollapsed ? '展开左侧' : '收起左侧'}
        className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
      >
        {leftCollapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>

      {hasCode && (
        <>
          <Separator orientation="vertical" className="h-6" />

          {/* 复制 / 下载 */}
          <Button size="sm" variant="outline" onClick={handleCopy} disabled={isStreaming}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={isStreaming}>
            <Download className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* 修复 / 重置 */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFixOpen(true)}
            disabled={isStreaming}
          >
            <Wrench className="h-4 w-4" />
            <span className="hidden sm:inline">修复</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset} disabled={isStreaming}>
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">重置</span>
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* 保存 */}
          <Button
            size="sm"
            onClick={() => {
              setSaveTitle(lastPrompt.slice(0, 40) || '未命名项目')
              setSaveOpen(true)
            }}
            disabled={isStreaming}
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">保存</span>
          </Button>

          {/* 分享到社区 */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleShareToCommunity}
            disabled={isStreaming || shareLoading || !code}
            title="分享到社区信息流"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">{shareLoading ? '分享中...' : '分享到社区'}</span>
          </Button>
        </>
      )}
    </div>
  )

  // ----- 主渲染 -----
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* 注册工具调用 UI 渲染器（全局生效，对 ThreadPrimitive.Messages 自动调度） */}
      <WebSearchToolUI />
      <GenerateImageToolUI />
      <GenerateVideoToolUI />
      <WriteFileToolUI />
      <ReadFileToolUI />
      <ExecuteCodeToolUI />

      <div className="relative flex h-dvh flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        {/* WebContainer 沙箱 boot 失败 banner（降级提示）—— absolute 浮层不占文档流，
            避免出现/消失时主内容区 flex-1 高度变化导致整页 layout shift */}
        {sandboxError && (
          <div className="absolute top-2 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/80 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300 shadow-md backdrop-blur">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate max-w-[400px]">
              沙箱不可用：{sandboxError}。已降级到基础预览模式（srcDoc）。
            </span>
            <button
              type="button"
              onClick={() => {
                if (sandboxRef.current) {
                  void sandboxRef.current.boot().then(() => {
                    if (sandboxRef.current?.isReady) {
                      setWebcontainerReady(true)
                      setSandboxError(null)
                    }
                  })
                }
              }}
              className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium underline hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              重试
            </button>
          </div>
        )}
        {/* AI 协作者选择器 */}
        <div className="shrink-0 border-b border-gray-200 bg-white/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/80">
          <AICollaboratorPicker specialty="vibe-code" value={aiCollaborator} onChange={setAiCollaborator} />
        </div>
        {/* 顶部工具栏 */}
        <header className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                to="/studio"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                title="返回创意工坊"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-gray-900 dark:text-gray-100">Vibe 编程</h1>
                <p className="hidden sm:block text-xs text-gray-500 dark:text-gray-400">
                  自然语言 → 可运行代码，AI SDK 流式 + 工具调用
                </p>
              </div>
            </div>
            {renderToolbar()}
          </div>
        </header>

        {/* 主体内容区 */}
        <div className="flex-1 overflow-hidden">
          {/* 手机：Tabs 切换 */}
          <Tabs
            value={mobileTab}
            onValueChange={(v) => {
              setMobileTab(v)
              // 切换 Tab 后触发 resize，让 iframe / xterm 重新计算尺寸
              // 避免 hidden 状态下 fit() 得到 0 宽度导致渲染异常
              requestAnimationFrame(() => {
                window.dispatchEvent(new Event('resize'))
              })
            }}
            className="md:hidden flex h-full flex-col"
          >
            <TabsList className="grid grid-cols-4 mx-2 mt-2 shrink-0">
              <TabsTrigger value="chat">
                <Bot className="h-4 w-4 mr-1" />
                对话
              </TabsTrigger>
              <TabsTrigger value="code">
                <Code className="h-4 w-4 mr-1" />
                代码
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="h-4 w-4 mr-1" />
                预览
              </TabsTrigger>
              <TabsTrigger value="terminal">
                <TerminalIcon className="h-4 w-4 mr-1" />
                终端
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
              {renderLeftPanel()}
            </TabsContent>
            <TabsContent value="code" className="flex-1 overflow-hidden mt-0">
              <div className="h-full p-2">
                <CodeArea code={selectedFile?.content ?? code} streaming={isStreaming} codeRef={codeRef} />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
              <div className="h-full p-2">
                <PreviewArea
                  srcDoc={iframeSrcDoc}
                  iframeKey={iframeVersion}
                  hasCode={hasCode}
                  devServerUrl={devServerUrl}
                />
              </div>
            </TabsContent>
            <TabsContent value="terminal" className="flex-1 overflow-hidden mt-0">
              <div className="h-full p-2">
                <Terminal webcontainer={sandboxRef.current} />
              </div>
            </TabsContent>
          </Tabs>

          {/* 平板/桌面：三栏分栏布局（Batch D） */}
          <div className="hidden md:flex h-full overflow-hidden">
            {/* 左栏：对话区（width transition 平滑收缩/展开，避免 mount/unmount 导致 layout shift） */}
            <aside className={cn(
              "shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-out",
              leftCollapsed ? "w-0" : "w-[300px] lg:w-[340px]"
            )}>
              {renderLeftPanel()}
            </aside>
            {/* 中栏：文件树 + 代码（仅 preview 模式渲染 CodeArea，避免与右栏重复） */}
            <section className="hidden lg:flex w-[260px] xl:w-[300px] shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className={cn(
                "flex flex-col overflow-hidden border-b border-gray-200 dark:border-gray-700",
                viewMode === 'preview' ? "h-[40%]" : "h-full"
              )}>
                <FileTree
                  webcontainer={sandboxRef.current}
                  onFileSelect={(path, content) => setSelectedFile({ path, content })}
                />
              </div>
              {viewMode === 'preview' && (
                <div className="flex-1 overflow-hidden">
                  <CodeArea
                    code={selectedFile?.content ?? code}
                    streaming={isStreaming}
                    codeRef={codeRef}
                  />
                </div>
              )}
            </section>
            {/* 右栏：预览 + 终端抽屉 */}
            <main className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">{renderRightPanel()}</div>
              {/* 终端抽屉（底部，可折叠）—— 内部 DOM 常驻，仅用 opacity 控制可见性，
                  避免 mount/unmount 与 height transition 冲突导致空白条 / xterm fit 失败 */}
              <div className={cn(
                'shrink-0 border-t border-gray-200 dark:border-gray-700 transition-all duration-300 ease-out overflow-hidden',
                showTerminal ? 'h-[240px]' : 'h-0',
              )}>
                <div className={cn(
                  'flex h-full flex-col overflow-hidden bg-[#0f172a] transition-opacity duration-200',
                  showTerminal ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}>
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-3 py-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                      <TerminalIcon className="h-3 w-3" />
                      终端
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowTerminal(false)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                      title="收起终端"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <Terminal webcontainer={sandboxRef.current} />
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>

        {/* 全屏覆盖：代码 */}
        {fullscreen === 'code' && (
          <div className="fixed inset-0 z-[60] bg-white dark:bg-gray-950">
            <button
              type="button"
              onClick={() => setFullscreen(null)}
              className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md bg-white dark:bg-gray-900 shadow-md ring-1 ring-gray-200 dark:ring-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              title="退出全屏 (ESC)"
            >
              <Minimize2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="h-full p-2">
              <CodeArea code={code} streaming={isStreaming} codeRef={codeRef} />
            </div>
          </div>
        )}

        {/* 全屏覆盖：预览 */}
        {fullscreen === 'preview' && (
          <div className="fixed inset-0 z-[60] bg-white dark:bg-gray-950">
            <button
              type="button"
              onClick={() => setFullscreen(null)}
              className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md bg-white dark:bg-gray-900 shadow-md ring-1 ring-gray-200 dark:ring-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              title="退出全屏 (ESC)"
            >
              <Minimize2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="h-full p-2">
              <PreviewArea
                srcDoc={iframeSrcDoc}
                iframeKey={iframeVersion}
                hasCode={hasCode}
                devServerUrl={devServerUrl}
              />
            </div>
          </div>
        )}

        {/* 保存弹窗 */}
        <Dialog
          open={saveOpen}
          onOpenChange={(v) => {
            if (!v) setSaveOpen(false)
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>保存项目</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  标题
                </label>
                <Input
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="给项目起个名字"
                  autoFocus
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={savePublic}
                  onChange={(e) => setSavePublic(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary"
                />
                公开到广场（其他人可见）
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!saveTitle.trim() || saving}
              >
                {saving ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 修复弹窗 */}
        <Dialog
          open={fixOpen}
          onOpenChange={(v) => {
            if (!v) setFixOpen(false)
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>修复代码错误</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                描述运行时遇到的错误，Agent 会基于当前对话上下文修复代码。
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  错误信息（可选）
                </label>
                <textarea
                  value={fixError}
                  onChange={(e) => setFixError(e.target.value)}
                  placeholder="例如：点击按钮没反应，控制台报错 xxx is not defined"
                  rows={4}
                  className="w-full resize-y rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setFixOpen(false)}>
                取消
              </Button>
              <Button size="sm" onClick={handleFix} disabled={isStreaming}>
                提交修复
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 版本对比 Diff 模态（Task 7.2） */}
        <Dialog
          open={diffOpen}
          onOpenChange={(v) => {
            if (!v) setDiffOpen(false)
          }}
        >
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-1.5">
                <Diff className="h-4 w-4" />
                版本对比
              </DialogTitle>
            </DialogHeader>

            {/* 对比目标选择 */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-400">对比：</span>
              <select
                value={diffCompareId}
                onChange={(e) => {
                  setDiffCompareId(e.target.value)
                  setDiffData(null)
                }}
                className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 focus:border-primary focus:outline-none"
              >
                {snapshots
                  .filter((s) => s.id !== diffBaseId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {relativeTime(s.created_at)}
                      {s.label ? ` · ${s.label}` : ''}
                    </option>
                  ))}
              </select>
              {diffData && (
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                  <span className="text-green-600 dark:text-green-400">+{diffData.added.length}</span>{' '}
                  <span className="text-red-600 dark:text-red-400">-{diffData.removed.length}</span>{' '}
                  <span>不变 {diffData.unchanged}</span>
                </span>
              )}
            </div>

            {/* 双栏 diff 视图 */}
            {diffLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : diffBaseSnapshot && diffCompareSnapshot ? (
              <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-hidden">
                {/* 左栏：base 快照（removed 高亮红色） */}
                <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="border-b border-gray-100 dark:border-gray-800 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                    基准版本（{relativeTime(diffBaseSnapshot.created_at)}）
                  </div>
                  <pre className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800/50 p-2 font-mono text-xs leading-5 scrollbar-thin">
                    {diffBaseSnapshot.code.split('\n').map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          diffBaseHighlight.has(i) && 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200',
                        )}
                      >
                        <span className="mr-2 select-none text-gray-300 dark:text-gray-600">
                          {i + 1}
                        </span>
                        {line || ' '}
                      </div>
                    ))}
                  </pre>
                </div>

                {/* 右栏：compare 快照（added 高亮绿色） */}
                <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="border-b border-gray-100 dark:border-gray-800 bg-green-50 dark:bg-green-950/50 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300">
                    对比版本（{relativeTime(diffCompareSnapshot.created_at)}）
                  </div>
                  <pre className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800/50 p-2 font-mono text-xs leading-5 scrollbar-thin">
                    {diffCompareSnapshot.code.split('\n').map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          diffCompareHighlight.has(i) && 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200',
                        )}
                      >
                        <span className="mr-2 select-none text-gray-300 dark:text-gray-600">
                          {i + 1}
                        </span>
                        {line || ' '}
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                无法加载快照数据
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDiffOpen(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新建 Remix 分支模态（Task 7.2） */}
        <Dialog
          open={remixOpen}
          onOpenChange={(v) => {
            if (!v) setRemixOpen(false)
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>新建 Remix 分支</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                基于当前代码创建一个新的分支，你可以在该分支上独立迭代而不影响主线。
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  分支名
                </label>
                <Input
                  value={remixBranchName}
                  onChange={(e) => setRemixBranchName(e.target.value)}
                  placeholder="例如：remix、experiment-v2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !remixCreating) {
                      handleCreateRemix()
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRemixOpen(false)}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleCreateRemix}
                disabled={remixCreating || !code}
              >
                {remixCreating ? '创建中…' : '创建分支'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* v5.0 命令面板（⌘K） */}
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          commands={commandPaletteItems}
        />

        {/* v5.0 分享对话框 */}
        <ShareDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          sandbox={sandboxRef.current}
          projectId={null}
          currentCode={code}
        />

        {/* v5.0 Diff 查看器（与当前代码对比） */}
        <DiffViewerDialog
          open={diffDialogState.open}
          onOpenChange={(open) => setDiffDialogState((prev) => ({ ...prev, open }))}
          oldCode={diffDialogState.oldCode}
          newCode={diffDialogState.newCode}
          oldLabel={diffDialogState.oldLabel}
          newLabel={diffDialogState.newLabel}
        />

        {/* v5.0 底部状态栏 */}
        <StatusBar
          tokenCount={messages.reduce((sum, m) => sum + (m.content?.length || 0), 0)}
          fileCount={0}
          devServerRunning={!!devServerUrl}
          devServerUrl={devServerUrl}
          hasErrors={iframeErrorCount > 0}
          errorCount={iframeErrorCount}
          isStreaming={isStreaming}
          planMode={planMode}
          teamMode={teamMode}
          viewMode={viewMode}
          sandboxReady={webcontainerReady}
          onErrorClick={() => {
            const errors = sandboxRef.current?.getIframeErrors() ?? []
            if (errors.length > 0) {
              toast.error(`最近错误：\n${errors[errors.length - 1].slice(0, 200)}`)
            } else {
              toast.info('没有已收集的错误')
            }
          }}
        />
      </div>
    </AssistantRuntimeProvider>
  )
}
