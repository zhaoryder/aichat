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
  Terminal,
  ExternalLink,
  Share2,
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
  type VibeProject,
  type SnapshotDiff,
} from '@/lib/api'
import type { ProjectSnapshot } from '@shared/types'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
}

const EXAMPLE_PROMPTS = [
  '一个带动画的登录表单',
  '贪吃蛇小游戏',
  '一个会下雪的圣诞主题页面',
  '带本地存储的待办事项 App',
]

const VIEW_MODE_KEY = 'vibe-code-view-mode'

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
          <Terminal className="h-3.5 w-3.5" />
          执行代码...
          <Loader2 className="h-3 w-3 animate-spin" />
        </div>
      )
    }
    const r = result as { success: boolean; result?: string; error?: string }
    return (
      <div className="my-2 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-indigo-700 dark:text-indigo-300">
          <Terminal className="h-3 w-3" />
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
}: {
  srcDoc: string
  iframeKey: number
  hasCode: boolean
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-3 py-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">预览</span>
        {hasCode && <span className="text-xs text-gray-400 dark:text-gray-500">iframe srcDoc</span>}
      </div>
      {hasCode ? (
        <iframe
          key={iframeKey}
          title="vibe-code-preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-modals"
          className="flex-1 w-full border-0 bg-white dark:bg-gray-900"
        />
      ) : (
        <EmptyState
          className="flex-1"
          title="预览区"
          description="AI 通过 writeFile 工具写入代码后将在此处实时预览"
        />
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
function AssistantMessage() {
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
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex max-w-[80%] flex-col items-start">
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
                Text: ({ text }) => (text ? <span className="whitespace-pre-wrap">{text}</span> : null),
              }}
            />
          )}
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

/** 输入框（底部） */
function VibeComposer({
  disabled,
}: {
  disabled: boolean
}) {
  const [value, setValue] = useState('')

  return (
    <ComposerPrimitive.Root className="flex flex-col gap-2 border-t border-gray-100 dark:border-gray-800 p-3">
      <ComposerPrimitive.Input
        asChild
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            const el = e.currentTarget as unknown as HTMLButtonElement & { form?: HTMLFormElement }
            el.form?.requestSubmit()
          }
        }}
      >
        <textarea
          placeholder="描述你想要的页面或功能，AI 会自动调用工具生成代码..."
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
              onClick={() => setValue(ex)}
              disabled={disabled}
              className="rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
        <ComposerPrimitive.Send asChild>
          <Button
            type="submit"
            disabled={disabled || !value.trim()}
            className="gap-1.5 transition-transform duration-300 ease-out hover:scale-[1.02]"
          >
            发送
          </Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  )
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

import { AICollaboratorPicker } from '@/components/AICollaboratorPicker'

export const VibeCodePage = () => {
  const [aiCollaborator, setAiCollaborator] = useState<string | null>(null)
  const { user } = useAuth()

  // ----- 消息状态 + 流式状态（手动管理，对接 POST /api/vibe-code/stream） -----
  const [messages, setMessages] = useState<VibeMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // ----- 从 messages 中提取最新代码（writeFile 工具调用的 args.content） -----
  const code = useMemo(() => extractLatestCode(messages), [messages])
  const isStreaming = isLoading

  // iframe 版本号（每次 code 变化时强制 remount，避免残留错误监听）
  const [iframeVersion, setIframeVersion] = useState(0)
  useEffect(() => {
    if (code) setIframeVersion((v) => v + 1)
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

  const hasCode = code.length > 0
  const iframeSrcDoc = buildIframeSrcDoc(code)

  // ----- Effects -----

  // 组件卸载时取消进行中的流式请求
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
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

  // ----- SSE 流式发送（对接 POST /api/vibe-code/stream） -----
  const handleSendByText = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      // 构造发送给后端的 messages（包含历史 + 本次 user 消息）
      const userMsg: VibeMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
      }
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
          setMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
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
                  prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m)),
                )
              } else if (currentEvent === 'error') {
                if (!receivedAnyToken) {
                  setMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
                } else {
                  setMessages((prev) =>
                    prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m)),
                  )
                }
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
        setMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
        toast.error(err instanceof Error ? err.message : '发送失败')
      } finally {
        setIsLoading(false)
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    },
    [isLoading],
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

  // ----- 渲染：左侧面板（assistant-ui Thread + 历史项目） -----
  const renderLeftPanel = () => (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* Thread：消息区 + Composer（输入框在底部） */}
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                return <AssistantMessage />
              }}
            </ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>

        {/* Composer（输入框在底部，spec §6.3） */}
        <VibeComposer disabled={isStreaming} />
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
        />
      </div>
    )
  }

  // ----- 渲染：工具栏 -----
  const renderToolbar = () => (
    <div className="flex items-center gap-2">
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

      <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        {/* AI 协作者选择器 */}
        <div className="shrink-0 border-b border-gray-200 bg-white/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/80">
          <AICollaboratorPicker specialty="vibe-code" value={aiCollaborator} onChange={setAiCollaborator} />
        </div>
        {/* 顶部工具栏 */}
        <header className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
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
            onValueChange={setMobileTab}
            className="md:hidden flex h-full flex-col"
          >
            <TabsList className="grid grid-cols-3 mx-2 mt-2 shrink-0">
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
            </TabsList>
            <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
              {renderLeftPanel()}
            </TabsContent>
            <TabsContent value="code" className="flex-1 overflow-hidden mt-0">
              <div className="h-full p-2">
                <CodeArea code={code} streaming={isStreaming} codeRef={codeRef} />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
              <div className="h-full p-2">
                <PreviewArea
                  srcDoc={iframeSrcDoc}
                  iframeKey={iframeVersion}
                  hasCode={hasCode}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* 平板/桌面：分栏布局 */}
          <div className="hidden md:flex h-full overflow-hidden">
            {!leftCollapsed && (
              <aside className="w-[320px] lg:w-[360px] shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                {renderLeftPanel()}
              </aside>
            )}
            <main className="flex-1 overflow-hidden">{renderRightPanel()}</main>
          </div>
        </div>

        {/* 全屏覆盖：代码 */}
        {fullscreen === 'code' && (
          <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950">
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
          <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950">
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
      </div>
    </AssistantRuntimeProvider>
  )
}
