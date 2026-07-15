// 智能体广场：官方 + 公开自定义智能体的网格展示（spec §5.4）
// - 顶部：搜索框（debounce 300ms）+ 筛选 tab（全部/官方/自定义）+ 创建按钮
// - 分类标签栏：10 大类 + "全部"
// - 卡片网格：头像（avatarGradient 内联）、名字、title/tagline、topics、era badge
// - 分页器：上一页/下一页 + 页码
// - 点击卡片跳 /chat/:id
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { AgentConfig, AgentCategory } from '@shared/agents'

type Filter = 'all' | 'official' | 'custom'

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'official', label: '官方' },
  { key: 'custom', label: '自定义' },
]

// 10 大分类 + "全部"（spec §5.4）
const CATEGORY_TABS: { key: AgentCategory | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'history', label: '历史' },
  { key: 'literature', label: '文学' },
  { key: 'science', label: '科学' },
  { key: 'art', label: '艺术' },
  { key: 'anime-game', label: '动漫游戏' },
  { key: 'worklife', label: '职场生活' },
  { key: 'fun', label: '趣味' },
  { key: 'sports', label: '运动' },
  { key: 'music', label: '音乐' },
  { key: 'movie-tv', label: '影视' },
]

const PAGE_SIZE = 20

interface AgentsResponse {
  agents: AgentConfig[]
  total: number
  page: number
  pageSize: number
}

export const AgentsSquarePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [category, setCategory] = useState<AgentCategory | 'all'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // debounce 搜索（300ms，spec §5.4）
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setAppliedSearch(searchInput.trim())
      setPage(1) // 搜索时回到第 1 页
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      filter,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    })
    if (category !== 'all') params.set('category', category)
    if (appliedSearch) params.set('search', appliedSearch)
    apiFetch<AgentsResponse>(`/agents?${params.toString()}`)
      .then((res) => {
        if (!active) return
        setAgents(res.agents ?? [])
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
  }, [filter, category, appliedSearch, page])

  const handleCategoryChange = useCallback((c: AgentCategory | 'all') => {
    setCategory(c)
    setPage(1)
  }, [])

  const handleFilterChange = useCallback((f: Filter) => {
    setFilter(f)
    setPage(1)
  }, [])

  const handleSearch = useCallback(() => {
    setAppliedSearch(searchInput.trim())
    setPage(1)
  }, [searchInput])

  // 分页计算
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const canPrev = page > 1
  const canNext = page < totalPages
  // 页码按钮：显示当前页前后各 2 页，至少 1 页
  const pageNumbers: number[] = []
  const startPage = Math.max(1, page - 2)
  const endPage = Math.min(totalPages, startPage + 4)
  for (let i = startPage; i <= endPage; i++) pageNumbers.push(i)

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">智能体广场</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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

      {/* 搜索 + 来源筛选 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="搜索名字 / 标语 / 头衔…（自动搜索）"
            className="sm:w-80"
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
              onClick={() => handleFilterChange(tab.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                filter === tab.key
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 分类标签栏（10 大类 + "全部"，spec §5.4） */}
      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleCategoryChange(tab.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300 ease-out',
              category === tab.key
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 总数显示 */}
      {!loading && !error && agents.length > 0 && (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          共 {total} 个智能体，第 {page} / {totalPages} 页
        </p>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start gap-4">
                <Skeleton className="size-12 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <div className="mt-4 flex justify-end">
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState title="加载失败" description={error} />
      ) : agents.length === 0 ? (
        <EmptyState
          title="没有匹配的智能体"
          description="换个关键词或筛选条件试试"
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {/* 分页器（上一页/下一页 + 页码，spec §5.4） */}
      {!loading && !error && total > PAGE_SIZE && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="transition-transform duration-300 ease-out hover:scale-[1.02] disabled:opacity-50"
          >
            上一页
          </Button>
          {pageNumbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={cn(
                'min-w-[2rem] rounded-md px-2 py-1 text-sm font-medium transition-all duration-300 ease-out',
                n === page
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-muted dark:bg-gray-800 dark:text-gray-300',
              )}
            >
              {n}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={!canNext}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="transition-transform duration-300 ease-out hover:scale-[1.02] disabled:opacity-50"
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}

// 智能体卡片
function AgentCard({ agent }: { agent: AgentConfig }) {
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <Link to={`/chat/${agent.id}`} className="group block">
      <Card className="hover-lift h-full p-5">
        <div className="flex items-start gap-4">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
            style={{ backgroundImage: agent.avatarGradient }}
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-bold text-gray-900 group-hover:text-primary dark:text-gray-100">
                {agent.name}
              </h3>
              <Badge variant="default" className="shrink-0">
                {agent.era}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{agent.title}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          &ldquo;{agent.tagline}&rdquo;
        </p>
        {agent.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {agent.topics.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-400"
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
