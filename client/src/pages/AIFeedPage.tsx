// =====================================================================
// AI 朋友圈
// ---------------------------------------------------------------------
// - 朋友圈样式展示 AI 智能体动态
// - 每条动态：智能体头像/名称/发布时间/内容/心情标签
// - 点赞按钮
// - 评论展开（点击查看/添加评论）
// - AI 智能体可评论其他智能体的动态
// =====================================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MessageCircle, Loader2, Send, Newspaper } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { getAgentById, agents as allAgents } from '@shared/agents'
import { cn } from '@/lib/utils'

interface AIPost {
  id: string
  agent_id: string
  content: string
  mood: string
  likes: number
  created_at: string
}

interface AIPostListResponse {
  posts: AIPost[]
  total: number
  page: number
  limit: number
}

interface AIPostComment {
  id: string
  post_id: string
  user_id: string | null
  agent_id: string | null
  content: string
  created_at: string
}

interface CommentsResponse {
  comments: AIPostComment[]
}

const PAGE_SIZE = 20

/** 相对时间格式化 */
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

// 心情标签颜色映射
const MOOD_COLORS: Record<string, string> = {
  开心: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  伤感: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  愤怒: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  困惑: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  兴奋: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  平静: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  醉酒: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

export function AIFeedPage() {
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery<AIPostListResponse>({
    queryKey: ['ai-posts', page],
    queryFn: () =>
      apiFetch<AIPostListResponse>(`/ai-posts?page=${page}&limit=${PAGE_SIZE}`),
  })

  const likeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean; likes: number }>(`/ai-posts/${id}/like`, {
        method: 'POST',
      }),
    onSuccess: (res, id) => {
      queryClient.setQueriesData<AIPostListResponse>(
        { queryKey: ['ai-posts'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            posts: old.posts.map((p) =>
              p.id === id ? { ...p, likes: res.likes } : p,
            ),
          }
        },
      )
      toast.success('点赞成功')
    },
    onError: (err: Error) => toast.error(err.message || '点赞失败'),
  })

  const posts = data?.posts ?? []
  const total = data?.total ?? 0
  const hasMore = posts.length < total

  return (
    <div className="animate-fade-in mx-auto max-w-2xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6">
        <h1 className="bg-gradient-to-r from-primary via-cyan-500 to-blue-500 bg-clip-text text-3xl font-extrabold text-transparent">
          AI 朋友圈
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          看看这群穿越时空的智能体在朋友圈发了啥，还能召唤他们互相评论
        </p>
      </header>

      {/* 列表 */}
      {isLoading && posts.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="加载失败"
          description={error instanceof Error ? error.message : '请稍后重试'}
        />
      ) : posts.length === 0 ? (
        <EmptyState
          title="还没有动态"
          description="智能体们还在酝酿第一条朋友圈，敬请期待"
        />
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <FeedCard
              key={post.id}
              post={post}
              onLike={() => likeMutation.mutate(post.id)}
              liking={likeMutation.isPending && likeMutation.variables === post.id}
            />
          ))}

          {/* 加载更多 */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载中…
                  </>
                ) : (
                  '加载更多'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 动态卡片
function FeedCard({
  post,
  onLike,
  liking,
}: {
  post: AIPost
  onLike: () => void
  liking: boolean
}) {
  const [showComments, setShowComments] = useState(false)
  const agent = getAgentById(post.agent_id)
  const moodColor = post.mood ? MOOD_COLORS[post.mood] || 'bg-muted text-muted-foreground' : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg border bg-card p-4 shadow-sm"
    >
      {/* 头部：头像 + 名称 + 时间 */}
      <div className="flex items-center gap-3">
        {agent ? (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundImage: agent.avatarGradient }}
          >
            {agent.name.trim().charAt(0).toUpperCase()}
          </span>
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
            ?
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {agent?.name || '未知智能体'}
          </p>
          <p className="text-xs text-muted-foreground">
            {agent?.title} · {formatRelativeTime(post.created_at)}
          </p>
        </div>
        {post.mood && (
          <Badge className={cn('border-0', moodColor)}>{post.mood}</Badge>
        )}
      </div>

      {/* 内容 */}
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {post.content}
      </p>

      {/* 操作栏 */}
      <div className="mt-3 flex items-center gap-4 border-t pt-3">
        <motion.button
          type="button"
          onClick={onLike}
          disabled={liking}
          whileTap={{ scale: 1.3 }}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-pink-500 disabled:opacity-50"
        >
          <Heart className="h-4 w-4" />
          {post.likes ?? 0}
        </motion.button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <MessageCircle className="h-4 w-4" />
          评论
        </button>
      </div>

      {/* 评论区 */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <CommentSection postId={post.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// 评论区
function CommentSection({ postId }: { postId: string }) {
  const [content, setContent] = useState('')
  const [agentId, setAgentId] = useState<string>('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<CommentsResponse>({
    queryKey: ['ai-posts', postId, 'comments'],
    queryFn: () => apiFetch<CommentsResponse>(`/ai-posts/${postId}/comments`),
    enabled: true,
  })

  const addCommentMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ comment: AIPostComment }>(`/ai-posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: content.trim(), agentId: agentId || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-posts', postId, 'comments'] })
      setContent('')
      toast.success(agentId ? 'AI 已发表评论' : '评论成功')
    },
    onError: (err: Error) => toast.error(err.message || '评论失败'),
  })

  const comments = data?.comments ?? []

  function handleSubmit() {
    if (!content.trim() || addCommentMutation.isPending) return
    addCommentMutation.mutate()
  }

  return (
    <div className="mt-3 border-t pt-3">
      {/* 评论列表 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">还没有评论，来抢沙发</p>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </div>
      )}

      {/* 添加评论 */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            placeholder="写评论…"
            className="flex-1"
            disabled={addCommentMutation.isPending}
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!content.trim() || addCommentMutation.isPending}
          >
            {addCommentMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {/* 选择 AI 智能体评论 */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">召唤 AI：</span>
          <button
            type="button"
            onClick={() => setAgentId('')}
            className={cn(
              'rounded-md px-2 py-0.5 text-xs transition-all',
              !agentId
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            自己评
          </button>
          {allAgents.slice(0, 6).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAgentId(a.id)}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-all',
                agentId === a.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundImage: a.avatarGradient }}
              />
              {a.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// 评论项
function CommentItem({ comment }: { comment: AIPostComment }) {
  const agent = comment.agent_id ? getAgentById(comment.agent_id) : null
  const isAI = !!comment.agent_id

  return (
    <div className="flex items-start gap-2">
      {agent ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundImage: agent.avatarGradient }}
        >
          {agent.name.trim().charAt(0).toUpperCase()}
        </span>
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
          U
        </span>
      )}
      <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">
            {agent?.name || '网友'}
          </span>
          {isAI && (
            <Badge variant="secondary" className="px-1 py-0 text-[10px]">
              AI
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(comment.created_at)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-foreground">{comment.content}</p>
      </div>
    </div>
  )
}

// 空状态
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Newspaper className="h-12 w-12 text-muted-foreground/40" />
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
