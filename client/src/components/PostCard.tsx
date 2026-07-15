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

/** 动态卡片 */
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

  return (
    <article className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
      {/* 作者信息 */}
      <div className="flex items-start gap-3">
        <Link to={`/profile/${post.user_id}`}>
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-primary to-amber-500 text-white">
              {post.author?.nickname?.[0]?.toUpperCase() ?? 'U'}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link to={`/profile/${post.user_id}`} className="truncate text-sm font-semibold text-gray-900 hover:underline dark:text-gray-100">
              {post.author?.nickname ?? '未知用户'}
            </Link>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatRelativeTime(post.created_at)}
            </span>
          </div>

          {/* 内容 */}
          <div className="mt-1">
            {post.type === 'text' && post.content && (
              <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                <Markdown content={post.content} />
              </div>
            )}

            {post.type === 'conversation_share' && (
              <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <MessageSquare className="h-3.5 w-3.5" />
                  分享了一段 AI 对话
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {(post.metadata as { preview?: string })?.preview || post.content || '点击查看对话内容'}
                </p>
              </div>
            )}

            {post.type === 'project_share' && (
              <Link
                to={`/vibe-code/${(post.metadata as { projectId?: string })?.projectId ?? ''}`}
                className="mt-2 block rounded-xl border border-gray-200 bg-gray-50 p-3 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-800"
              >
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <Code2 className="h-3.5 w-3.5" />
                  分享了一个 Vibe Code 项目
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {(post.metadata as { title?: string })?.title || '未命名项目'}
                </p>
                {(post.metadata as { description?: string })?.description && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {(post.metadata as { description?: string }).description}
                  </p>
                )}
              </Link>
            )}

            {post.type === 'image_share' && (post.metadata as { url?: string })?.url && (
              <div className="mt-2 overflow-hidden rounded-xl">
                <img
                  src={(post.metadata as { url: string }).url}
                  alt="分享的图片"
                  className="max-w-full rounded-xl border border-gray-200 dark:border-gray-700"
                  loading="lazy"
                />
              </div>
            )}

            {post.type === 'repost' && (
              <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <Repeat2 className="h-3.5 w-3.5" />
                  转发了动态
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{post.content || '（无附加文本）'}</p>
              </div>
            )}
          </div>

          {/* 互动栏 */}
          <div className="mt-2 flex items-center gap-6 text-gray-400 dark:text-gray-500">
            <button
              onClick={handleLike}
              className="flex items-center gap-1.5 text-xs transition-colors hover:text-red-500"
            >
              <Heart className={cn('h-4 w-4', liked && 'fill-red-500 text-red-500')} />
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>

            <button
              onClick={handleShowComments}
              className="flex items-center gap-1.5 text-xs transition-colors hover:text-primary"
            >
              <MessageCircle className="h-4 w-4" />
              {post.comment_count > 0 && <span>{post.comment_count}</span>}
            </button>

            <button
              onClick={handleRepost}
              className="flex items-center gap-1.5 text-xs transition-colors hover:text-green-500"
            >
              <Repeat2 className="h-4 w-4" />
            </button>

            <button
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/post/${post.id}`)
                toast.success('链接已复制')
              }}
              className="flex items-center gap-1.5 text-xs transition-colors hover:text-primary"
            >
              <Share2 className="h-4 w-4" />
            </button>

            {user?.id === post.user_id && (
              <button
                onClick={handleDelete}
                className="ml-auto flex items-center gap-1 text-xs transition-colors hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 评论区域 */}
          {showComments && (
            <div className="mt-3 space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-xs">{c.author?.nickname?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="rounded-xl bg-gray-100 px-3 py-1.5 dark:bg-gray-800">
                      <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{c.author?.nickname ?? '用户'}</span>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{c.content}</p>
                    </div>
                    <span className="mt-0.5 block text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(c.created_at)}</span>
                  </div>
                </div>
              ))}

              {/* 评论输入框 */}
              {user && (
                <div className="flex gap-2">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-xs">{profile?.nickname?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 gap-2">
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !commentLoading) handleComment() }}
                      placeholder="写评论..."
                      className="flex-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900"
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
      </div>
    </article>
  )
}
