// =====================================================================
// Vibe Coding Agent：Agent 多轮对话 + UX 布局优化
// ---------------------------------------------------------------------
// 核心能力：
//   - Agent 多轮对话（Tool Calling，非流式 vibeChat）
//   - iframe 运行时错误自动捕获 + 自动修复（postMessage 通信）
//   - 三档布局：分屏 / 仅代码 / 仅预览
//   - 全屏模式（ESC 退出）+ 左侧面板可收起
//   - 响应式：手机 Tabs 切换 / 平板双栏 / 桌面三区
//   - 对话历史可视（用户可看到 agent 思考过程与代码变更）
//   - 保留：保存项目、历史项目列表、下载、复制
// =====================================================================
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Bot,
  ChevronLeft,
  Code,
  Columns2,
  Copy,
  Download,
  Eye,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react'
import {
  listVibeProjects,
  saveVibeProject,
  vibeChat,
  type VibeProject,
} from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui-legacy/Button'
import { Input } from '@/components/ui-legacy/Input'
import { Spinner } from '@/components/ui-legacy/Spinner'
import { EmptyState } from '@/components/ui-legacy/EmptyState'
import { Dialog } from '@/components/ui-legacy/Dialog'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ---------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------

type ViewMode = 'split' | 'code' | 'preview'
type AgentStatus = 'idle' | 'thinking' | 'previewing' | 'fixing'
type FullscreenTarget = 'code' | 'preview' | null

/** 对话消息（assistant 消息可携带 code 用于 API 上下文回传） */
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  code?: string
}

// ---------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------

const EXAMPLE_PROMPTS = [
  '一个带动画的登录表单',
  '贪吃蛇小游戏',
  '一个会下雪的圣诞主题页面',
  '带本地存储的待办事项 App',
]

const STATUS_TEXT: Record<Exclude<AgentStatus, 'idle'>, string> = {
  thinking: '正在思考...',
  previewing: '正在生成代码...',
  fixing: '检测到错误，自动修复中...',
}

/** 自动修复最大尝试次数，防止死循环 */
const MAX_FIX_ATTEMPTS = 3

/** iframe 错误捕获等待时间（毫秒） */
const IFRAME_ERROR_TIMEOUT = 2000

/** 注入 iframe 的错误捕获脚本 */
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

// ---------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------

/** 在 HTML 代码中注入错误捕获脚本（紧跟 <head> 或 <html> 之后） */
function buildIframeSrcDoc(code: string): string {
  if (/<head[^>]*>/i.test(code)) {
    return code.replace(/<head[^>]*>/i, (match) => match + ERROR_CAPTURE_SCRIPT)
  }
  if (/<html[^>]*>/i.test(code)) {
    return code.replace(/(<html[^>]*>)/i, `$1${ERROR_CAPTURE_SCRIPT}`)
  }
  return ERROR_CAPTURE_SCRIPT + code
}

/**
 * 将本地 ChatMessage[] 转换为 API 请求格式。
 * assistant 消息若携带 code，则把完整代码拼入 content，让 LLM 在多轮对话中保有上下文。
 */
function buildApiMessages(
  messages: ChatMessage[],
): Array<{ role: string; content: string }> {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.code) {
      return {
        role: m.role,
        content: `${m.content}\n\n[已生成代码 ${m.code.length} 字符]:\n\`\`\`html\n${m.code}\n\`\`\``,
      }
    }
    return { role: m.role, content: m.content }
  })
}

/**
 * 监听 iframe postMessage，等待运行时错误。
 * - 返回 error 字符串（有错误）或 null（超时无错误）
 */
function waitForIframeErrors(timeout: number = IFRAME_ERROR_TIMEOUT): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false

    const handler = (event: MessageEvent) => {
      if (settled) return
      const data = event.data
      if (
        data &&
        typeof data === 'object' &&
        data.type === 'vibe-error' &&
        typeof data.message === 'string'
      ) {
        settled = true
        window.removeEventListener('message', handler)
        clearTimeout(timer)
        resolve(data.message)
      }
    }

    window.addEventListener('message', handler)
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        window.removeEventListener('message', handler)
        resolve(null)
      }
    }, timeout)
  })
}

// ---------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------

/** 对话消息气泡 */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={cn('flex max-w-[80%] flex-col', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-black'
              : 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-100',
          )}
        >
          {message.content}
        </div>
        {message.code && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
            <Code className="h-3 w-3" />
            已生成代码 {message.code.length} 字符
          </span>
        )}
      </div>
      {isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600">
          <User className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  )
}

/** Agent 状态指示器（"正在输入…"样式） */
function AgentTypingIndicator({ status }: { status: Exclude<AgentStatus, 'idle'> }) {
  return (
    <div className="flex justify-start gap-2">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-gray-100">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
        <span className="text-sm text-gray-600">{STATUS_TEXT[status]}</span>
      </div>
    </div>
  )
}

/** 代码区域（复用于桌面布局和全屏模式） */
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
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-medium text-gray-500">代码</span>
        {streaming ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            生成中…
          </span>
        ) : hasCode ? (
          <span className="text-xs text-gray-400">{code.length} 字符</span>
        ) : null}
      </div>
      {hasCode ? (
        <pre
          ref={codeRef}
          className="flex-1 overflow-auto bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-800 scrollbar-thin"
        >
          <code>{code}</code>
          {streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-primary animate-pulse-cursor" />
          )}
        </pre>
      ) : (
        <EmptyState
          className="flex-1"
          title="描述需求开始生成"
          description="在左侧输入框描述你想要的页面或功能，AI 会生成可运行的 HTML 代码"
        />
      )}
    </div>
  )
}

/** 预览区域（复用于桌面布局和全屏模式） */
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
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-medium text-gray-500">预览</span>
        {hasCode && <span className="text-xs text-gray-400">iframe srcDoc</span>}
      </div>
      {hasCode ? (
        <iframe
          key={iframeKey}
          title="vibe-code-preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-modals"
          className="flex-1 w-full border-0 bg-white"
        />
      ) : (
        <EmptyState
          className="flex-1"
          title="预览区"
          description="生成代码后将在此处实时预览运行效果"
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

export const VibeCodePage = () => {
  const { user } = useAuth()

  // 对话与代码
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [code, setCode] = useState('')
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [error, setError] = useState('')
  const [lastPrompt, setLastPrompt] = useState('')

  // iframe 版本号（强制 remount，避免残留错误监听）
  const [iframeVersion, setIframeVersion] = useState(0)

  // 布局状态
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState<FullscreenTarget>(null)
  const [mobileTab, setMobileTab] = useState('chat')

  // 历史项目
  const [projects, setProjects] = useState<VibeProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)

  // 保存弹窗
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [savePublic, setSavePublic] = useState(false)
  const [saving, setSaving] = useState(false)

  // 修复弹窗
  const [fixOpen, setFixOpen] = useState(false)
  const [fixError, setFixError] = useState('')

  const codeRef = useRef<HTMLPreElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)

  const isBusy = agentStatus !== 'idle'
  const hasCode = code.length > 0
  const iframeSrcDoc = buildIframeSrcDoc(code)

  // ---- Effects ----

  // 代码变化时自动滚底
  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight
    }
  }, [code])

  // 对话变化时自动滚底
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight
    }
  }, [messages, agentStatus])

  // ESC 退出全屏
  useEffect(() => {
    if (!fullscreen) return
    const handleEscKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(null)
    }
    document.addEventListener('keydown', handleEscKey)
    return () => document.removeEventListener('keydown', handleEscKey)
  }, [fullscreen])

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

  // ---- Agent 对话核心流程 ----

  /**
   * 处理一轮 Agent 对话（可递归调用以自动修复）。
   * - 传入当前完整 messages（已包含本轮 user 消息）
   * - error 非空时表示是自动修复请求
   */
  const processRound = async (
    currentMessages: ChatMessage[],
    error?: string,
    fixCount = 0,
  ): Promise<void> => {
    const apiMessages = buildApiMessages(currentMessages)

    try {
      const res = await vibeChat(apiMessages, error)

      if (res.type === 'code') {
        // 更新代码区 + 重置 iframe
        setCode(res.code)
        setIframeVersion((v) => v + 1)
        setAgentStatus('previewing')

        // 等待 iframe 运行并捕获错误
        const iframeError = await waitForIframeErrors(IFRAME_ERROR_TIMEOUT)

        if (iframeError && fixCount < MAX_FIX_ATTEMPTS) {
          // 检测到错误 → 自动修复
          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: `检测到运行时错误：\n\`\`\`\n${iframeError.slice(0, 500)}\n\`\`\`\n\n正在自动修复（第 ${fixCount + 1} 次）...`,
            code: res.code,
          }
          const updatedMessages = [...currentMessages, assistantMsg]
          setMessages(updatedMessages)
          setAgentStatus('fixing')
          await processRound(updatedMessages, iframeError, fixCount + 1)
        } else if (iframeError) {
          // 超过最大修复次数
          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: `已尝试自动修复 ${MAX_FIX_ATTEMPTS} 次但仍有错误：\n\`\`\`\n${iframeError.slice(0, 500)}\n\`\`\`\n\n请手动描述问题并重试。`,
            code: res.code,
          }
          setMessages([...currentMessages, assistantMsg])
          setAgentStatus('idle')
        } else {
          // 无错误，成功完成
          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: res.explanation || '代码已生成，可以在右侧预览查看效果。',
            code: res.code,
          }
          setMessages([...currentMessages, assistantMsg])
          setAgentStatus('idle')
        }
      } else if (res.type === 'text') {
        // 纯文本回复
        const assistantMsg: ChatMessage = { role: 'assistant', content: res.content }
        setMessages([...currentMessages, assistantMsg])
        setAgentStatus('idle')
      } else {
        // type === 'done'
        setAgentStatus('idle')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Agent 对话失败')
      setAgentStatus('idle')
    }
  }

  // 发送消息
  const handleSend = async (promptText?: string) => {
    const text = (promptText ?? input).trim()
    if (!text || isBusy) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLastPrompt(text)
    setError('')
    setAgentStatus('thinking')

    await processRound(updatedMessages)
  }

  // Enter 发送 / Shift+Enter 换行
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  // ---- 工具栏操作 ----

  const handleReset = useCallback(() => {
    setMessages([])
    setCode('')
    setError('')
    setInput('')
    setLastPrompt('')
    setAgentStatus('idle')
    setIframeVersion((v) => v + 1)
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

  // 手动修复：追加 user 消息后走正常对话流程
  const handleFix = async () => {
    const errDesc = fixError.trim() || '运行时错误，请检查并修复代码中的问题'
    setFixOpen(false)
    setFixError('')

    const userMsg: ChatMessage = {
      role: 'user',
      content: `请修复以下问题：\n${errDesc}`,
    }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setAgentStatus('thinking')

    await processRound(updatedMessages)
  }

  // 加载历史项目：设置代码 + 初始化对话上下文
  const handleLoadProject = useCallback((project: VibeProject) => {
    setCode(project.code)
    setLastPrompt(project.prompt)
    setError('')
    setIframeVersion((v) => v + 1)
    setMessages([
      {
        role: 'assistant',
        content: `已加载项目「${project.title}」。代码已显示在右侧，你可以在下方描述需要修改的内容。`,
        code: project.code,
      },
    ])
    setMobileTab('preview')
  }, [])

  // ---- 视图模式按钮配置 ----
  const viewModeButtons: Array<{ mode: ViewMode; icon: ReactNode; label: string }> = [
    { mode: 'split', icon: <Columns2 className="h-4 w-4" />, label: '分屏' },
    { mode: 'code', icon: <Code className="h-4 w-4" />, label: '代码' },
    { mode: 'preview', icon: <Eye className="h-4 w-4" />, label: '预览' },
  ]

  // ---- 渲染：左侧面板（输入 + 对话 + 项目） ----
  const renderLeftPanel = () => (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* 输入区 */}
      <div className="shrink-0 border-b border-gray-100 p-3">
        <label className="mb-1.5 block text-xs font-medium text-gray-600">
          描述你的需求
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="例如：做一个带动画的登录表单，提交时验证非空..."
          disabled={isBusy}
          rows={3}
          className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        />
        {/* 示例提示 */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setInput(ex)}
              disabled={isBusy}
              className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
        {/* 发送按钮 */}
        <div className="mt-2.5 flex gap-2">
          <Button
            className="flex-1 transition-transform duration-300 ease-out hover:scale-[1.02]"
            onClick={() => handleSend()}
            disabled={!input.trim() || isBusy}
          >
            <Send className="h-4 w-4" />
            {isBusy ? '处理中...' : '发送'}
          </Button>
        </div>
      </div>

      {/* 对话历史 */}
      <div
        ref={conversationRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin"
      >
        {messages.length === 0 && !isBusy ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot className="mb-2 h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-400">
              描述需求开始对话
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Agent 会记住上下文，支持多轮修改
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
            {isBusy && <AgentTypingIndicator status={agentStatus} />}
          </>
        )}
      </div>

      {/* 历史项目 */}
      <div className="shrink-0 border-t border-gray-100 p-3 max-h-48 overflow-y-auto scrollbar-thin">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-600">我的项目</h3>
          {projects.length > 0 && (
            <span className="text-xs text-gray-400">{projects.length}</span>
          )}
        </div>
        {!user ? (
          <p className="py-2 text-center text-xs text-gray-400">
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
          <p className="py-2 text-center text-xs text-gray-400">
            还没有项目，生成后点击「保存」
          </p>
        ) : (
          <div className="space-y-1.5">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => handleLoadProject(p)}
                className="block w-full rounded-lg border border-gray-100 px-2.5 py-1.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <p className="truncate text-sm font-medium text-gray-800">{p.title}</p>
                {p.prompt && (
                  <p className="mt-0.5 truncate text-xs text-gray-400">{p.prompt}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ---- 渲染：右侧主区（代码 + 预览） ----
  const renderRightPanel = () => {
    if (viewMode === 'code') {
      return (
        <div className="h-full p-2">
          <CodeArea code={code} streaming={isBusy} codeRef={codeRef} />
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
        <CodeArea code={code} streaming={isBusy} codeRef={codeRef} />
        <PreviewArea
          srcDoc={iframeSrcDoc}
          iframeKey={iframeVersion}
          hasCode={hasCode}
        />
      </div>
    )
  }

  // ---- 渲染：工具栏 ----
  const renderToolbar = () => (
    <div className="flex items-center gap-2">
      {/* 视图模式切换（桌面） */}
      <div className="hidden md:flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 bg-gray-50">
        {viewModeButtons.map((btn) => (
          <button
            key={btn.mode}
            type="button"
            onClick={() => setViewMode(btn.mode)}
            title={btn.label}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              viewMode === btn.mode
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
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
        className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <Maximize2 className="h-4 w-4" />
      </button>

      {/* 收起/展开左侧（桌面） */}
      <button
        type="button"
        onClick={() => setLeftCollapsed((v) => !v)}
        title={leftCollapsed ? '展开左侧' : '收起左侧'}
        className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
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
          <Button size="sm" variant="outline" onClick={handleCopy} disabled={isBusy}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={isBusy}>
            <Download className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* 修复 / 重置 */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFixOpen(true)}
            disabled={isBusy}
          >
            <Wrench className="h-4 w-4" />
            <span className="hidden sm:inline">修复</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset} disabled={isBusy}>
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
            disabled={isBusy}
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">保存</span>
          </Button>
        </>
      )}
    </div>
  )

  // ---- 主渲染 ----
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-gray-50">
      {/* 顶部工具栏 */}
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          {/* 左侧：返回 + 标题 */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/studio"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              title="返回创意工坊"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-gray-900">Vibe 编程</h1>
              <p className="hidden sm:block text-xs text-gray-500">
                自然语言 → 可运行代码，Agent 多轮对话
              </p>
            </div>
          </div>

          {/* 右侧：工具栏 */}
          {renderToolbar()}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="border-t border-red-100 bg-red-50 px-4 py-1.5 text-xs text-red-600">
            {error}
          </div>
        )}
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
              <CodeArea code={code} streaming={isBusy} codeRef={codeRef} />
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
          {/* 左侧面板（可收起） */}
          {!leftCollapsed && (
            <aside className="w-[320px] lg:w-[360px] shrink-0 border-r border-gray-200 overflow-hidden">
              {renderLeftPanel()}
            </aside>
          )}

          {/* 右侧主区 */}
          <main className="flex-1 overflow-hidden">{renderRightPanel()}</main>
        </div>
      </div>

      {/* 全屏覆盖：代码 */}
      {fullscreen === 'code' && (
        <div className="fixed inset-0 z-50 bg-white">
          <button
            type="button"
            onClick={() => setFullscreen(null)}
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md bg-white shadow-md ring-1 ring-gray-200 transition-colors hover:bg-gray-50"
            title="退出全屏 (ESC)"
          >
            <Minimize2 className="h-4 w-4 text-gray-600" />
          </button>
          <div className="h-full p-2">
            <CodeArea code={code} streaming={isBusy} codeRef={codeRef} />
          </div>
        </div>
      )}

      {/* 全屏覆盖：预览 */}
      {fullscreen === 'preview' && (
        <div className="fixed inset-0 z-50 bg-white">
          <button
            type="button"
            onClick={() => setFullscreen(null)}
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md bg-white shadow-md ring-1 ring-gray-200 transition-colors hover:bg-gray-50"
            title="退出全屏 (ESC)"
          >
            <Minimize2 className="h-4 w-4 text-gray-600" />
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
        onClose={() => setSaveOpen(false)}
        title="保存项目"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              标题
            </label>
            <Input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="给项目起个名字"
              autoFocus
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={savePublic}
              onChange={(e) => setSavePublic(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            公开到广场（其他人可见）
          </label>
          <div className="flex justify-end gap-2 pt-2">
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
          </div>
        </div>
      </Dialog>

      {/* 修复弹窗 */}
      <Dialog
        open={fixOpen}
        onClose={() => setFixOpen(false)}
        title="修复代码错误"
        className="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            描述运行时遇到的错误，Agent 会基于当前对话上下文修复代码。
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              错误信息（可选）
            </label>
            <textarea
              value={fixError}
              onChange={(e) => setFixError(e.target.value)}
              placeholder="例如：点击按钮没反应，控制台报错 xxx is not defined"
              rows={4}
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setFixOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleFix} disabled={isBusy}>
              提交修复
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
