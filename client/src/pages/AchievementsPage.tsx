// =====================================================================
// 成就系统
// ---------------------------------------------------------------------
// - 网格展示所有成就（已解锁/未解锁）
// - 已解锁：彩色卡片 + 图标
// - 未解锁：灰色卡片 + 进度条
// - 按分类分组（对话/创作/签到/社交/vibe/gallery/agent）
// - 解锁动画（framer-motion）
// =====================================================================

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Trophy,
  Lock,
  MessageSquare,
  PenTool,
  CalendarCheck,
  Users,
  Code,
  Image,
  Bot,
  Award,
  type LucideIcon,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// 成就定义
interface Achievement {
  id: string
  code: string
  name: string
  description: string
  category: string
  icon: string
  threshold: number
  points: number
}

// 用户成就进度
interface UserAchievement {
  user_id: string
  achievement_id: string
  progress: number
  unlocked: boolean
  unlocked_at: string | null
  achievements: Achievement | null
}

interface AchievementsResponse {
  achievements: Achievement[]
}

interface MyAchievementsResponse {
  achievements: UserAchievement[]
}

// 分类配置：图标 + 颜色
const CATEGORY_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  对话: { icon: MessageSquare, color: 'from-blue-500 to-cyan-500', label: '对话' },
  创作: { icon: PenTool, color: 'from-purple-500 to-pink-500', label: '创作' },
  签到: { icon: CalendarCheck, color: 'from-green-500 to-emerald-500', label: '签到' },
  社交: { icon: Users, color: 'from-orange-500 to-red-500', label: '社交' },
  vibe: { icon: Code, color: 'from-indigo-500 to-blue-500', label: 'Vibe Code' },
  gallery: { icon: Image, color: 'from-pink-500 to-rose-500', label: '画廊' },
  agent: { icon: Bot, color: 'from-amber-500 to-yellow-500', label: '智能体' },
}

function getCategoryConfig(category: string) {
  return (
    CATEGORY_CONFIG[category] || {
      icon: Award,
      color: 'from-gray-500 to-gray-600',
      label: category,
    }
  )
}

export function AchievementsPage() {
  // 拉取所有成就定义
  const { data: allData, isLoading: loadingAll } = useQuery<AchievementsResponse>({
    queryKey: ['achievements'],
    queryFn: () => apiFetch<AchievementsResponse>('/achievements'),
  })

  // 拉取当前用户的成就进度（需登录）
  const { data: myData } = useQuery<MyAchievementsResponse>({
    queryKey: ['achievements', 'me'],
    queryFn: () => apiFetch<MyAchievementsResponse>('/achievements/me'),
    retry: false, // 未登录时不重试
  })

  const allAchievements = allData?.achievements ?? []
  const myAchievements = myData?.achievements ?? []

  // 用户成就映射：achievement_id → UserAchievement
  const myMap = new Map(myAchievements.map((ua) => [ua.achievement_id, ua]))

  // 合并：所有成就 + 用户进度
  const merged = allAchievements.map((a) => {
    const mine = myMap.get(a.id)
    return {
      ...a,
      progress: mine?.progress ?? 0,
      unlocked: mine?.unlocked ?? false,
      unlocked_at: mine?.unlocked_at ?? null,
    }
  })

  // 按分类分组
  const grouped = merged.reduce<Record<string, typeof merged>>((acc, a) => {
    const cat = a.category || '其他'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(a)
    return acc
  }, {})

  const unlockedCount = merged.filter((a) => a.unlocked).length
  const totalCount = merged.length

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6">
        <h1 className="bg-gradient-to-r from-primary via-amber-500 to-yellow-500 bg-clip-text text-3xl font-extrabold text-transparent">
          成就系统
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          解锁成就，收集徽章，证明你是个合格的整活达人
        </p>
      </header>

      {/* 进度概览 */}
      {!loadingAll && totalCount > 0 && (
        <div className="mb-6 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <span className="font-semibold text-foreground">已解锁</span>
            </div>
            <span className="text-sm font-bold text-primary">
              {unlockedCount} / {totalCount}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-amber-500"
              initial={{ width: 0 }}
              animate={{ width: `${totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* 加载骨架屏 */}
      {loadingAll ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : totalCount === 0 ? (
        <EmptyState
          title="还没有成就"
          description="成就系统正在准备中，敬请期待"
        />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, items]) => {
            const config = getCategoryConfig(category)
            return (
              <section key={category}>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
                  <config.icon className="h-5 w-5 text-primary" />
                  {config.label}
                  <Badge variant="secondary" className="text-xs">
                    {items.filter((i) => i.unlocked).length} / {items.length}
                  </Badge>
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((a) => (
                    <AchievementCard key={a.id} achievement={a} config={config} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 成就卡片
function AchievementCard({
  achievement,
  config,
}: {
  achievement: {
    id: string
    code: string
    name: string
    description: string
    category: string
    icon: string
    threshold: number
    points: number
    progress: number
    unlocked: boolean
    unlocked_at: string | null
  }
  config: { icon: LucideIcon; color: string; label: string }
}) {
  const Icon = config.icon
  const progressPct = achievement.threshold > 0
    ? Math.min(100, (achievement.progress / achievement.threshold) * 100)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4, scale: 1.02 }}
      className={cn(
        'relative overflow-hidden rounded-lg border p-4 shadow-sm transition-all',
        achievement.unlocked
          ? 'border-transparent bg-gradient-to-br text-white ' + config.color
          : 'border-border bg-card text-muted-foreground',
      )}
    >
      {/* 图标 */}
      <div className="flex items-start justify-between">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full',
            achievement.unlocked ? 'bg-white/20' : 'bg-muted',
          )}
        >
          {achievement.unlocked ? (
            <Icon className="h-5 w-5" />
          ) : (
            <Lock className="h-5 w-5" />
          )}
        </div>
        {achievement.unlocked && achievement.points > 0 && (
          <Badge className="border-0 bg-white/20 text-white">
            +{achievement.points}
          </Badge>
        )}
      </div>

      {/* 名称 */}
      <h3 className="mt-3 font-bold">{achievement.name}</h3>
      <p
        className={cn(
          'mt-1 text-xs',
          achievement.unlocked ? 'text-white/80' : 'text-muted-foreground/70',
        )}
      >
        {achievement.description}
      </p>

      {/* 进度条 / 已解锁 */}
      {achievement.unlocked ? (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium">
          <Trophy className="h-3.5 w-3.5" />
          已解锁
          {achievement.unlocked_at && (
            <span className="opacity-70">
              · {new Date(achievement.unlocked_at).toLocaleDateString('zh-CN')}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span>
              {achievement.progress} / {achievement.threshold}
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className={cn('h-full rounded-full bg-gradient-to-r', config.color)}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}

// 空状态
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Trophy className="h-12 w-12 text-muted-foreground/40" />
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
