import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Heart, MessageCircle, Repeat2, Share2, Trash2, Code2, MessageSquare } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import { cn } from '@/lib/utils'
import { toggleLike, createComment, getComments, repost, deletePost } from '@/lib/api'
import type { Post, Comment } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { formatRelativeTime } from '@/lib/utils'

/** 作品卡片 — 独立卡片式，适配瀑布流布局 */
export function PostCard({ post, onDelete }: { post: Post; onDelete?: (id: string) => void }) {
  const { user, profile } = useAuth()
  const [liked, setLiked] = useState(post.liked)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)

  const handleLike = useCallback(async () => {
    if (!user) {
      toast.info('请先登录')
      return
    }
    const prevLiked = liked
    setLiked(!prevLiked)
    setLikeCount((c) => c + (prevLiked ? -1 : 1))
    try {
      await toggleLike(post.id)
    } catch {
      setLiked(prevLiked)
      setLikeCount((c) => c + (prevLiked ? 1 : -1))
    }
  }, [post.id, liked, user])

  const handleComment = useCallback(async () => {
    if (!user || !commentText.trim()) return
    setCommentLoading(true)
    try {
      const { comment } = await createComment(post.id, commentText.trim())
      setComments((prev) => [...prev, comment])
      setCommentText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '评论失败')
    } finally {
      setCommentLoading(false)
    }
  }, [post.id, commentText, user])

  const handleShowComments = useCallback(async () => {
    if (!showComments) {
      try {
        const { comments: list } = await getComments(post.id)
        setComments(list)
      } catch {
        // ignore
      }
    }
    setShowComments((v) => !v)
  }, [post.id, showComments])

  const handleRepost = useCallback(async () => {
    if (!user) {
      toast.info('请先登录')
      return
    }
    try {
      await repost(post.id)
      toast.success('转发成功！')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '转发失败')
    }
  }, [post.id, user])

  const handleDelete = useCallback(async () => {
    if (!user || user.id !== post.user_id) return
    try {
      await deletePost(post.id)
      toast.success('已删除')
      onDelete?.(post.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }, [post.id, user, onDelete])

  // 是否有媒体内容（图片类型）
  const imageUrl = post.type === 'image_share'
    ? (post.metadata as { url?: string })?.url
    : null

  return (
    <article className="break-inside-avoid overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-all duration-300 ease-out hover:shadow-md">
      {/* 媒体区（图片类型放顶部大图） */}
      {imageUrl && (
        <Link to={`/post/${post.id}`}>
          <img
            src={imageUrl}
            alt="作品图片"
            className="w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
            loading="lazy"
          />
        </Link>
      )}

      <div className="p-4">
        {/* 作者信息 */}
        <div className="mb-3 flex items-center gap-2">
          <Link to={`/profile/${post.user_id}`}>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-[hsl(var(--muted))] text-xs text-[hsl(var(--foreground))]">
                {post.author?.nickname?.[0]?.toUpperCase() ?? 'U'}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              to={`/profile/${post.user_id}`}
              className="block truncate text-sm font-medium text-[hsl(var(--foreground))] hover:underline"
            >
              {post.author?.nickname ?? '未知用户'}
            </Link>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {formatRelativeTime(post.created_at)}
            </span>
          </div>
          {user?.id === post.user_id && (
            <button
              onClick={handleDelete}
              className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--destructive))]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 内容 */}
        {post.type === 'text' && post.content && (
          <div className="text-sm leading-relaxed text-[hsl(var(--foreground))]">
            <Markdown content={post.content} />
          </div>
        )}

        {post.type === 'conversation_share' && (
          <Link
            to={`/post/${post.id}`}
            className="block rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-3 transition-colors hover:bg-[hsl(var(--muted))]"
          >
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
              <MessageSquare className="h-3.5 w-3.5" />
              AI 对话
            </div>
            <p className="line-clamp-3 text-sm text-[hsl(var(--foreground))]">
              {(post.metadata as { preview?: string })?.preview || post.content || '点击查看对话内容'}
            </p>
          </Link>
        )}

        {post.type === 'project_share' && (
          <Link
            to={`/vibe-code/${(post.metadata as { projectId?: string })?.projectId ?? ''}`}
            className="block rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-3 transition-colors hover:bg-[hsl(var(--muted))]"
          >
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
              <Code2 className="h-3.5 w-3.5" />
              Vibe Code 项目
            </div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              {(post.metadata as { title?: string })?.title || '未命名项目'}
            </p>
            {(post.metadata as { description?: string })?.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
                {(post.metadata as { description?: string }).description}
              </p>
            )}
          </Link>
        )}

        {post.type === 'repost' && (
          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
              <Repeat2 className="h-3.5 w-3.5" />
              转发
            </div>
            <p className="text-sm text-[hsl(var(--foreground))]">{post.content || '（无附加文本）'}</p>
          </div>
        )}

        {/* 互动栏 */}
        <div className="mt-3 flex items-center gap-4 text-[hsl(var(--muted-foreground))]">
          <button
            onClick={handleLike}
            className="flex items-center gap-1 text-xs transition-colors hover:text-[hsl(var(--destructive))]"
          >
            <Heart className={cn('h-4 w-4', liked && 'fill-[hsl(var(--destructive))] text-[hsl(var(--destructive))]')} />
            {likeCount > 0 && <span>{likeCount}</span>}
          </button>

          <button
            onClick={handleShowComments}
            className="flex items-center gap-1 text-xs transition-colors hover:text-[hsl(var(--foreground))]"
          >
            <MessageCircle className="h-4 w-4" />
            {post.comment_count > 0 && <span>{post.comment_count}</span>}
          </button>

          <button
            onClick={handleRepost}
            className="flex items-center gap-1 text-xs transition-colors hover:text-[hsl(var(--foreground))]"
          >
            <Repeat2 className="h-4 w-4" />
          </button>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}/post/${post.id}`)
              toast.success('链接已复制')
            }}
            className="flex items-center gap-1 text-xs transition-colors hover:text-[hsl(var(--foreground))]"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {/* 评论区域 */}
        {showComments && (
          <div className="mt-3 space-y-2 border-t border-[hsl(var(--border))] pt-3">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className="bg-[hsl(var(--muted))] text-[10px]">
                    {c.author?.nickname?.[0]?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="rounded-lg bg-[hsl(var(--muted))] px-3 py-1.5">
                    <span className="text-xs font-medium text-[hsl(var(--foreground))]">{c.author?.nickname ?? '用户'}</span>
                    <p className="text-sm text-[hsl(var(--foreground))]">{c.content}</p>
                  </div>
                  <span className="mt-0.5 block text-xs text-[hsl(var(--muted-foreground))]">{formatRelativeTime(c.created_at)}</span>
                </div>
              </div>
            ))}

            {user && (
              <div className="flex gap-2">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className="bg-[hsl(var(--muted))] text-[10px]">
                    {profile?.nickname?.[0]?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 gap-2">
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !commentLoading) handleComment() }}
                    placeholder="写评论..."
                    className="flex-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1 text-sm outline-none focus:border-[hsl(var(--accent))]"
                  />
                  <Button size="sm" variant="ghost" onClick={handleComment} disabled={commentLoading || !commentText.trim()}>
                    发送
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
