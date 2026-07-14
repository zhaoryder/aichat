// 创意工坊首页：9 个功能入口卡片 + 我的作品列表
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Code2,
  Image as ImageIcon,
  Video,
  FileText,
  Newspaper,
  Mic,
  Palette,
  Smile,
  Workflow,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import type { CreativeWork } from '@shared/types'

// 9 个功能入口配置：lucide 图标 + 标题 + 描述 + 路由
const STUDIO_ENTRIES: {
  to: string
  title: string
  desc: string
  icon: React.ReactNode
  gradient: string
}[] = [
  {
    to: '/studio/vibe-code',
    title: '网页工程',
    desc: 'Vibe Coding 自然语言生成代码',
    icon: <Code2 className="h-7 w-7" />,
    gradient: 'from-indigo-500 to-blue-500',
  },
  {
    to: '/studio/image',
    title: 'AI 绘画',
    desc: 'CogView4 文生图',
    icon: <ImageIcon className="h-7 w-7" />,
    gradient: 'from-amber-400 to-orange-500',
  },
  {
    to: '/studio/video',
    title: '短视频创作',
    desc: 'AI 生成短视频',
    icon: <Video className="h-7 w-7" />,
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    to: '/studio/script',
    title: '剧本创作',
    desc: '编剧，多角色对白',
    icon: <FileText className="h-7 w-7" />,
    gradient: 'from-emerald-500 to-teal-500',
  },
  {
    to: '/studio/article',
    title: '文章生成',
    desc: '长文创作',
    icon: <Newspaper className="h-7 w-7" />,
    gradient: 'from-cyan-500 to-blue-500',
  },
  {
    to: '/studio/voice',
    title: '语音合成',
    desc: 'TTS 语音朗读',
    icon: <Mic className="h-7 w-7" />,
    gradient: 'from-rose-500 to-pink-500',
  },
  {
    to: '/studio/poster',
    title: '趣味海报',
    desc: '模板 + 配色，一键生成',
    icon: <Palette className="h-7 w-7" />,
    gradient: 'from-violet-500 to-purple-500',
  },
  {
    to: '/studio/meme',
    title: '表情包制作',
    desc: '文字 + 模板，快速出图',
    icon: <Smile className="h-7 w-7" />,
    gradient: 'from-yellow-400 to-amber-500',
  },
  {
    to: '/studio/pipeline',
    title: '多媒体流水线',
    desc: '图片+视频+文章一站式',
    icon: <Workflow className="h-7 w-7" />,
    gradient: 'from-fuchsia-500 to-pink-500',
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
              className="hover-lift flex h-full items-start gap-4 p-6 transition-transform duration-300 ease-out hover:scale-[1.02]"
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <Skeleton className="size-12 rounded" />
                </div>
              </Card>
            ))}
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
                      <Badge variant="default">{TYPE_LABEL[work.type]}</Badge>
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
                        ? 'default'
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
