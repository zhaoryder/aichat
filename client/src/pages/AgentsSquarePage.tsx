// 智能体广场：官方 + 公开自定义智能体的网格展示
// - 顶部：搜索框 + 筛选 tab（全部/官方/自定义）+ 创建按钮
// - 卡片网格：头像（avatarGradient 内联）、名字、title/tagline、topics、era badge
// - 点击卡片跳 /chat/:id
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui-legacy/Button'
import { Card } from '@/components/ui-legacy/Card'
import { Input } from '@/components/ui-legacy/Input'
import { Badge } from '@/components/ui-legacy/Badge'
import { Spinner } from '@/components/ui-legacy/Spinner'
import { EmptyState } from '@/components/ui-legacy/EmptyState'
import { cn } from '@/lib/utils'
import type { AgentConfig } from '@shared/agents'

type Filter = 'all' | 'official' | 'custom'

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'official', label: '官方' },
  { key: 'custom', label: '自定义' },
]

export const AgentsSquarePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ filter })
    if (appliedSearch) params.set('search', appliedSearch)
    apiFetch<{ agents: AgentConfig[] }>(`/agents?${params.toString()}`)
      .then((res) => {
        if (!active) return
        setAgents(res.agents ?? [])
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
  }, [filter, appliedSearch])

  const handleSearch = useCallback(() => {
    setAppliedSearch(searchInput.trim())
  }, [searchInput])

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">智能体广场</h1>
          <p className="mt-1 text-sm text-gray-500">
            官方灵魂人物 + 网友自创的整活角色，挑一个开聊
          </p>
        </div>
        {user ? (
          <Button
            onClick={() => navigate('/agents/create')}
            className="gap-1.5 self-start transition-transform duration-300 ease-out hover:scale-[1.02] sm:self-auto"
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
            创建智能体
          </Button>
        ) : (
          <Button asChild variant="outline" className="self-start sm:self-auto">
            <Link to="/auth/login">登录后创建</Link>
          </Button>
        )}
      </header>

      {/* 搜索 + 筛选 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="搜索名字 / 标语 / 头衔…"
            className="sm:w-72"
          />
          <Button variant="outline" onClick={handleSearch}>
            搜索
          </Button>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                filter === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <EmptyState title="加载失败" description={error} />
      ) : agents.length === 0 ? (
        <EmptyState
          title="没有匹配的智能体"
          description="换个关键词或筛选条件试试"
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}

// 智能体卡片
function AgentCard({ agent }: { agent: AgentConfig }) {
  const isCustom = agent.era === '自定义'
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <Link to={`/chat/${agent.id}`} className="group block">
      <Card hoverScale className="h-full p-5">
        <div className="flex items-start gap-4">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
            style={{ backgroundImage: agent.avatarGradient }}
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-bold text-gray-900 group-hover:text-primary">
                {agent.name}
              </h3>
              <Badge
                variant={isCustom ? 'primary' : 'default'}
                className="shrink-0"
              >
                {agent.era}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {agent.title}
            </p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
          &ldquo;{agent.tagline}&rdquo;
        </p>
        {agent.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {agent.topics.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-end">
          <span className="text-xs font-medium text-primary transition-transform duration-300 ease-out group-hover:translate-x-1">
            开始对话 →
          </span>
        </div>
      </Card>
    </Link>
  )
}
