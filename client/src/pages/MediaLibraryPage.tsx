// =====================================================================
// 我的素材库
// --------------------------------------------------------------------
// - 顶部渐变标题 + 副标题
// - 过滤栏：全部 / 图片 / 视频（toggle 风格）
// - 搜索框（300ms 防抖）
// - 瀑布流网格：image 显示缩略图，video 显示渐变占位
// - 卡片悬停：显示操作浮层（复制 URL / 下载 / 删除）
// - 加载骨架屏 + 空状态 + 删除二次确认
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Search,
  Image as ImageIcon,
  Video,
  Download,
  Copy,
  Trash2,
  Link,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

// ---------- 类型 ----------
type MediaType = 'image' | 'video' | 'audio'

interface MediaAsset {
  id: string
  user_id: string
  type: MediaType
  url: string
  prompt: string | null
  title: string | null
  project_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

interface MediaListResponse {
  assets: MediaAsset[]
  total: number
  page: number
  pageSize: number
}

// ---------- 常量 ----------
type FilterKey = 'all' | 'image' | 'video'

const FILTERS: { key: FilterKey; label: string; type?: MediaType }[] = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图片', type: 'image' },
  { key: 'video', label: '视频', type: 'video' },
]

const PAGE_SIZE = 50

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

// =====================================================================
// 主页面
// =====================================================================
export function MediaLibraryPage() {
  const { user } = useAuth()

  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [page] = useState(1)
  const [total, setTotal] = useState(0)

  // 防抖搜索：searchInput 立即更新输入框，search 延迟 300ms 应用到查询
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim())
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  // 拉取列表
  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      const activeFilter = FILTERS.find((f) => f.key === filter)
      if (activeFilter?.type) params.set('type', activeFilter.type)
      if (search) params.set('search', search)

      const res = await apiFetch<MediaListResponse>(
        `/media?${params.toString()}`,
      )
      setAssets(res.assets || [])
      setTotal(res.total ?? 0)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [page, filter, search])

  useEffect(() => {
    if (!user) return
    void fetchList()
  }, [user, fetchList])

  // 删除素材
  async function handleDelete(asset: MediaAsset) {
    const confirmed = window.confirm(
      `确定要删除这个素材吗？\n${asset.title || asset.prompt || asset.url}`,
    )
    if (!confirmed) return

    try {
      await apiFetch<{ success: boolean }>(`/media/${asset.id}`, {
        method: 'DELETE',
      })
      toast.success('已删除')
      await fetchList()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败'
      toast.error(msg)
    }
  }

  // 复制 URL 到剪贴板
  async function handleCopyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('已复制链接')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  // 下载素材
  function handleDownload(asset: MediaAsset) {
    try {
      const a = document.createElement('a')
      a.href = asset.url
      a.download = asset.title || `media-${asset.id}`
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast.error('下载失败')
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6">
        <h1 className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-3xl font-extrabold text-transparent">
          我的素材库
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理你产生的图片与视频素材，复制链接或下载随时取用
        </p>
      </header>

      {/* 过滤栏 + 搜索 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                filter === f.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.key === 'image' && <ImageIcon className="h-4 w-4" />}
              {f.key === 'video' && <Video className="h-4 w-4" />}
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索 prompt 或标题…"
            className="pl-9"
          />
        </div>
      </div>

      {/* 总数提示 */}
      {!loading && !error && assets.length > 0 && (
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">共 {total} 项</Badge>
        </div>
      )}

      {/* 内容区 */}
      {loading && assets.length === 0 ? (
        <MediaGridSkeleton />
      ) : error ? (
        <EmptyState
          icon={<Link className="h-12 w-12" />}
          title="加载失败"
          description={error}
        />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-12 w-12" />}
          title="还没有素材"
          description="去创意工坊生成一些图片或视频，它们会自动保存到这里"
        />
      ) : (
        <div className="columns-2 gap-4 md:columns-3 lg:columns-4 [column-fill:_balance]">
          {assets.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              onCopyUrl={() => handleCopyUrl(asset.url)}
              onDownload={() => handleDownload(asset)}
              onDelete={() => handleDelete(asset)}
            />
          ))}
        </div>
      )}

      {/* 已加载完成但搜索无结果时的二次提示 */}
      {!loading && !error && assets.length === 0 && total === 0 && (
        <div className="mt-6 text-center text-xs text-muted-foreground">
          提示：尝试更换关键词或筛选条件
        </div>
      )}
    </div>
  )
}

// =====================================================================
// 单个素材卡片
// =====================================================================
interface MediaCardProps {
  asset: MediaAsset
  onCopyUrl: () => void
  onDownload: () => void
  onDelete: () => void
}

function MediaCard({ asset, onCopyUrl, onDownload, onDelete }: MediaCardProps) {
  return (
    <div className="mb-4 break-inside-avoid">
      <Card className="hover-lift group overflow-hidden p-0">
        {/* 缩略区 */}
        <div className="relative overflow-hidden">
          {asset.type === 'image' ? (
            <img
              src={asset.url}
              alt={asset.title || asset.prompt || '素材'}
              loading="lazy"
              className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.opacity = '0.3'
              }}
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
              <Video className="h-12 w-12 text-white/90" />
            </div>
          )}

          {/* 类型徽章 */}
          <div className="absolute left-2 top-2">
            <Badge
              variant="secondary"
              className="bg-black/60 text-white backdrop-blur-sm"
            >
              {asset.type === 'image' ? '图片' : asset.type === 'video' ? '视频' : '音频'}
            </Badge>
          </div>

          {/* 悬停浮层操作 */}
          <div className="absolute inset-0 flex items-end justify-center gap-2 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9"
              title="复制 URL"
              onClick={onCopyUrl}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9"
              title="下载"
              onClick={onDownload}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-9 w-9"
              title="删除"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 信息 */}
        <div className="p-3">
          {asset.title && (
            <h3 className="truncate text-sm font-semibold text-foreground">
              {asset.title}
            </h3>
          )}
          {asset.prompt && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {asset.prompt}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground/70">
              {formatRelativeTime(asset.created_at)}
            </span>
            <button
              type="button"
              onClick={onCopyUrl}
              className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-indigo-500 dark:hover:text-indigo-400"
              title="复制 URL"
            >
              <Link className="h-3 w-3" />
              复制
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// =====================================================================
// 加载骨架屏
// =====================================================================
function MediaGridSkeleton() {
  return (
    <div className="columns-2 gap-4 md:columns-3 lg:columns-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="mb-4 break-inside-avoid">
          <Card className="overflow-hidden p-0">
            <Skeleton
              className="w-full"
              style={{ height: `${180 + (i % 4) * 60}px` }}
            />
            <div className="p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          </Card>
        </div>
      ))}
    </div>
  )
}
