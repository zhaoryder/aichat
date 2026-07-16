import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, MessageCircle, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getFeed } from '@/lib/api'
import type { Post } from '@/lib/api'
import { PostCard } from '@/components/PostCard'
import { Button } from '@/components/ui/button'

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

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-6">
      {/* 未登录引导 */}
      {!user && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-[hsl(var(--accent)/0.08)] to-[hsl(var(--accent)/0.02)] p-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            AI Lab
          </h1>
          <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))]">
            AI 创作者的灵感社区 · 发现、分享、创作
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link to="/auth/register">立即加入</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/auth/login">登录</Link>
            </Button>
          </div>
        </div>
      )}

      {/* 卡片瀑布流 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MessageCircle className="mb-3 h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]" />
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">还没有作品</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            {user ? '去发布你的第一个作品吧' : '登录后发布作品'}
          </p>
          {user && (
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link to="/publish">
                <Sparkles className="mr-1.5 h-4 w-4" />
                发布作品
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* 无限滚动哨兵 */}
      {!loading && posts.length > 0 && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loadingMore && (
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" />
          )}
          {!hasMore && (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">已经到底了</span>
          )}
        </div>
      )}

      {/* 版本号 footer（E4.3） */}
      <footer className="mt-8 border-t border-[hsl(var(--border))] py-4 text-center">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          AI Lab · v4.0.0 · Agent 超级大升级
        </span>
      </footer>
    </div>
  )
}
