// 主页：Hero 区 + 智能体卡片网格
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { agents, type AgentConfig } from '@shared/agents'
import { useAuth } from '@/hooks/useAuth'
import { useFavorites } from '@/hooks/useFavorites'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

// 智能体头像：用 CSS 渐变背景渲染圆形头像 + 首字母
// AgentConfig.avatarGradient 是 CSS linear-gradient 字符串，需内联 style 渲染，
// 不能用 Avatar 组件（其 gradient prop 是 tailwind 类片段）
function AgentAvatar({ agent, size = 'md' }: { agent: AgentConfig; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-12 w-12 text-base',
    lg: 'h-16 w-16 text-xl',
  }[size]
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sizeClass}`}
      style={{ backgroundImage: agent.avatarGradient }}
    >
      {initial}
    </div>
  )
}

export const HomePage = () => {
  const { user } = useAuth()
  const { favorites, loading: favoritesLoading } = useFavorites()
  const navigate = useNavigate()
  // 首次加载骨架屏（仅在首屏短暂显示，避免后续 refetch 闪烁）
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 300)
    return () => window.clearTimeout(timer)
  }, [])

  // 已登录用户的收藏智能体
  const favoriteAgents = user ? agents.filter(a => favorites.has(a.id)) : []

  // 热门精选：从各分类均匀取样，确保首页展示多样化角色而非全是历史人物
  const featuredAgents = useMemo(() => {
    // 按分类分组
    const groups = new Map<string, AgentConfig[]>()
    for (const a of agents) {
      const cat = a.category || 'other'
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(a)
    }
    // 轮询取样：每个分类取 1 个，循环直到凑够 30 个
    const result: AgentConfig[] = []
    const lists = [...groups.values()]
    const indices = lists.map(() => 0)
    while (result.length < 30) {
      let added = false
      for (let i = 0; i < lists.length && result.length < 30; i++) {
        if (indices[i] < lists[i].length) {
          result.push(lists[i][indices[i]])
          indices[i]++
          added = true
        }
      }
      if (!added) break
    }
    return result
  }, [])

  // CTA：已登录跳第一个智能体对话，未登录跳广场
  function handleStart() {
    if (user && agents[0]) navigate(`/chat/${agents[0].id}`)
    else navigate('/agents')
  }

  return (
    <div className="animate-fade-in">
      {/* Hero 区：金黄渐变标题 + 副标题 + CTA */}
      <section className="mx-auto max-w-5xl px-4 pb-10 pt-16 text-center sm:pt-20">
        <h1 className="bg-gradient-to-r from-primary via-amber-400 to-orange-500 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl md:text-6xl">
          AI 搞笑工坊
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-gray-600 sm:text-lg">
          和 300+ 位穿越时空的&ldquo;灵魂人物&rdquo;聊聊天——从孔子到马斯克，从林黛玉到 C 罗，每一位都会用专属的毒舌与梗陪你整活。
        </p>
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={handleStart}
            className="gap-2 transition-transform duration-300 ease-out hover:scale-[1.02]"
          >
            立即开始
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        </div>
      </section>

      {/* 我的收藏区块：仅已登录用户显示 */}
      {user && (
        <section className="mx-auto max-w-7xl px-4 pb-10">
          <h2 className="mb-6 text-lg font-semibold text-gray-800">我的收藏</h2>
          {favoritesLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <Skeleton className="mt-3 h-4 w-24" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </div>
              ))}
            </div>
          ) : favoriteAgents.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {favoriteAgents.map((agent) => (
                <Link key={agent.id} to={`/chat/${agent.id}`} className="group block">
                  <Card className="hover-lift h-full p-5">
                    <div className="flex items-start gap-4">
                      <AgentAvatar agent={agent} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-bold text-gray-900">{agent.name}</h3>
                          <Badge variant="default" className="shrink-0">{agent.era}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">{agent.title}</p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
                      &ldquo;{agent.tagline}&rdquo;
                    </p>
                    <div className="mt-4 flex items-center justify-end">
                      <span className="text-xs font-medium text-primary transition-transform duration-300 ease-out group-hover:translate-x-1">
                        继续对话 →
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" strokeLinejoin="round" />
                </svg>
              }
              title="还没有收藏的智能体"
              description="去广场逛逛，收藏你喜欢的角色，它们会显示在这里方便快速访问。"
              action={
                <Button size="sm" onClick={() => navigate('/agents')} className="gap-1">
                  去广场逛逛
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Button>
              }
            />
          )}
        </section>
      )}

      {/* 热门精选：取前 30 个作为精选（spec §5.3） */}
      <section className="mx-auto max-w-7xl px-4 pb-20">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">热门精选</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/agents')}
            className="gap-1 transition-transform duration-300 ease-out hover:scale-[1.02]"
          >
            查看全部 {agents.length}+ →
          </Button>
        </div>
        {loading ? (
          // 首次加载骨架屏
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
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
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {featuredAgents.map((agent) => (
                <Link key={agent.id} to={`/chat/${agent.id}`} className="group block">
                  <Card className="hover-lift h-full p-5">
                    <div className="flex items-start gap-4">
                      <AgentAvatar agent={agent} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-bold text-gray-900">{agent.name}</h3>
                          <Badge variant="default" className="shrink-0">{agent.era}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">{agent.title}</p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
                      &ldquo;{agent.tagline}&rdquo;
                    </p>
                    <div className="mt-4 flex items-center justify-end">
                      <span className="text-xs font-medium text-primary transition-transform duration-300 ease-out group-hover:translate-x-1">
                        {user ? '开始对话 →' : '去登录 →'}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
            {/* 底部固定按钮：跳转广场查看全部（spec §5.3） */}
            <div className="mt-10 flex justify-center">
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/agents')}
                className="gap-2 transition-transform duration-300 ease-out hover:scale-[1.02]"
              >
                查看全部 {agents.length}+ 位智能体 →
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
