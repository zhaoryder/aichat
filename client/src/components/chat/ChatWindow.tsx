// =====================================================================
// 1v1 对话窗口（核心组件）
// ---------------------------------------------------------------------
// 功能：
//   - 消息气泡：用户靠右（金黄 bg-primary）、AI 靠左（白底 + AgentAvatar）
//   - SSE 流式接收：currentEvent 必须在 while 循环外部声明，
//     避免 chunk 边界切在 event/data 之间时丢失 token
//   - 流式光标（animate-pulse-cursor ▋）；等待首字时三个跳动圆点（animate-bounce-dot）
//   - 输入框自适应高度，Enter 发送 / Shift+Enter 换行
//   - 自动滚动到底部（用户手动上滑时不强制拉回，用 userScrolledUpRef）
//   - 空状态展示 agent.tagline 欢迎语
//   - 发新消息时 AbortController 取消旧流；组件卸载时清理
//   - 收藏 / 分享按钮：UI 就绪，后端 /api/favorite、/api/share 由 Task 25-27 实现
// =====================================================================

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiStream } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { AgentConfig } from '@shared/agents'
import type { Message } from '@shared/types'

/** 扩展 Message：流式输出标记 */
interface ChatMessage extends Message {
  isStreaming?: boolean
}

interface ChatWindowProps {
  agent: AgentConfig
  userId: string
  conversationId: string | null
  initialMessages: Message[]
}

/** 智能体头像：CSS 渐变背景 + 首字母（avatarGradient 是 CSS 字符串） */
function AgentAvatar({ agent, size = 'md' }: { agent: AgentConfig; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-xl',
  }[size]
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-bold text-white', sizeClass)}
      style={{ backgroundImage: agent.avatarGradient }}
    >
      {initial}
    </div>
  )
}

export function ChatWindow({
  agent,
  // userId 留作接口契约（后续举报等功能会用），此处不消费以避免无意义绑定
  conversationId: initialConversationId,
  initialMessages,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages.map((m) => ({ ...m })),
  )
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  // 收藏 / 分享 UI 反馈
  const [favorited, setFavorited] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /** 用户是否手动上滑（避免流式输出时强制拉回底部） */
  const userScrolledUpRef = useRef(false)
  /** 当前 SSE 请求的 AbortController，用于取消旧流 / 组件卸载时清理 */
  const abortControllerRef = useRef<AbortController | null>(null)
  /** conversationId 最新值，避免闭包陈旧（用于 start 事件回写 URL 判断） */
  const conversationIdRef = useRef(initialConversationId)

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    userScrolledUpRef.current = !nearBottom
  }, [])

  // 消息 / 加载状态变化时自动滚动（仅当用户未上滑）
  useEffect(() => {
    if (!userScrolledUpRef.current) scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

  // 首次挂载滚动到底部
  useEffect(() => {
    scrollToBottom()
  }, [scrollToBottom])

  // 组件卸载时取消进行中的流式请求
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // textarea 自适应高度（封顶 120px，超出则内部滚动）
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    setInput('')
    // 重置滚动标记，新消息发送后自动跟随
    userScrolledUpRef.current = false

    // 用户消息
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      conversation_id: conversationId ?? '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    // AI 占位消息（流式追加）
    const aiMsgId = crypto.randomUUID()
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      conversation_id: conversationId ?? '',
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
      isStreaming: true,
    }
    setMessages((prev) => [...prev, aiMsg])
    setIsLoading(true)

    // 取消上一个流（若有）
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await apiStream(
        '/chat',
        { conversationId, agentId: agent.id, message: text },
        { signal: controller.signal },
      )

      if (!response.body) {
        setMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // 关键：currentEvent 必须在 while 循环外部声明，
      // 否则 chunk 边界切在 event/data 之间时会丢失 token，导致"一直加载"
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
            let data: { conversationId?: string; c?: string; message?: string }
            try {
              data = JSON.parse(line.slice(6))
            } catch {
              continue
            }
            if (currentEvent === 'start' && data.conversationId) {
              setConversationId(data.conversationId)
              // 首次发送：后端创建了新对话，回写 URL cid 参数
              if (!conversationIdRef.current) {
                try {
                  const url = new URL(window.location.href)
                  url.searchParams.set('cid', data.conversationId)
                  window.history.replaceState(null, '', url.toString())
                } catch {
                  // URL 回写失败不影响主流程
                }
              }
            } else if (currentEvent === 'token' && data.c) {
              receivedAnyToken = true
              setMessages((prev) =>
                prev.map((m) => (m.id === aiMsgId ? { ...m, content: m.content + data.c } : m)),
              )
            } else if (currentEvent === 'done') {
              setMessages((prev) =>
                prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m)),
              )
            } else if (currentEvent === 'error') {
              // 静默处理：已收到 token 则保留并停止流式，否则移除占位
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

      // 流自然结束但未收到 done：确保停止流式
      setMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m)),
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 被新消息或卸载取消：保留已收到的 token，停止流式
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m)),
        )
        return
      }
      // 其他错误：静默移除占位（不显示错误，已收到的 token 会随占位移除）
      setMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
    } finally {
      setIsLoading(false)
      // 仅当仍是本次请求的 controller 时才清空，避免清掉新请求的 controller
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }, [agent.id, conversationId, input, isLoading])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    },
    [handleSend],
  )

  // 分享按钮（UI 就绪；/api/share 由后端 Task 25-27 实现）
  const handleShare = useCallback(() => {
    if (!conversationIdRef.current) return
    // TODO: 后端 /api/share 就绪后启用：
    //   const res = await apiFetch<{ slug: string; shareUrl?: string }>('/share', {
    //     method: 'POST', body: JSON.stringify({ conversationId }),
    //   })
    //   const url = res.shareUrl ?? `${window.location.origin}/share/${res.slug}`
    //   await navigator.clipboard.writeText(url)
    setShareCopied(true)
    window.setTimeout(() => setShareCopied(false), 2000)
  }, [])

  // 收藏按钮（UI 就绪；/api/favorite 由后端 Task 25-27 实现）
  const handleFavorite = useCallback(() => {
    // TODO: 后端 /api/favorite 就绪后启用：
    //   await apiFetch('/favorite', { method: 'POST', body: JSON.stringify({ agentId: agent.id }) })
    setFavorited((v) => !v)
  }, [agent.id])

  const canSend = input.trim().length > 0 && !isLoading

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-gray-50">
      {/* 顶部智能体信息栏 */}
      <header className="shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="inline-flex size-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-muted hover:text-gray-900"
            aria-label="返回首页"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <AgentAvatar agent={agent} size="md" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold text-gray-900">{agent.name}</h1>
            <p className="truncate text-xs text-gray-500">
              {agent.title} · {agent.era}
            </p>
          </div>

          {/* 收藏按钮 */}
          <button
            type="button"
            onClick={handleFavorite}
            aria-label={favorited ? '取消收藏' : '收藏智能体'}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-full transition-colors',
              favorited ? 'text-primary' : 'text-gray-400 hover:bg-muted hover:text-gray-700',
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" strokeLinejoin="round" />
            </svg>
          </button>

          {/* 分享按钮 */}
          <button
            type="button"
            onClick={handleShare}
            disabled={!conversationId}
            aria-label="分享对话"
            className="inline-flex size-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-muted hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" strokeLinecap="round" />
            </svg>
          </button>
          {shareCopied && (
            <span className="rounded-md bg-primary px-2 py-1 text-xs text-black shadow">已复制</span>
          )}

          {/* 在线状态徽章 */}
          <span className="hidden items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20 sm:inline-flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            在线
          </span>
        </div>
      </header>

      {/* 消息区 */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {messages.length === 0 && !isLoading ? (
            <EmptyState agent={agent} />
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} agent={agent} />)
          )}
        </div>
      </div>

      {/* 输入区 */}
      <footer className="shrink-0 border-t border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`和 ${agent.name} 说点什么…`}
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-input bg-white px-4 py-2.5 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ maxHeight: '120px' }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="发送消息"
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-black shadow-sm transition-transform duration-300 ease-out hover:scale-[1.02] hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">发送</span>
            </button>
          </div>
          <p className="mt-1.5 text-center text-xs text-gray-400">按 Enter 发送 · Shift + Enter 换行</p>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------

/** 空状态：展示 agent 欢迎语 */
function EmptyState({ agent }: { agent: AgentConfig }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-slide-up">
      <AgentAvatar agent={agent} size="lg" />
      <h2 className="mt-4 text-xl font-bold text-gray-900">{agent.name}</h2>
      <p className="mt-1 text-sm text-gray-500">
        {agent.title} · {agent.era}
      </p>
      <p className="mt-5 max-w-md rounded-2xl bg-white px-5 py-3 text-sm leading-relaxed text-gray-700 shadow-sm ring-1 ring-gray-100">
        &ldquo;{agent.tagline}&rdquo;
      </p>
      <p className="mt-6 text-xs text-gray-400">在下方输入框开始对话</p>
    </div>
  )
}

/** 单条消息气泡 */
function MessageBubble({ message, agent }: { message: ChatMessage; agent: AgentConfig }) {
  const isUser = message.role === 'user'
  const isStreaming = message.isStreaming === true
  // 流式输出中且尚无内容：显示三个跳动圆点（"正在输入…"）
  const showTypingDots = isStreaming && message.content === ''

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-1">
          <AgentAvatar agent={agent} size="sm" />
        </div>
      )}
      <div className={cn('flex max-w-[78%] flex-col', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-black'
              : 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-100',
          )}
        >
          {showTypingDots ? (
            <div className="flex items-center gap-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="animate-bounce-dot inline-block size-2 rounded-full bg-gray-400"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          ) : (
            <>
              {message.content}
              {isStreaming && <span className="animate-pulse-cursor ml-0.5">▋</span>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
