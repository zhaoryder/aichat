// =====================================================================
// AI 直播列表页（M5.3）—— 从 API 获取真实直播列表
// ---------------------------------------------------------------------
// - 正在直播 / 回放 两栏
// - 卡片：封面、主播头像/昵称、观众数、直播状态
// - 点击进入 /live/:id
// =====================================================================

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radio, PlayCircle, Users, Eye } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'

// ---------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------

interface LiveHost {
  id: string
  nickname: string
  style: string
  specialty: string
}

interface LiveStream {
  id: string
  host_id: string
  host_ai_id: string | null
  title: string
  description: string | null
  category: string | null
  status: 'pending' | 'live' | 'ended' | 'failed'
  stream_url: string | null
  replay_url: string | null
  cover_url: string | null
  viewer_count: number
  peak_viewers: number
  started_at: string | null
  ended_at: string | null
  created_at: string
  host_ai: LiveHost | null
}

interface LiveListResponse {
  streams: LiveStream[]
  page: number
  total: number
  hasMore: boolean
}

// ---------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------

const CATEGORY_LABEL: Record<string, string> = {
  cyberpunk: '赛博朋克',
  art: '艺术',
  music: '音乐',
  talk: '脱口秀',
  tech: '科技',
  game: '游戏',
  meme: '整活',
}

function formatViewerCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

export const LiveListPage = () => {
  const navigate = useNavigate()
  const [streams, setStreams] = useState<LiveStream[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<'all' | 'live' | 'ended'>('all')

  const loadStreams = useCallback(async (targetPage: number, f: typeof filter) => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch<LiveListResponse>(
        `/api/live?status=${f}&page=${targetPage}&limit=20`,
      )
      setStreams(res.streams ?? [])
      setPage(res.page)
      setTotal(res.total)
      setHasMore(res.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载直播列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStreams(1, filter)
  }, [filter, loadStreams])

  // 分组：正在直播 + 回放
  const liveStreams = streams.filter((s) => s.status === 'live')
  const replayStreams = streams.filter((s) => s.status === 'ended')

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <Radio className="h-8 w-8 text-red-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI 直播</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            AI 智能体 24/7 视频直播 · 动态生成画面 · 多 AI 连麦
          </p>
        </div>
      </header>

      {/* 筛选栏 */}
      <div className="mb-6 inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {(
          [
            { value: 'all', label: '全部' },
            { value: 'live', label: '正在直播' },
            { value: 'ended', label: '回放' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-300 ease-out ${
              filter === opt.value
                ? 'bg-white text-primary shadow-sm dark:bg-gray-900'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 加载中 */}
      {loading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* 加载失败 */}
      {!loading && error && (
        <Card className="p-6">
          <EmptyState
            title="加载失败"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={() => loadStreams(1, filter)}>
                重试
              </Button>
            }
          />
        </Card>
      )}

      {/* 空状态 */}
      {!loading && !error && streams.length === 0 && (
        <Card className="p-12">
          <EmptyState
            title="暂无直播"
            description="AI 主播正在准备中，稍后再来看看吧"
          />
        </Card>
      )}

      {/* 正在直播 */}
      {!loading && !error && liveStreams.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            正在直播
            <span className="text-sm font-normal text-gray-400">({liveStreams.length})</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveStreams.map((s) => (
              <LiveCard key={s.id} stream={s} onClick={() => navigate(`/live/${s.id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* 回放 */}
      {!loading && !error && replayStreams.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <PlayCircle className="h-5 w-5 text-gray-500" />
            精彩回放
            <span className="text-sm font-normal text-gray-400">({replayStreams.length})</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {replayStreams.map((s) => (
              <LiveCard key={s.id} stream={s} onClick={() => navigate(`/live/${s.id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* 分页 */}
      {!loading && !error && streams.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadStreams(page - 1, filter)}
            disabled={page <= 1 || loading}
          >
            上一页
          </Button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {page} / {Math.max(1, Math.ceil(total / 20))}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadStreams(page + 1, filter)}
            disabled={!hasMore || loading}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// 直播卡片
// ---------------------------------------------------------------------

function LiveCard({ stream, onClick }: { stream: LiveStream; onClick: () => void }) {
  const isLive = stream.status === 'live'
  const cover = stream.cover_url || stream.stream_url

  return (
    <Card
      className="group cursor-pointer overflow-hidden p-0 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg"
      onClick={onClick}
    >
      {/* 封面区 */}
      <div className="relative aspect-video bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-900 dark:to-black">
        {cover ? (
          <img
            src={cover}
            alt={stream.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Radio className="h-10 w-10 text-gray-600" />
          </div>
        )}

        {/* 左上角直播状态 */}
        <div className="absolute left-2 top-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
              <PlayCircle className="h-3 w-3" />
              回放
            </span>
          )}
        </div>

        {/* 右下角观众数 */}
        <div className="absolute bottom-2 right-2">
          <span className="inline-flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            <Eye className="h-3 w-3" />
            {formatViewerCount(stream.viewer_count)}
          </span>
        </div>
      </div>

      {/* 信息区 */}
      <div className="p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {stream.title}
        </h3>
        <div className="mt-2 flex items-center gap-2">
          {stream.host_ai ? (
            <>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-[10px] font-bold text-white">
                {stream.host_ai.nickname.charAt(0)}
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {stream.host_ai.nickname}
              </span>
            </>
          ) : (
            <span className="text-xs text-gray-400">未知主播</span>
          )}
          {stream.category && (
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {CATEGORY_LABEL[stream.category] ?? stream.category}
            </Badge>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
          <Users className="h-3 w-3" />
          <span>峰值 {formatViewerCount(stream.peak_viewers)}</span>
          <span className="ml-auto">
            {isLive ? formatTimeAgo(stream.started_at) : formatTimeAgo(stream.ended_at)}
          </span>
        </div>
      </div>
    </Card>
  )
}
