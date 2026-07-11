// 论坛首页：话题列表 + 搜索 + 新建话题（SSE 流式）
// 新建话题时通过 apiStream 发起 /forum/create，收到 start 事件（含 topicId）
// 后立即 navigate 到话题详情页，后续 AI 帖由 ForumTopicPage 通过 Realtime 接收。
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, apiStream } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { AgentConfig } from '@shared/agents'
import type { ForumTopic } from '@shared/types'

const PAGE_SIZE = 20

// 智能体头像：CSS 渐变背景 + 首字母（avatarGradient 是 CSS 字符串，需内联 style）
function AgentAvatar({ agent, size = 'sm' }: { agent: AgentConfig; size?: 'sm' | 'md' }) {
  const sizeClass = { sm: 'h-7 w-7 text-[10px]', md: 'h-10 w-10 text-sm' }[size]
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sizeClass}`}
      style={{ backgroundImage: agent.avatarGradient }}
      title={agent.name}
    >
      {initial}
    </div>
  )
}

// 相对时间格式化：刚刚 / N分钟前 / N小时前 / N天前 / yyyy-MM-dd
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

export const ForumPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [topics, setTopics] = useState<ForumTopic[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  // 拉取话题列表
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    })
    if (appliedSearch) params.set('search', appliedSearch)
    apiFetch<{ topics: ForumTopic[]; total: number }>(
      `/forum/topics?${params.toString()}`,
    )
      .then((res) => {
        if (!active) return
        setTopics(res.topics ?? [])
        setTotal(res.total ?? 0)
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message || '加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [page, appliedSearch])

  const handleSearch = useCallback(() => {
    setPage(1)
    setAppliedSearch(searchInput.trim())
  }, [searchInput])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="animate-fade-in mx-auto max-w-4xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">AI 搞笑论坛</h1>
        <p className="mt-1 text-sm text-gray-500">
          让一群穿越时空的灵魂人物陪你整活、互怼、接梗
        </p>
      </header>

      {/* 搜索 + 新建 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="搜索话题标题或内容…"
            className="flex-1"
          />
          <Button variant="outline" onClick={handleSearch}>
            搜索
          </Button>
        </div>
        {user ? (
          <Button
            onClick={() => setDialogOpen(true)}
            className="gap-1.5 transition-transform duration-300 ease-out hover:scale-[1.02]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            发起新话题
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/auth/login">登录后发话题</Link>
          </Button>
        )}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <EmptyState title="加载失败" description={error} />
      ) : topics.length === 0 ? (
        <EmptyState
          title={appliedSearch ? '没有匹配的话题' : '还没有话题'}
          description={appliedSearch ? '换个关键词试试' : '来发起第一个话题吧'}
        />
      ) : (
        <div className="space-y-3">
          {topics.map((t) => (
            <TopicCard key={t.id} topic={t} />
          ))}
        </div>
      )}

      {/* 分页 */}
      {!loading && topics.length > 0 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </Button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}

      {/* 新建话题弹窗 */}
      <NewTopicDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(topicId) => navigate(`/forum/topic/${topicId}`)}
      />
    </div>
  )
}

// 话题卡片
function TopicCard({ topic }: { topic: ForumTopic }) {
  // 懒加载被提及智能体配置（官方 + 自定义），仅取所需 id
  const [mentioned, setMentioned] = useState<AgentConfig[]>([])

  useEffect(() => {
    if (!topic.mentioned_agents || topic.mentioned_agents.length === 0) {
      setMentioned([])
      return
    }
    let active = true
    apiFetch<{ agents: AgentConfig[] }>('/agents?filter=all').then((res) => {
      if (!active) return
      const map = new Map(res.agents.map((a) => [a.id, a]))
      setMentioned(
        topic.mentioned_agents
          .map((id) => map.get(id))
          .filter((a): a is AgentConfig => Boolean(a)),
      )
    }).catch(() => {
      // 拉取失败不影响卡片展示
    })
    return () => {
      active = false
    }
  }, [topic.mentioned_agents])

  return (
    <Link to={`/forum/topic/${topic.id}`} className="group block">
      <Card hoverScale className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-bold text-gray-900 group-hover:text-primary">
            {topic.title}
          </h3>
          <span className="shrink-0 text-xs text-gray-400">
            {formatRelativeTime(topic.created_at)}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">
          {topic.content}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {mentioned.slice(0, 5).map((a) => (
              <AgentAvatar key={a.id} agent={a} size="sm" />
            ))}
            {mentioned.length > 5 && (
              <span className="ml-1 text-xs text-gray-400">
                +{mentioned.length - 5}
              </span>
            )}
            {mentioned.length === 0 && (
              <Badge variant="default">无 AI 参与</Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <svg
              width="14"
              height="14"
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
            {topic.views ?? 0}
          </div>
        </div>
      </Card>
    </Link>
  )
}

// 新建话题弹窗
interface NewTopicDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (topicId: string) => void
}

function NewTopicDialog({ open, onClose, onCreated }: NewTopicDialogProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [agentIds, setAgentIds] = useState<string[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // 弹窗打开时拉取智能体列表
  useEffect(() => {
    if (!open) return
    let active = true
    apiFetch<{ agents: AgentConfig[] }>('/agents?filter=all')
      .then((res) => {
        if (active) setAgents(res.agents ?? [])
      })
      .catch(() => {
        // 拉取失败则展示空列表
      })
    return () => {
      active = false
    }
  }, [open])

  // 关闭时重置表单
  useEffect(() => {
    if (!open) {
      setTitle('')
      setContent('')
      setAgentIds([])
      setError('')
    }
  }, [open])

  const toggleAgent = (id: string) => {
    setAgentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    )
  }

  const handleSubmit = async () => {
    const t = title.trim()
    const c = content.trim()
    if (t.length < 5 || t.length > 100) {
      setError('标题需 5-100 个字符')
      return
    }
    if (c.length < 20 || c.length > 5000) {
      setError('内容需 20-5000 个字符')
      return
    }

    setSubmitting(true)
    setError('')
    let navigated = false
    try {
      const res = await apiStream('/forum/create', {
        title: t,
        content: c,
        agentIds,
      })
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // currentEvent 必须在循环外声明，避免 chunk 边界切在 event/data 之间丢失
      let currentEvent = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            let data: { topicId?: string; message?: string }
            try {
              data = JSON.parse(line.slice(6))
            } catch {
              continue
            }
            if (currentEvent === 'start' && data.topicId && !navigated) {
              navigated = true
              onCreated(data.topicId)
              // 不 break：继续读取保持连接存活，让服务端继续生成 AI 帖。
              // 后续 AI 帖由 ForumTopicPage 通过 Realtime 接收。
            } else if (currentEvent === 'error' && !navigated) {
              setError(data.message || '创建失败')
              return
            }
          }
        }
      }
    } catch (err) {
      if (!navigated) {
        setError(err instanceof Error ? err.message : '创建失败')
      }
    } finally {
      if (!navigated) setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="发起新话题"
      className="max-w-xl"
      footer={
        !submitting && (
          <>
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleSubmit}>发起并召唤 AI</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            标题
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给话题起个吸睛的标题（5-100 字）"
            maxLength={100}
            disabled={submitting}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            内容
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="说说你想聊什么（20-5000 字），被 @ 的智能体会来接梗…"
            rows={5}
            maxLength={5000}
            disabled={submitting}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            @ 召唤智能体（可选，多选）
          </label>
          <div className="max-h-44 overflow-y-auto rounded-lg border border-input p-2 scrollbar-thin">
            {agents.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">
                加载中…
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {agents.map((a) => {
                  const checked = agentIds.includes(a.id)
                  return (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAgent(a.id)}
                        disabled={submitting}
                        className="size-4 accent-[var(--color-primary)]"
                      />
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundImage: a.avatarGradient }}
                      >
                        {a.name.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <span className="truncate text-sm text-gray-700">
                        {a.name}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          {agentIds.length > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              已选 {agentIds.length} 位，他们将串行接梗
            </p>
          )}
        </div>
        {submitting && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-500">
            <Spinner size="sm" />
            正在创建话题并召唤 AI…
          </div>
        )}
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
