// =====================================================================
// AI 绘画广场
// ---------------------------------------------------------------------
// - 瀑布流（CSS columns）展示公开 AI 图片
// - 排序切换：最新 / 最热
// - 点赞按钮（framer-motion 心跳动画）
// - 加载更多分页
// - 加载骨架屏 + 空状态 + 错误提示
// =====================================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Heart, Flame, Clock, ImageOff } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Sort = 'latest' | 'popular'

interface GalleryImage {
  id: string
  user_id: string
  prompt: string
  url: string
  title: string
  is_public: boolean
  likes: number
  created_at: string
}

interface GalleryListResponse {
  images: GalleryImage[]
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

export function GalleryPage() {
  const [sort, setSort] = useState<Sort>('latest')
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  // 拉取图片列表
  const { data, isLoading, isError, error } = useQuery<GalleryListResponse>({
    queryKey: ['gallery', sort, page],
    queryFn: () =>
      apiFetch<GalleryListResponse>(
        `/gallery/images?page=${page}&limit=${PAGE_SIZE}&sort=${sort}`,
      ),
  })

  // 点赞 mutation
  const likeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/gallery/images/${id}/like`, {
        method: 'POST',
      }),
    onSuccess: (_data, id) => {
      // 乐观更新缓存中的图片 likes
      queryClient.setQueriesData<GalleryListResponse>(
        { queryKey: ['gallery'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            images: old.images.map((img) =>
              img.id === id ? { ...img, likes: img.likes + 1 } : img,
            ),
          }
        },
      )
      toast.success('点赞成功')
    },
    onError: (err: Error) => toast.error(err.message || '点赞失败'),
  })

  const images = data?.images ?? []
  const total = data?.total ?? 0
  const hasMore = images.length < total && !isLoading

  function handleSortChange(next: Sort) {
    if (next === sort) return
    setSort(next)
    setPage(1)
  }

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6">
        <h1 className="bg-gradient-to-r from-primary via-pink-500 to-orange-500 bg-clip-text text-3xl font-extrabold text-transparent">
          AI 绘画广场
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          看看大家用 AI 画了什么神奇玩意儿，给喜欢的作品点个心心
        </p>
      </header>

      {/* 排序切换 */}
      <div className="mb-6 flex items-center gap-2 rounded-lg bg-muted p-1 w-fit">
        <button
          type="button"
          onClick={() => handleSortChange('latest')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
            sort === 'latest'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Clock className="h-4 w-4" />
          最新
        </button>
        <button
          type="button"
          onClick={() => handleSortChange('popular')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
            sort === 'popular'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Flame className="h-4 w-4" />
          最热
        </button>
      </div>

      {/* 内容区 */}
      {isLoading && images.length === 0 ? (
        <GallerySkeleton />
      ) : isError ? (
        <EmptyState
          title="加载失败"
          description={error instanceof Error ? error.message : '请稍后重试'}
        />
      ) : images.length === 0 ? (
        <EmptyState
          title="还没有作品"
          description="去创意工坊画一张，发布到广场让大家瞧瞧吧"
        />
      ) : (
        <>
          {/* 瀑布流：CSS columns 实现 */}
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 [column-fill:_balance]">
            {images.map((img) => (
              <ImageCard
                key={img.id}
                image={img}
                onLike={() => likeMutation.mutate(img.id)}
                liking={likeMutation.isPending && likeMutation.variables === img.id}
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
              >
                {isLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
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
  )
}

// 图片卡片
function ImageCard({
  image,
  onLike,
  liking,
}: {
  image: GalleryImage
  onLike: () => void
  liking: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-4 break-inside-avoid"
    >
      <div className="group overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md">
        {/* 图片 */}
        <div className="relative overflow-hidden">
          <img
            src={image.url}
            alt={image.title || image.prompt}
            loading="lazy"
            className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>
        {/* 信息 */}
        <div className="p-3">
          {image.title && (
            <h3 className="truncate text-sm font-semibold text-foreground">
              {image.title}
            </h3>
          )}
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {image.prompt}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground/70">
              {formatRelativeTime(image.created_at)}
            </span>
            <motion.button
              type="button"
              onClick={onLike}
              disabled={liking}
              whileTap={{ scale: 1.3 }}
              whileHover={{ scale: 1.15 }}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-pink-500 dark:hover:text-pink-400 disabled:opacity-50"
            >
              <motion.span
                animate={liking ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <Heart className="h-4 w-4 fill-none" />
              </motion.span>
              {image.likes ?? 0}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// 骨架屏
function GallerySkeleton() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="mb-4 break-inside-avoid">
          <Skeleton className="w-full" style={{ height: `${200 + (i % 4) * 60}px` }} />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-1 h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

// 空状态
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ImageOff className="h-12 w-12 text-muted-foreground/40" />
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
