// 论坛话题详情页：话题头部 + 帖子列表 + 回帖 + 流式 AI + Realtime
// ---------------------------------------------------------------------
// - 通过 Supabase Realtime 订阅 forum_posts INSERT，自动接收新帖（含 AI 生成完毕后落库的帖）
// - 回帖用 apiStream('/forum/reply-stream') 解析 SSE：
//     agent_start → 追加流式占位帖；token → 累加内容；agent_done → 标记完成
// - 流式占位帖落库后由 Realtime 推送真实帖，按 _streamKey 匹配替换占位（去重）
// - 用户输入框始终可用，不被 AI 生成阻塞
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch, apiStream } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { AgentConfig } from '../../../shared/agents'
import type { ForumPost, ForumTopic } from '../../../shared/types'

// 帖子类型：在 ForumPost 基础上扩展流式标记
type TopicPost = ForumPost & {
  isStreaming?: boolean
  /** 流式占位帖的匹配键（agentId），用于落库后替换为真实帖 */
  _streamKey?: string
  /** 本地乐观帖标记，Realtime 回填时替换 */
  _local?: boolean
}

type LoadStatus = 'loading' | 'ok' | 'error'

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

export const ForumTopicPage = () => {
  const { id: topicId } = useParams<{ id: string }>()
  const { user } = useAuth()

  const [topic, setTopic] = useState<ForumTopic | null>(null)
  const [posts, setPosts] = useState<TopicPost[]>([])
  const [agentsMap, setAgentsMap] = useState<Map<string, AgentConfig>>(new Map())
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const [replyInput, setReplyInput] = useState('')
  const [replyAgentIds, setReplyAgentIds] = useState<string[]>([])
  const [replying, setReplying] = useState(false)
  const [replyError, setReplyError] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  /** 用户是否手动上滑（流式输出时不强制拉回底部） */
  const userScrolledUpRef = useRef(false)
  /** 当前回帖的 AbortController，用于卸载时取消 */
  const abortRef = useRef<AbortController | null>(null)

  // 拉取话题 + 帖子
  useEffect(() => {
    if (!topicId) {
      setStatus('error')
      setErrorMsg('缺少话题 ID')
      return
    }
    let active = true
    setStatus('loading')
    apiFetch<{ topic: ForumTopic; posts: ForumPost[] }>(
      `/forum/topic/${topicId}`,
    )
      .then((res) => {
        if (!active) return
        setTopic(res.topic)
        setPosts(res.posts ?? [])
        setStatus('ok')
        // 默认召唤话题提及的智能体
        setReplyAgentIds(res.topic.mentioned_agents ?? [])
      })
      .catch((err: Error) => {
        if (!active) return
        setErrorMsg(err.message || '话题加载失败')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [topicId])

  // 拉取智能体列表构建查找表（用于 AI 帖头像/名字）
  useEffect(() => {
    let active = true
    apiFetch<{ agents: AgentConfig[] }>('/agents?filter=all')
      .then((res) => {
        if (!active) return
        setAgentsMap(new Map(res.agents.map((a) => [a.id, a])))
      })
      .catch(() => {
        // 失败则 AI 帖用兜底头像
      })
    return () => {
      active = false
    }
  }, [])

  // Supabase Realtime 订阅 forum_posts INSERT
  useEffect(() => {
    if (!topicId) return
    const channel = supabase
      .channel(`topic-${topicId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'forum_posts',
          filter: `topic_id=eq.${topicId}`,
        },
        (payload) => {
          const newPost = payload.new as ForumPost
          setPosts((prev) => {
            // 去重：已存在同 id
            if (prev.some((p) => p.id === newPost.id)) return prev
            // AI 帖：替换对应流式占位（按 _streamKey 匹配 agent_id）
            if (newPost.agent_id) {
              const idx = prev.findIndex(
                (p) => p._streamKey === newPost.agent_id,
              )
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = newPost as TopicPost
                return next
              }
            } else if (newPost.author_type === 'user') {
              // 用户帖：若有本地乐观帖（同内容同作者），替换之
              const idx = prev.findIndex(
                (p) =>
                  p._local &&
                  p.content === newPost.content &&
                  p.author_id === newPost.author_id,
              )
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = newPost as TopicPost
                return next
              }
            }
            return [...prev, newPost as TopicPost]
          })
        },
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [topicId])

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

  // 帖子变化时自动滚动（用户未上滑）
  useEffect(() => {
    if (!userScrolledUpRef.current) scrollToBottom()
  }, [posts, scrollToBottom])

  // 话题内容已作为首条 user 帖落库，头部已展示，列表跳过该首帖避免重复
  const initialPostId = useMemo(() => {
    if (!topic) return undefined
    const found = posts.find(
      (p) => p.author_type === 'user' && p.content === topic.content,
    )
    return found?.id
  }, [posts, topic])

  const displayPosts = useMemo(
    () => (initialPostId ? posts.filter((p) => p.id !== initialPostId) : posts),
    [posts, initialPostId],
  )

  const toggleReplyAgent = (id: string) => {
    setReplyAgentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    )
  }

  const handleReply = useCallback(async () => {
    const text = replyInput.trim()
    if (!text || !topicId || replying) return

    setReplyError('')
    userScrolledUpRef.current = false

    // 乐观追加用户回帖（Realtime 回填时替换）
    const optimistic: TopicPost = {
      id: `__local_${Date.now()}`,
      topic_id: topicId,
      author_id: user?.id ?? '',
      author_type: 'user',
      agent_id: null,
      content: text,
      created_at: new Date().toISOString(),
      _local: true,
    }
    setPosts((prev) => [...prev, optimistic])
    setReplyInput('')
    setReplying(true)

    // 取消上一个流（若有）
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await apiStream(
        '/forum/reply-stream',
        { topicId, content: text, agentIds: replyAgentIds },
        { signal: controller.signal },
      )
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''
      // 跟踪当前回合每个 agent 的流式占位（用于 token 累加定位）
      // key: agentId → 该 agent 最新占位在 posts 中的临时 id
      const streamPlaceholders = new Map<string, string>()

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
              agentId?: string
              c?: string
              message?: string
              userPostId?: string
            }
            try {
              data = JSON.parse(line.slice(6))
            } catch {
              continue
            }
            if (currentEvent === 'agent_start' && data.agentId) {
              // 追加流式占位帖
              const placeholderId = `__stream_${data.agentId}_${Date.now()}`
              streamPlaceholders.set(data.agentId, placeholderId)
              setPosts((prev) => [
                ...prev,
                {
                  id: placeholderId,
                  topic_id: topicId,
                  author_id: '',
                  author_type: 'agent',
                  agent_id: data.agentId as string,
                  content: '',
                  created_at: new Date().toISOString(),
                  isStreaming: true,
                  _streamKey: data.agentId,
                },
              ])
            } else if (currentEvent === 'token' && data.c && data.agentId) {
              const targetId = streamPlaceholders.get(data.agentId)
              if (targetId) {
                setPosts((prev) =>
                  prev.map((p) =>
                    p.id === targetId
                      ? { ...p, content: p.content + data.c }
                      : p,
                  ),
                )
              }
            } else if (currentEvent === 'agent_done' && data.agentId) {
              const targetId = streamPlaceholders.get(data.agentId)
              if (targetId) {
                setPosts((prev) =>
                  prev.map((p) =>
                    p.id === targetId ? { ...p, isStreaming: false } : p,
                  ),
                )
              }
            } else if (currentEvent === 'error') {
              setReplyError(data.message || 'AI 生成失败')
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 卸载或重发取消：保留已收到的 token，停止占位
        setPosts((prev) =>
          prev.map((p) =>
            p.isStreaming ? { ...p, isStreaming: false } : p,
          ),
        )
      } else {
        setReplyError(err instanceof Error ? err.message : '回帖失败')
      }
    } finally {
      setReplying(false)
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [replyInput, topicId, replying, replyAgentIds, user?.id])

  if (status === 'loading') {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (status === 'error' || !topic) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-3 text-center">
        <p className="text-base text-gray-700">{errorMsg || '话题不存在'}</p>
        <Button asChild variant="outline">
          <Link to="/forum">返回论坛</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-gray-50">
      {/* 话题头部 */}
      <header className="shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <Link
            to="/forum"
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            <svg
              width="16"
              height="16"
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
            返回论坛
          </Link>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            {topic.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{formatRelativeTime(topic.created_at)}</span>
            <span className="text-gray-300">·</span>
            <span className="inline-flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {topic.views ?? 0} 浏览
            </span>
            {topic.mentioned_agents.length > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <div className="flex items-center gap-1">
                  {topic.mentioned_agents.slice(0, 6).map((aid) => {
                    const a = agentsMap.get(aid)
                    if (!a) return null
                    return (
                      <span
                        key={aid}
                        className="flex size-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ backgroundImage: a.avatarGradient }}
                        title={a.name}
                      >
                        {a.name.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700">
            {topic.content}
          </p>
        </div>
      </header>

      {/* 帖子区 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {displayPosts.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">
              还没有回帖，来 @ 智能体接个梗吧
            </div>
          )}
          {displayPosts.map((p) => (
            <PostBubble key={p.id} post={p} agentsMap={agentsMap} />
          ))}
        </div>
      </div>

      {/* 回帖区 */}
      <footer className="shrink-0 border-t border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <ReplyAgentPicker
            agentsMap={agentsMap}
            selected={replyAgentIds}
            onToggle={toggleReplyAgent}
            disabled={replying}
          />
          <div className="mt-2 flex items-end gap-2">
            <Textarea
              value={replyInput}
              onChange={(e) => setReplyInput(e.target.value)}
              placeholder={
                user ? '说点什么，回车发送…' : '登录后即可回帖'
              }
              rows={1}
              disabled={!user}
              className="flex-1"
              style={{ maxHeight: '120px' }}
            />
            <Button
              onClick={handleReply}
              disabled={!user || !replyInput.trim() || replying}
              className="shrink-0 transition-transform duration-300 ease-out hover:scale-[1.02]"
            >
              {replying ? <Spinner size="sm" /> : '发送'}
            </Button>
          </div>
          {replyError && (
            <p className="mt-1 text-xs text-red-600">{replyError}</p>
          )}
          {!user && (
            <p className="mt-1 text-center text-xs text-gray-400">
              <Link to="/auth/login" className="text-primary hover:underline">
                登录
              </Link>{' '}
              后即可参与讨论
            </p>
          )}
        </div>
      </footer>
    </div>
  )
}

// 帖子气泡：用户帖靠右（金黄），AI 帖靠左（白底 + 头像 + 名字）
function PostBubble({
  post,
  agentsMap,
}: {
  post: TopicPost
  agentsMap: Map<string, AgentConfig>
}) {
  const isUser = post.author_type === 'user'
  const isStreaming = post.isStreaming === true
  const showTypingDots = isStreaming && post.content === ''
  const agent = post.agent_id ? agentsMap.get(post.agent_id) : undefined

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-1 shrink-0">
          {agent ? (
            <span
              className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundImage: agent.avatarGradient }}
            >
              {agent.name.trim().charAt(0).toUpperCase() || '?'}
            </span>
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">
              ?
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          'flex max-w-[78%] flex-col',
          isUser ? 'items-end' : 'items-start',
        )}
      >
        {!isUser && (
          <span className="mb-0.5 px-1 text-xs font-medium text-gray-500">
            {agent?.name ?? '未知智能体'}
            {isStreaming && (
              <span className="ml-1 text-primary">正在打字…</span>
            )}
          </span>
        )}
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
              {post.content}
              {isStreaming && (
                <span className="animate-pulse-cursor ml-0.5">▋</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// 回帖 @ 智能体选择器
function ReplyAgentPicker({
  agentsMap,
  selected,
  onToggle,
  disabled,
}: {
  agentsMap: Map<string, AgentConfig>
  selected: string[]
  onToggle: (id: string) => void
  disabled: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const agents = Array.from(agentsMap.values())

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="4" />
        </svg>
        @ 召唤智能体
        {selected.length > 0 && (
          <Badge variant="primary" className="ml-1">
            {selected.length}
          </Badge>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn('transition-transform', expanded && 'rotate-180')}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-input p-2 scrollbar-thin">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {agents.map((a) => {
              const checked = selected.includes(a.id)
              return (
                <label
                  key={a.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted',
                    disabled && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(a.id)}
                    disabled={disabled}
                    className="size-3.5 accent-[var(--color-primary)]"
                  />
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ backgroundImage: a.avatarGradient }}
                  >
                    {a.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="truncate text-xs text-gray-700">
                    {a.name}
                  </span>
                </label>
              )
            })}
          </div>
          {selected.length === 0 && (
            <p className="py-1 text-center text-[10px] text-gray-400">
              不选则用话题提及的智能体
            </p>
          )}
        </div>
      )}
    </div>
  )
}
