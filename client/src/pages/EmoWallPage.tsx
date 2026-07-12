// =====================================================================
// 深夜emo墙
// ---------------------------------------------------------------------
// - 瀑布流卡片展示匿名发布
// - 每张卡片：匿名昵称/内容/AI评论/点赞
// - 发布框（输入内容 + 提交，显示生成的匿名昵称）
// - AI 评论区域（带智能体头像）
// - 暗黑/emo 风格的视觉设计
// =====================================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Heart, Moon, Send, Loader2, Ghost } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getAgentById } from '@shared/agents'

interface EmoPost {
  id: string
  anonymous_name: string
  content: string
  ai_comment: string | null
  ai_agent_id: string | null
  likes: number
  created_at: string
}

interface EmoListResponse {
  posts: EmoPost[]
  total: number
  page: number
  limit: number
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

// 暗黑配色卡片
const EMO_GRADIENTS = [
  'from-slate-900 to-slate-800',
  'from-purple-950 to-slate-900',
  'from-indigo-950 to-slate-900',
  'from-gray-900 to-slate-800',
  'from-zinc-900 to-slate-900',
]

export function EmoWallPage() {
  const [page, setPage] = useState(1)
  const [content, setContent] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery<EmoListResponse>({
    queryKey: ['emo-wall', page],
    queryFn: () => apiFetch<EmoListResponse>(`/emo-wall?page=${page}&limit=${PAGE_SIZE}`),
  })

  const likeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean; likes: number }>(`/emo-wall/${id}/like`, {
        method: 'POST',
      }),
    onSuccess: (res, id) => {
      queryClient.setQueriesData<EmoListResponse>(
        { queryKey: ['emo-wall'] },
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

  const publishMutation = useMutation({
    mutationFn: (text: string) =>
      apiFetch<{ post: EmoPost }>('/emo-wall', {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      }),
    onSuccess: (res) => {
      toast.success(`发布成功！你的匿名昵称是「${res.post.anonymous_name}」`)
      queryClient.invalidateQueries({ queryKey: ['emo-wall'] })
      setContent('')
    },
    onError: (err: Error) => toast.error(err.message || '发布失败'),
  })

  const posts = data?.posts ?? []
  const total = data?.total ?? 0
  const hasMore = posts.length < total

  function handlePublish() {
    const text = content.trim()
    if (!text || publishMutation.isPending) return
    if (text.length < 5) {
      toast.error('至少写 5 个字吧，emo 也要有诚意')
      return
    }
    publishMutation.mutate(text)
  }

  return (
    <div className="animate-fade-in min-h-dvh bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* 头部 */}
        <header className="mb-6 text-center">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-4xl font-extrabold text-transparent"
          >
            深夜 emo 墙
          </motion.h1>
          <p className="mt-2 text-sm text-slate-400">
            凌晨三点的灵魂，在这里匿名安放。AI 会来陪你聊两句
          </p>
          <div className="mt-3 flex items-center justify-center gap-1 text-slate-500">
            <Moon className="h-4 w-4" />
            <span className="text-xs">夜深了，注意休息</span>
          </div>
        </header>

        {/* 发布框 */}
        <div className="mb-8 rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 backdrop-blur">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="深夜了，想对这个世界说点什么…（匿名发布，AI 会来评论你）"
            rows={3}
            maxLength={500}
            disabled={publishMutation.isPending}
            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">{content.length} / 500</span>
            <Button
              onClick={handlePublish}
              disabled={!content.trim() || publishMutation.isPending}
              className="gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  发布中…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  匿名发布
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 列表 */}
        {isLoading && posts.length === 0 ? (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="mb-4 h-40 w-full break-inside-avoid bg-slate-800" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            title="加载失败"
            description={error instanceof Error ? error.message : '请稍后重试'}
          />
        ) : posts.length === 0 ? (
          <EmptyState
            title="这面墙还是空的"
            description="做第一个写下心事的人吧"
          />
        ) : (
          <>
            {/* 瀑布流 */}
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [column-fill:_balance]">
              {posts.map((post, i) => (
                <EmoCard
                  key={post.id}
                  post={post}
                  gradient={EMO_GRADIENTS[i % EMO_GRADIENTS.length]}
                  onLike={() => likeMutation.mutate(post.id)}
                  liking={likeMutation.isPending && likeMutation.variables === post.id}
                />
              ))}
            </div>

            {/* 加载更多 */}
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={isLoading}
                  className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
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
          </>
        )}
      </div>
    </div>
  )
}

// emo 卡片
function EmoCard({
  post,
  gradient,
  onLike,
  liking,
}: {
  post: EmoPost
  gradient: string
  onLike: () => void
  liking: boolean
}) {
  const aiAgent = post.ai_agent_id ? getAgentById(post.ai_agent_id) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`mb-4 break-inside-avoid rounded-xl border border-slate-700/40 bg-gradient-to-br ${gradient} p-4 shadow-lg backdrop-blur`}
    >
      {/* 匿名昵称 */}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800">
          <Ghost className="h-4 w-4 text-purple-300" />
        </span>
        <span className="text-sm font-medium text-slate-300">{post.anonymous_name}</span>
        <span className="ml-auto text-[10px] text-slate-500">
          {formatRelativeTime(post.created_at)}
        </span>
      </div>

      {/* 内容 */}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
        {post.content}
      </p>

      {/* AI 评论 */}
      {post.ai_comment && (
        <div className="mt-3 rounded-lg border border-purple-800/30 bg-purple-950/30 p-2.5">
          <div className="flex items-center gap-1.5">
            {aiAgent ? (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ backgroundImage: aiAgent.avatarGradient }}
              >
                {aiAgent.name.trim().charAt(0).toUpperCase()}
              </span>
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-800 text-[9px]">
                AI
              </span>
            )}
            <span className="text-xs font-medium text-purple-300">
              {aiAgent?.name || 'AI'} 来评论了
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{post.ai_comment}</p>
        </div>
      )}

      {/* 点赞 */}
      <div className="mt-3 flex items-center justify-end">
        <motion.button
          type="button"
          onClick={onLike}
          disabled={liking}
          whileTap={{ scale: 1.3 }}
          className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-pink-400 disabled:opacity-50"
        >
          <Heart className="h-3.5 w-3.5" />
          {post.likes ?? 0}
        </motion.button>
      </div>
    </motion.div>
  )
}

// 空状态
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Moon className="h-12 w-12 text-slate-600" />
      <h3 className="mt-4 text-lg font-semibold text-slate-300">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  )
}
