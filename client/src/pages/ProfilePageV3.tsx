// =====================================================================
// 创作者社交主页
// ---------------------------------------------------------------------
// 路由：
//   /profile        — 本人主页（显示完整内容）
//   /profile/:userId — 访客视图
// Tab：动态、项目、收藏、智能体
// =====================================================================

import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Share2, Loader2, FolderOpen, Sparkles, Heart, UserPlus, Settings } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFavorites } from '@/hooks/useFavorites'
import { getUserPosts, getFollowStats, toggleFollowUser, getFollowStatus } from '@/lib/api'
import type { Post } from '@/lib/api'
import { apiFetch } from '@/lib/api'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PostCard } from '@/components/PostCard'
import { getAgentById } from '@shared/agents'
import type { CreativeWork } from '@shared/types'
import { cn, formatRelativeTime } from '@/lib/utils'

type Tab = 'posts' | 'projects' | 'favorites' | 'agents'

export function ProfilePageV3() {
  const { userId: paramUserId } = useParams()
  const { user: currentUser } = useAuth()
  const { favorites } = useFavorites()

  const targetUserId = paramUserId || currentUser?.id
  const isOwn = !paramUserId || paramUserId === currentUser?.id

  const [tab, setTab] = useState<Tab>('posts')
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<{ nickname: string; email?: string; avatar_url?: string | null } | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [works, setWorks] = useState<CreativeWork[]>([])
  const [followStats, setFollowStats] = useState({ following: 0, followers: 0 })
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  const loadProfile = useCallback(async () => {
    if (!targetUserId) return
    setLoading(true)
    try {
      // 查用户信息
      const profileData = await apiFetch<{ nickname: string; email?: string; avatar_url?: string | null }>(`/users/${targetUserId}`)
      setProfile(profileData)

      // 查动态
      const { posts: userPosts } = await getUserPosts(targetUserId)
      setPosts(userPosts)

      // 查作品（本人）
      if (isOwn) {
        try {
          const { works: userWorks } = await apiFetch<{ works: CreativeWork[] }>(`/studio/works`)
          setWorks(userWorks)
        } catch { /* ignore */ }
      }

      // 查关注数据
      try {
        const stats = await getFollowStats(targetUserId)
        setFollowStats(stats)
      } catch { /* ignore */ }

      // 查关注状态（访客）
      if (!isOwn && currentUser) {
        try {
          const { following } = await getFollowStatus(targetUserId)
          setIsFollowing(following)
        } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('[ProfilePageV3] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [targetUserId, isOwn, currentUser])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const handleFollow = useCallback(async () => {
    if (!currentUser || !targetUserId) return
    setFollowLoading(true)
    try {
      const { following } = await toggleFollowUser(targetUserId)
      setIsFollowing(following)
      setFollowStats((prev) => ({
        ...prev,
        followers: prev.followers + (following ? 1 : -1),
      }))
      toast.success(following ? '已关注' : '已取消关注')
    } catch {
      toast.error('操作失败')
    } finally {
      setFollowLoading(false)
    }
  }, [currentUser, targetUserId])

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/profile/${targetUserId}`
    navigator.clipboard?.writeText(url)
    toast.success('链接已复制')
  }, [targetUserId])

  const handleDeletePost = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-gray-500">用户不存在</p>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof FolderOpen }[] = [
    { id: 'posts', label: '动态', icon: Sparkles },
    { id: 'projects', label: '项目', icon: FolderOpen },
    { id: 'favorites', label: '收藏', icon: Heart },
    { id: 'agents', label: '智能体', icon: UserPlus },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      {/* Banner */}
      <div className="h-32 bg-gradient-to-r from-primary/20 via-amber-500/20 to-primary/20" />

      {/* 头像 + 信息 */}
      <div className="px-4">
        <div className="-mt-12 flex items-end justify-between">
          <Avatar className="h-24 w-24 border-4 border-white dark:border-gray-900">
            <AvatarFallback className="bg-gradient-to-br from-primary to-amber-500 text-2xl font-bold text-white">
              {profile.nickname?.[0]?.toUpperCase() ?? 'U'}
            </AvatarFallback>
          </Avatar>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            {isOwn ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link to="/settings">
                    <Settings className="mr-1.5 h-4 w-4" />
                    编辑
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleFollow}
                  disabled={followLoading}
                  variant={isFollowing ? 'outline' : 'default'}
                >
                  {isFollowing ? '已关注' : '关注'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 昵称 + 简介 */}
        <div className="mt-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{profile.nickname}</h1>
          {isOwn && profile.email && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
          )}

          {/* 关注/粉丝数据 */}
          <div className="mt-2 flex gap-4 text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              <strong className="text-gray-900 dark:text-gray-100">{followStats.following}</strong> 关注
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              <strong className="text-gray-900 dark:text-gray-100">{followStats.followers}</strong> 粉丝
            </span>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="sticky top-0 z-10 mt-4 flex border-b border-gray-100 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
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
      {tab === 'posts' && (
        posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Sparkles className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500">{isOwn ? '还没有发布动态' : 'TA还没有发布动态'}</p>
          </div>
        ) : (
          <div>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onDelete={handleDeletePost} />
            ))}
          </div>
        )
      )}

      {tab === 'projects' && (
        works.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FolderOpen className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500">{isOwn ? '还没有创作作品' : 'TA还没有公开作品'}</p>
            {isOwn && (
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link to="/studio">去创作</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            {works.map((w) => {
              const thumbnail = (w.result as { url?: string; thumbnail_url?: string } | null)?.url
                || (w.result as { thumbnail_url?: string } | null)?.thumbnail_url
              return (
                <Card key={w.id} className="overflow-hidden">
                  <div className="aspect-video bg-gray-100 dark:bg-gray-800">
                    {thumbnail ? (
                      <img src={thumbnail} alt={w.title || '作品'} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl">
                        {w.type === 'image' ? '🖼️' : w.type === 'video' ? '🎬' : w.type === 'script' ? '📝' : '💻'}
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-sm font-medium">{w.title || '未命名'}</p>
                    <p className="text-xs text-gray-400">{formatRelativeTime(w.created_at)}</p>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      )}

      {tab === 'favorites' && (
        isOwn ? (
          favorites.size === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Heart className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500">还没有收藏智能体</p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link to="/agents">去发现</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              {[...favorites].map((agentId) => {
                const agent = getAgentById(agentId)
                if (!agent) return null
                return (
                  <Link
                    key={agentId}
                    to={`/chat/${agentId}`}
                    className="flex flex-col items-center rounded-xl border border-gray-200 bg-white p-4 text-center transition-colors hover:border-primary/40 dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div
                      className="mb-2 flex h-12 w-12 items-center justify-center rounded-full font-bold text-white"
                      style={{ backgroundImage: agent.avatarGradient }}
                    >
                      {agent.name[0]}
                    </div>
                    <p className="truncate text-sm font-medium">{agent.name}</p>
                    <p className="truncate text-xs text-gray-400">{agent.era}</p>
                  </Link>
                )
              })}
            </div>
          )
        ) : (
          <div className="py-20 text-center text-sm text-gray-500">收藏列表仅本人可见</div>
        )
      )}

      {tab === 'agents' && (
        <div className="py-20 text-center text-sm text-gray-500">
          自定义智能体功能开发中
        </div>
      )}
    </div>
  )
}
