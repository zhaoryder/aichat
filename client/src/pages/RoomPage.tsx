// =====================================================================
// 联机共聊房间页（路由 /rooms/:id）
// ---------------------------------------------------------------------
// 三栏布局（响应式：移动端单列、桌面端三列）
//   左侧（25%）：参与者列表（房主皇冠、当前用户标记、踢人按钮）
//   中间（50%）：消息流 + 输入框（SSE 流式 AI 回复）
//   右侧（25%）：网页工程同步预览（简化版：空状态占位）
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Crown,
  LogOut,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, apiStream } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useRoomRealtime } from '@/hooks/useRoomRealtime'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { AgentConfig } from '@shared/agents'
import type { ChatRoom, RoomParticipant } from '@shared/types'

// 相对时间
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)}分钟前`
  if (diff < day) return `${Math.floor(diff / hour)}小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`
  return new Date(then).toISOString().slice(0, 10)
}

/** 智能体头像：CSS 渐变背景 + 首字母 */
function AgentAvatar({
  agent,
  size = 'md',
}: {
  agent: AgentConfig
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-xl',
  }[size]
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        sizeClass,
      )}
      style={{ backgroundImage: agent.avatarGradient }}
    >
      {initial}
    </div>
  )
}

/** 用户头像占位（无 profile 时的兜底） */
function UserAvatar({
  userId,
  size = 'sm',
}: {
  userId: string
  size?: 'sm' | 'md'
}) {
  const sizeClass = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm' }[size]
  const initial = userId.charAt(0).toUpperCase() || '?'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gray-400 font-bold text-white',
        sizeClass,
      )}
    >
      {initial}
    </div>
  )
}

export const RoomPage = () => {
  const { id: roomId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const { messages, loading, setMessages } = useRoomRealtime(roomId)

  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [roomLoading, setRoomLoading] = useState(true)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  /** 当前流式 AI 消息的临时 id（用于追踪流式光标） */
  const [streamingId, setStreamingId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  // 拉取房间详情（参与者）
  useEffect(() => {
    if (!roomId) {
      setRoomLoading(false)
      return
    }
    let active = true
    setRoomLoading(true)
    apiFetch<{
      room: ChatRoom
      participants: RoomParticipant[]
    }>(`/rooms/${roomId}`)
      .then((res) => {
        if (!active) return
        setRoom(res.room)
        setParticipants(res.participants ?? [])
      })
      .catch(() => {
        if (!active) return
        setRoom(null)
      })
      .finally(() => {
        if (active) setRoomLoading(false)
      })
    return () => {
      active = false
    }
  }, [roomId])

  // 拉取智能体配置
  useEffect(() => {
    if (!room?.agent_id) return
    let active = true
    apiFetch<{ agent: AgentConfig }>(`/agents/${room.agent_id}`)
      .then((res) => {
        if (active) setAgent(res.agent)
      })
      .catch(() => {
        // 拉取失败不影响主流程
      })
    return () => {
      active = false
    }
  }, [room?.agent_id])

  // 卸载时取消进行中的流式请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    userScrolledUpRef.current = !nearBottom
  }, [])

  // 消息变化时自动滚动（用户未上滑）
  useEffect(() => {
    if (!userScrolledUpRef.current) scrollToBottom()
  }, [messages, scrollToBottom])

  // -------------------------------------------------------------------
  // 发送消息（SSE 流式接收 AI 回复）
  // -------------------------------------------------------------------
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || !roomId || !user || sending) return

    userScrolledUpRef.current = false
    setSending(true)

    // 添加本地乐观用户消息
    const localUserMsgId = `__local_user_${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: localUserMsgId,
        room_id: roomId,
        user_id: user.id,
        role: 'user' as const,
        content: text,
        agent_id: null,
        created_at: new Date().toISOString(),
      },
    ])

    // 添加 AI 流式占位消息
    const streamMsgId = `__stream_${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: streamMsgId,
        room_id: roomId,
        user_id: null,
        role: 'assistant' as const,
        content: '',
        agent_id: room?.agent_id ?? null,
        created_at: new Date().toISOString(),
      },
    ])
    setStreamingId(streamMsgId)
    setInput('')

    // 取消上一个流（若有）
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await apiStream(
        `/rooms/${roomId}/messages`,
        { content: text },
        { signal: controller.signal },
      )
      if (!res.body) {
        setStreamingId(null)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // currentEvent 必须在循环外声明，避免 chunk 边界切在 event/data 之间丢失 token
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
            let data: { c?: string; message?: string }
            try {
              data = JSON.parse(line.slice(6))
            } catch {
              continue
            }
            if (currentEvent === 'token' && data.c) {
              receivedAnyToken = true
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgId
                    ? { ...m, content: m.content + data.c }
                    : m,
                ),
              )
            } else if (currentEvent === 'done') {
              // 流结束：Realtime 会推送真实 AI 消息替换占位
              // 若 Realtime 延迟，保留占位内容并停止流式光标
              setStreamingId(null)
            } else if (currentEvent === 'error') {
              setStreamingId(null)
              if (!receivedAnyToken) {
                // 未收到任何 token：移除占位
                setMessages((prev) =>
                  prev.filter((m) => m.id !== streamMsgId),
                )
              }
              toast.error(data.message || 'AI 回复失败')
            }
          }
        }
      }

      // 流自然结束但未收到 done：确保停止流式光标
      setStreamingId((prev) => (prev === streamMsgId ? null : prev))
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 被取消：保留已收到的 token
        setStreamingId(null)
      } else {
        setStreamingId(null)
        // 移除空占位
        setMessages((prev) =>
          prev.filter(
            (m) =>
              m.id !== streamMsgId || m.content.length > 0,
          ),
        )
        toast.error(err instanceof Error ? err.message : '发送失败')
      }
    } finally {
      setSending(false)
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [input, roomId, user, sending, room?.agent_id, setMessages])

  // 离开房间
  const handleLeave = useCallback(async () => {
    if (!roomId || !user) return
    try {
      await apiFetch(`/rooms/${roomId}/leave`, { method: 'POST' })
      toast.success('已离开房间')
      navigate('/rooms')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '离开房间失败')
    }
  }, [roomId, user, navigate])

  // 关闭房间（房主）
  const handleCloseRoom = useCallback(async () => {
    if (!roomId) return
    if (!confirm('确定要关闭房间吗？关闭后无法恢复。')) return
    try {
      await apiFetch(`/rooms/${roomId}`, { method: 'DELETE' })
      toast.success('房间已关闭')
      navigate('/rooms')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '关闭房间失败')
    }
  }, [roomId, navigate])

  // 踢人（房主）
  const handleKick = useCallback(
    async (targetUserId: string) => {
      if (!roomId) return
      try {
        await apiFetch(`/rooms/${roomId}/kick/${targetUserId}`, {
          method: 'POST',
        })
        setParticipants((prev) =>
          prev.filter((p) => p.user_id !== targetUserId),
        )
        toast.success('已踢出该用户')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '踢人失败')
      }
    },
    [roomId],
  )

  // 加载中
  if (roomLoading) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  // 房间不存在
  if (!room) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-3 text-center">
        <p className="text-base text-gray-700">房间不存在或已关闭</p>
        <Button asChild variant="outline">
          <Link to="/rooms">返回房间列表</Link>
        </Button>
      </div>
    )
  }

  const isHost = user?.id === room.host_id
  const roomClosed = room.status === 'closed'

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-gray-50 lg:flex-row">
      {/* 左侧：参与者列表 */}
      <aside className="shrink-0 border-b border-gray-200 bg-white lg:w-1/4 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Users className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">
            参与者 ({participants.length})
          </h2>
        </div>
        <div className="max-h-48 overflow-y-auto p-2 scrollbar-thin lg:max-h-[calc(100dvh-12rem)]">
          {participants.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">
              暂无其他参与者
            </p>
          ) : (
            <ul className="space-y-1">
              {participants.map((p) => {
                const isParticipantHost = p.user_id === room.host_id
                const isSelf = p.user_id === user?.id
                return (
                  <li
                    key={p.user_id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
                  >
                    <UserAvatar userId={p.user_id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {isSelf ? '你' : p.user_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatRelativeTime(p.joined_at)}
                      </p>
                    </div>
                    {isParticipantHost && (
                      <Crown className="h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    {isHost && !isParticipantHost && !isSelf && (
                      <button
                        type="button"
                        onClick={() => handleKick(p.user_id)}
                        className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        title="踢出"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* 中间：消息流 + 输入框 */}
      <main className="flex min-h-0 flex-1 flex-col lg:w-1/2">
        {/* 顶部房间信息 */}
        <header className="shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link
              to="/rooms"
              className="inline-flex size-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-muted hover:text-gray-900"
              aria-label="返回房间列表"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M15 18l-6-6 6-6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            {agent && <AgentAvatar agent={agent} size="sm" />}
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-bold text-gray-900">{room.name}</h1>
              <p className="truncate text-xs text-gray-500">
                {agent?.name ?? '智能体'} · {participants.length} 人在线
              </p>
            </div>
            {roomClosed && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                已关闭
              </span>
            )}
            {!roomClosed && isHost && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseRoom}
                className="gap-1 text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">关闭房间</span>
              </Button>
            )}
            {!roomClosed && !isHost && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLeave}
                className="gap-1 text-gray-500 hover:bg-muted"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">离开</span>
              </Button>
            )}
          </div>
        </header>

        {/* 消息流 */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto scrollbar-thin"
        >
          <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner size="md" />
              </div>
            ) : messages.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                还没有消息，来打个招呼吧！
              </div>
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  agent={agent}
                  isStreaming={m.id === streamingId}
                  currentUserId={user?.id ?? null}
                />
              ))
            )}
          </div>
        </div>

        {/* 输入区 */}
        {!roomClosed && (
          <footer className="shrink-0 border-t border-gray-200 bg-white/90 backdrop-blur">
            <div className="mx-auto max-w-2xl px-4 py-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    user ? '说点什么，回车发送…' : '登录后即可参与聊天'
                  }
                  rows={1}
                  disabled={!user || sending}
                  className="flex-1"
                  style={{ maxHeight: '120px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={!user || !input.trim() || sending}
                  className="shrink-0 transition-transform duration-300 ease-out hover:scale-[1.02]"
                >
                  {sending ? (
                    <Spinner size="sm" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline ml-1">发送</span>
                </Button>
              </div>
              <p className="mt-1 text-center text-xs text-gray-400">
                按 Enter 发送 · Shift + Enter 换行
              </p>
            </div>
          </footer>
        )}

        {roomClosed && (
          <footer className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-4 text-center">
            <p className="text-sm text-gray-500">房间已关闭，无法发送消息</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/rooms">返回房间列表</Link>
            </Button>
          </footer>
        )}
      </main>

      {/* 右侧：网页工程同步预览（简化版空状态） */}
      <aside className="hidden w-1/4 shrink-0 border-l border-gray-200 bg-white lg:block">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" strokeLinecap="round" />
          </svg>
          <h2 className="text-sm font-semibold text-gray-900">共享预览</h2>
        </div>
        <div className="flex h-[calc(100%-3rem)] items-center justify-center p-4">
          <EmptyState
            title="等待房主共享作品"
            description="房主共享的网页工程将在这里实时显示"
          />
        </div>
      </aside>
    </div>
  )
}

// =====================================================================
// 消息气泡
// =====================================================================

interface MessageBubbleProps {
  message: import('@shared/types').RoomMessage
  agent: AgentConfig | null
  isStreaming: boolean
  currentUserId: string | null
}

function MessageBubble({
  message,
  agent,
  isStreaming,
  currentUserId,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const showTypingDots = isStreaming && message.content === ''

  // 当前用户发的消息也靠右
  const isSelf = isUser && message.user_id === currentUserId

  return (
    <div
      className={cn(
        'flex gap-2 animate-slide-up-fade',
        isSelf ? 'justify-end' : 'justify-start',
      )}
    >
      {/* AI 消息头像 */}
      {!isUser && (
        <div className="mt-1 shrink-0">
          {agent ? (
            <AgentAvatar agent={agent} size="sm" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">
              ?
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          'flex max-w-[78%] flex-col',
          isSelf ? 'items-end' : 'items-start',
        )}
      >
        {!isUser && (
          <span className="mb-0.5 px-1 text-xs font-medium text-gray-500">
            {agent?.name ?? 'AI'}
            {isStreaming && (
              <span className="ml-1 text-primary">正在打字…</span>
            )}
          </span>
        )}
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isSelf
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
              {isStreaming && (
                <span className="animate-pulse-cursor ml-0.5">▋</span>
              )}
            </>
          )}
        </div>
        <span className="mt-0.5 px-1 text-xs text-gray-400">
          {formatRelativeTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}
