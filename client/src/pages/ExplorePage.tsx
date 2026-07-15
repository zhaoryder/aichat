import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Flame, Code2, Sparkles, Users } from 'lucide-react'
import { getExploreFeed } from '@/lib/api'
import type { Post } from '@/lib/api'
import { PostCard } from '@/components/PostCard'
import { agents } from '@shared/agents'
import type { AgentConfig } from '@shared/agents'
import { cn } from '@/lib/utils'

type Tab = 'hot' | 'projects' | 'agents' | 'creators'

export function ExplorePage() {
  const [tab, setTab] = useState<Tab>('hot')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [agentList] = useState<AgentConfig[]>(() => agents.slice(0, 24))

  const loadExplore = useCallback(async () => {
    setLoading(true)
    try {
      const { posts: hotPosts } = await getExploreFeed()
      setPosts(hotPosts)
    } catch (err) {
      console.error('[ExplorePage] error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'hot' || tab === 'projects') {
      loadExplore()
    }
  }, [tab, loadExplore])

  const tabs: { id: Tab; label: string; icon: typeof Flame }[] = [
    { id: 'hot', label: '热门动态', icon: Flame },
    { id: 'projects', label: 'Vibe Code', icon: Code2 },
    { id: 'agents', label: '智能体', icon: Sparkles },
    { id: 'creators', label: '创作者', icon: Users },
  ]

  const projectPosts = posts.filter((p) => p.type === 'project_share')

  return (
    <div className="mx-auto max-w-2xl">
      {/* 页头 */}
      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">探索</h1>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">发现热门内容、项目和创作者</p>
      </div>

      {/* Tab 切换 */}
      <div className="sticky top-0 z-10 flex border-b border-gray-100 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
            )}
          >
            <t.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* 内容区 */}
      {tab === 'hot' && (
        loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : posts.length === 0 ? (
          <EmptyState text="还没有热门动态" />
        ) : (
          <div>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )
      )}

      {tab === 'projects' && (
        loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : projectPosts.length === 0 ? (
          <EmptyState text="还没有分享的 Vibe Code 项目" sub="去创意工坊创建项目并分享到社区" />
        ) : (
          <div>
            {projectPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )
      )}

      {tab === 'agents' && (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
          {agentList.map((agent) => (
            <Link
              key={agent.id}
              to={`/chat/${agent.id}`}
              className="flex flex-col items-center rounded-xl border border-gray-200 bg-white p-4 text-center transition-colors hover:border-primary/40 dark:border-gray-800 dark:bg-gray-900"
            >
              <div
                className="mb-2 flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white"
                style={{ backgroundImage: agent.avatarGradient }}
              >
                {agent.name[0]}
              </div>
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{agent.name}</p>
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{agent.era}</p>
              <p className="mt-1 line-clamp-2 text-xs text-gray-400 dark:text-gray-500">{agent.tagline}</p>
            </Link>
          ))}
        </div>
      )}

      {tab === 'creators' && (
        <div className="p-4">
          <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">推荐创作者</div>
          <div className="space-y-2">
            {[
              { name: 'AI Explorer', desc: 'Vibe Code 达人', initials: 'AE' },
              { name: 'Prompt Engineer', desc: '提示词专家', initials: 'PE' },
              { name: 'Creative Coder', desc: '创意编程', initials: 'CC' },
              { name: 'AI Artist', desc: 'AI 绘画创作者', initials: 'AA' },
            ].map((c) => (
              <Link
                key={c.name}
                to="/explore"
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-amber-500 text-sm font-bold text-white">
                  {c.initials}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.desc}</p>
                </div>
                <button className="rounded-full border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5">
                  关注
                </button>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
            关注功能正在完善中
          </p>
        </div>
      )}
    </div>
  )
}

function EmptyState({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Flame className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{text}</p>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  )
}
