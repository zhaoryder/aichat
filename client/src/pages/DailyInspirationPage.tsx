// =====================================================================
// 每日灵感页面（Daily Inspiration）— 特色功能
// ---------------------------------------------------------------------
// - 今日挑战卡片（主题 + 描述 + 倒计时 + 参与按钮）
// - 往期精选挑战列表
// - 点击"参与"跳转到创作工坊
// =====================================================================

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Clock, ArrowRight, Flame, Image, Video, FileText } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'

// ---------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------

interface DailyChallenge {
  id?: string
  date: string
  title: string
  description: string
  prompt: string
  type: 'image' | 'video' | 'text' | 'voice'
}

// ---------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------

const TYPE_ICON: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  text: FileText,
  voice: FileText,
}

const TYPE_LABEL: Record<string, string> = {
  image: 'AI 绘画',
  video: 'AI 视频',
  text: 'AI 写作',
  voice: 'AI 语音',
}

const TYPE_ROUTE: Record<string, string> = {
  image: '/studio/image',
  video: '/studio/video',
  text: '/studio/article',
  voice: '/studio/voice',
}

/** 计算到明天 0 点的剩余时间 */
function getRemainingTime(): { hours: number; minutes: number; seconds: number } {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  const diff = tomorrow.getTime() - now.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  return { hours, minutes, seconds }
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

export const DailyInspirationPage = () => {
  const navigate = useNavigate()
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null)
  const [history, setHistory] = useState<DailyChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const [remaining, setRemaining] = useState(getRemainingTime())

  const loadChallenge = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ challenge: DailyChallenge }>('/api/daily/today')
      setChallenge(res.challenge)
    } catch {
      // 静默
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch<{ challenges: DailyChallenge[] }>('/api/daily/history?limit=6')
      setHistory(res.challenges ?? [])
    } catch {
      // 静默
    }
  }, [])

  useEffect(() => {
    loadChallenge()
    loadHistory()
  }, [loadChallenge, loadHistory])

  // 倒计时
  useEffect(() => {
    const timer = setInterval(() => setRemaining(getRemainingTime()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleParticipate = () => {
    if (!challenge) return
    const route = TYPE_ROUTE[challenge.type] || '/publish'
    navigate(route)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  const TypeIcon = challenge ? TYPE_ICON[challenge.type] ?? Image : Image

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-8">
      {/* 页面标题 */}
      <header className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--accent)/0.1)] px-4 py-1.5">
          <Sparkles className="h-4 w-4 text-[hsl(var(--accent))]" />
          <span className="text-sm font-medium text-[hsl(var(--accent))]">每日灵感</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">
          今天，创作点什么？
        </h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          每天一个新主题 · 用 AI 释放你的创造力
        </p>
      </header>

      {/* 今日挑战卡片 */}
      {challenge && (
        <Card className="mb-8 overflow-hidden p-0 hover-lift">
          {/* 顶部渐变区 */}
          <div className="relative bg-gradient-to-br from-[#6366f1] via-[#8b5cf6] to-[#ec4899] p-8 text-white">
            <div className="absolute right-4 top-4">
              <Badge className="border-white/20 bg-white/10 text-white backdrop-blur">
                <TypeIcon className="mr-1 h-3 w-3" />
                {TYPE_LABEL[challenge.type] ?? 'AI 创作'}
              </Badge>
            </div>
            <div className="relative z-10">
              <p className="mb-2 text-sm font-medium text-white/80">今日挑战 · {challenge.date}</p>
              <h2 className="mb-3 text-2xl font-bold">{challenge.title}</h2>
              <p className="max-w-lg text-sm text-white/90">{challenge.description}</p>
            </div>
          </div>

          {/* 倒计时 + 参与按钮 */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <Clock className="h-4 w-4" />
              <span>
                剩余 {String(remaining.hours).padStart(2, '0')}:
                {String(remaining.minutes).padStart(2, '0')}:
                {String(remaining.seconds).padStart(2, '0')}
              </span>
            </div>
            <Button
              onClick={handleParticipate}
              className="gap-2 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-md"
            >
              立即参与
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* 往期精选 */}
      {history.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[hsl(var(--foreground))]">
            <Flame className="h-5 w-5 text-[hsl(var(--accent))]" />
            往期精选
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {history.map((item) => {
              const ItemIcon = TYPE_ICON[item.type] ?? FileText
              return (
                <Card
                  key={item.id || item.date}
                  className="cursor-pointer p-4 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-md"
                  onClick={() => navigate(TYPE_ROUTE[item.type] || '/publish')}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px]">
                      <ItemIcon className="mr-1 h-3 w-3" />
                      {TYPE_LABEL[item.type] ?? '创作'}
                    </Badge>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.date}</span>
                  </div>
                  <h4 className="font-medium text-[hsl(var(--foreground))]">{item.title}</h4>
                  <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">
                    {item.description}
                  </p>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* 空状态 */}
      {!loading && !challenge && (
        <Card className="p-12 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-[hsl(var(--muted-foreground))]" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            今日灵感正在生成中，请稍后再来看看
          </p>
        </Card>
      )}
    </div>
  )
}
