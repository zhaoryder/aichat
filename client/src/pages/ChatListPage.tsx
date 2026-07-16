// =====================================================================
// 聊天列表页（Chat List）— AI 智能体聊天入口
// ---------------------------------------------------------------------
// - 搜索 AI 智能体
// - 按分类展示
// - 点击进入 /chat/:agentId
// =====================================================================

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageCircle, Sparkles } from 'lucide-react'
import { agents } from '@shared/agents'
import type { AgentConfig, AgentCategory } from '@shared/agents'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------
// 分类配置
// ---------------------------------------------------------------------

const CATEGORY_LABEL: Record<AgentCategory, string> = {
  history: '历史',
  literature: '文学',
  science: '科学',
  art: '艺术',
  'anime-game': '动漫游戏',
  worklife: '职场生活',
  fun: '搞笑',
  sports: '体育',
  music: '音乐',
  'movie-tv': '影视',
}

const CATEGORY_ORDER: AgentCategory[] = [
  'fun',
  'history',
  'science',
  'literature',
  'art',
  'anime-game',
  'worklife',
  'sports',
  'music',
  'movie-tv',
]

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

export const ChatListPage = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<AgentCategory | 'all'>('all')

  // 搜索过滤
  const filteredAgents = useMemo(() => {
    let list = agents
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          a.tagline.toLowerCase().includes(q),
      )
    }
    if (activeCategory !== 'all') {
      list = list.filter((a) => a.category === activeCategory)
    }
    return list
  }, [search, activeCategory])

  // 按分类分组
  const groupedAgents = useMemo(() => {
    if (activeCategory !== 'all' || search.trim()) {
      return [{ category: activeCategory === 'all' ? 'all' : activeCategory, agents: filteredAgents }]
    }
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      agents: filteredAgents.filter((a) => a.category === cat),
    })).filter((g) => g.agents.length > 0)
  }, [filteredAgents, activeCategory, search])

  return (
    <div className="animate-fade-in mx-auto max-w-4xl px-4 py-6">
      {/* 页头 */}
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
          <MessageCircle className="h-6 w-6 text-[hsl(var(--accent))]" />
          聊天
        </h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          和 AI 智能体对话 · 选择一个开始聊天
        </p>
      </header>

      {/* 搜索框 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索智能体..."
          className="pl-9"
        />
      </div>

      {/* 分类筛选 */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory('all')}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ease-out',
            activeCategory === 'all'
              ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
              : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)]',
          )}
        >
          全部
        </button>
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ease-out',
              activeCategory === cat
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)]',
            )}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      {/* 智能体列表 */}
      {groupedAgents.map((group) => (
        <section key={group.category} className="mb-6">
          {group.category !== 'all' && (
            <h2 className="mb-3 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
              {CATEGORY_LABEL[group.category as AgentCategory] ?? group.category}
              <span className="ml-1.5 text-xs">({group.agents.length})</span>
            </h2>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={() => navigate(`/chat/${agent.id}`)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* 空状态 */}
      {filteredAgents.length === 0 && (
        <Card className="p-12 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-[hsl(var(--muted-foreground))]" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            没有找到匹配的智能体
          </p>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// 智能体卡片
// ---------------------------------------------------------------------

function AgentCard({ agent, onClick }: { agent: AgentConfig; onClick: () => void }) {
  return (
    <Card
      className="flex cursor-pointer items-center gap-3 p-3 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-md"
      onClick={onClick}
    >
      {/* 头像 */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
        style={{ background: agent.avatarGradient }}
      >
        {agent.name.charAt(0)}
      </div>

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-[hsl(var(--foreground))]">{agent.name}</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {agent.title}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
          {agent.tagline}
        </p>
      </div>

      <MessageCircle className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
    </Card>
  )
}
