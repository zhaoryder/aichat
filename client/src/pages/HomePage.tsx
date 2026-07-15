import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, TrendingUp, Loader2, MessageCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getFeed } from '@/lib/api'
import type { Post } from '@/lib/api'
import { PostCard } from '@/components/PostCard'
import { PostComposer } from '@/components/PostComposer'
import { Button } from '@/components/ui/button'
import { agents } from '@shared/agents'
import type { AgentConfig } from '@shared/agents'

export function HomePage() {
  const { user } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadFeed = useCallback(async (pageNum: number) => {
    try {
      const { posts: newPosts, hasMore: more } = await getFeed(pageNum)
      if (pageNum === 1) {
        setPosts(newPosts)
      } else {
        setPosts((prev) => [...prev, ...newPosts])
      }
      setHasMore(more)
    } catch (err) {
      console.error('[HomePage] loadFeed error:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    loadFeed(1)
  }, [loadFeed])

  // 无限滚动
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          const nextPage = page + 1
          setLoadingMore(true)
          setPage(nextPage)
          loadFeed(nextPage)
        }
      },
      { rootMargin: '200px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, page, loadFeed])

  const handleDelete = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id))
  }, [])

  // 热门智能体快捷入口
  const hotAgents: AgentConfig[] = agents.slice(0, 6)

  return (
    <div className="mx-auto max-w-2xl">
      {/* 未登录引导条 */}
      {!user && (
        <div className="border-b border-primary/20 bg-gradient-to-r from-primary/5 to-amber-500/5 px-4 py-6 text-center">
          <h1 className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-2xl font-extrabold text-transparent">
            AI Lab
          </h1>
          <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
            面向开发者和 AI 创作者的社区 · 分享你的代码、提示词和 AI 创作
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link to="/auth/register">立即加入</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/auth/login">登录</Link>
            </Button>
          </div>
        </div>
      )}

      {/* 发布框 */}
      {user && <PostComposer />}

      {/* 热门智能体快捷栏 */}
      <div className="flex gap-2 overflow-x-auto border-b border-gray-100 px-4 py-3 scrollbar-thin dark:border-gray-800">
        {hotAgents.map((agent) => (
          <Link
            key={agent.id}
            to={`/chat/${agent.id}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white"
              style={{ backgroundImage: agent.avatarGradient }}
            >
              {agent.name[0]}
            </span>
            {agent.name}
          </Link>
        ))}
      </div>

      {/* 信息流 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MessageCircle className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">还没有动态</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {user ? '发布第一条动态，或关注其他创作者' : '登录后发布第一条动态'}
          </p>
          {user && (
            <div className="mt-4 flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/explore">
                  <TrendingUp className="mr-1.5 h-4 w-4" />
                  去探索
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/agents">
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  找智能体
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onDelete={handleDelete} />
          ))}

          {/* 无限滚动哨兵 */}
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {loadingMore && (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            )}
            {!hasMore && (
              <span className="text-xs text-gray-400 dark:text-gray-500">已经到底了</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
