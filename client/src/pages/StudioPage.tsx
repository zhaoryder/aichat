// 创意工坊首页：6 个功能入口卡片 + 我的作品列表
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui-legacy/Card'
import { Badge } from '@/components/ui-legacy/Badge'
import { Spinner } from '@/components/ui-legacy/Spinner'
import { EmptyState } from '@/components/ui-legacy/EmptyState'
import { Button } from '@/components/ui-legacy/Button'
import type { CreativeWork } from '@shared/types'

// 6 个功能入口配置：图标（inline SVG）+ 标题 + 描述 + 路由
const STUDIO_ENTRIES: {
  to: string
  title: string
  desc: string
  icon: React.ReactNode
}[] = [
  {
    to: '/studio/script',
    title: '搞笑剧本',
    desc: '编剧，多角色对白',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h12a2 2 0 012 2v14H6a2 2 0 01-2-2V4z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 8h2v12H8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 9h6M8 13h6M8 17h3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/studio/video',
    title: '搞笑视频',
    desc: 'AI 生成短视频',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="14" rx="2" strokeLinejoin="round" />
        <path d="M10 9l5 3-5 3V9z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/studio/image',
    title: '搞笑图片',
    desc: 'CogView4 文生图',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" strokeLinejoin="round" />
        <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
        <path d="M21 16l-5-5L5 20" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/studio/article',
    title: '搞笑文章',
    desc: '长文创作',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 3h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" strokeLinejoin="round" />
        <path d="M14 3v6h6M9 13h8M9 17h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/studio/vibe-code',
    title: 'Vibe 编程',
    desc: '自然语言生成代码',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 5l-2 14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/studio/voice',
    title: '搞笑语音',
    desc: 'TTS 语音合成',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 5L6 9H3v6h3l5 4V5z" strokeLinejoin="round" />
        <path d="M15.5 8.5a5 5 0 010 7M18.5 6a8 8 0 010 12" strokeLinecap="round" />
      </svg>
    ),
  },
]

// 作品类型 → 标签文案 / 颜色
const TYPE_LABEL: Record<CreativeWork['type'], string> = {
  script: '剧本',
  video: '视频',
  image: '图片',
  article: '文章',
  game: '游戏',
  voice: '语音',
}

// 相对时间格式化
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

export const StudioPage = () => {
  const { user, loading: authLoading } = useAuth()
  const [works, setWorks] = useState<CreativeWork[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 登录后才拉取作品列表
  useEffect(() => {
    if (!user) return
    let active = true
    setLoading(true)
    setError('')
    apiFetch<{ works: CreativeWork[] }>('/studio/works')
      .then((res) => {
        if (!active) return
        // 按创建时间倒序
        const sorted = [...(res.works ?? [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        setWorks(sorted)
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message || '加载作品失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user])

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      {/* 标题 */}
      <header className="mb-8 text-center">
        <h1 className="bg-gradient-to-r from-primary via-amber-400 to-orange-500 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
          创意工坊
        </h1>
        <p className="mt-3 text-base text-gray-600">用 AI 创造搞笑作品</p>
      </header>

      {/* 6 个功能入口卡片网格 */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {STUDIO_ENTRIES.map((entry) => (
          <Link key={entry.to} to={entry.to}>
            <Card
              hoverScale
              className="flex h-full items-start gap-4 p-6 transition-transform duration-300 ease-out hover:scale-[1.02]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                {entry.icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900">{entry.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{entry.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
      </section>

      {/* 我的作品 */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">我的作品</h2>
          {user && works.length > 0 && (
            <span className="text-sm text-gray-500">共 {works.length} 件</span>
          )}
        </div>

        {/* 未登录提示 */}
        {authLoading ? null : !user ? (
          <Card className="p-8">
            <EmptyState
              title="登录后开启创作"
              description="登录账号即可保存你的 AI 创作作品"
              action={
                <Button asChild>
                  <Link to="/auth/login">去登录</Link>
                </Button>
              }
            />
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : error ? (
          <Card className="p-6 text-center text-sm text-red-500">{error}</Card>
        ) : works.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              title="还没有作品"
              description="从上方选一个工具，开始你的第一次 AI 创作"
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {works.map((work) => (
              <Card key={work.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge variant="primary">{TYPE_LABEL[work.type]}</Badge>
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(work.created_at)}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium text-gray-800">
                      {work.title || '未命名作品'}
                    </p>
                  </div>
                  <Badge
                    variant={
                      work.status === 'done'
                        ? 'primary'
                        : work.status === 'failed'
                          ? 'secondary'
                          : 'default'
                    }
                  >
                    {work.status === 'done'
                      ? '已完成'
                      : work.status === 'failed'
                        ? '失败'
                        : work.status === 'processing'
                          ? '生成中'
                          : '待处理'}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
