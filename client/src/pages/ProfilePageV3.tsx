// =====================================================================
// 趣味个人主页 v3
// ---------------------------------------------------------------------
// 支持两种视图：
//   1. 本人视图（路由 /profile）：显示完整内容（含邮箱、团队）
//   2. 访客视图（路由 /profile/:userId）：仅显示公开内容
// 区块：
//   - Hero 区：头像 + 昵称 + 邮箱（仅本人）+ 装扮徽章 + 分享按钮
//   - 作品网格（瀑布流）
//   - 收藏智能体
//   - 组队记录（仅本人）
//   - 成就徽章（横向滚动）
// =====================================================================

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Share2, Crown, Star, Users, Award, ExternalLink, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFavorites } from '@/hooks/useFavorites'
import { apiFetch } from '@/lib/api'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { getAgentById } from '@shared/agents'
import type { AgentConfig } from '@shared/agents'
import type { CreativeWork } from '@shared/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------

/**
 * 多智能体协作团队（client/shared/types.ts 暂未同步，本地定义与 server 一致）。
 * 后续若 client/shared 同步了 AgentTeam 类型，可移除此本地定义。
 */
interface AgentTeam {
  id: string
  user_id: string
  name: string
  /** 团队包含的智能体 ID 数组 */
  agent_ids: string[]
  /** 团队配置（工具权限等） */
  config: {
    toolPermissions?: Record<
      string,
      {
        search?: boolean
        imageGen?: boolean
        videoGen?: boolean
        fileOp?: boolean
      }
    >
    [k: string]: unknown
  }
  created_at: string
}

/** 成就定义（与 AchievementsPage.tsx 中保持一致） */
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

/** 用户成就进度（仅本人视图使用） */
interface UserAchievement {
  user_id: string
  achievement_id: string
  progress: number
  unlocked: boolean
  unlocked_at: string | null
  achievements: Achievement | null
}

/** 访客模式下目标用户的精简资料（后端可能尚未实现，使用兜底解析） */
interface VisitorProfile {
  id: string
  nickname?: string
  avatar_url?: string | null
}

// ---------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------

/** 相对时间格式化 */
function formatRelativeTime(iso: string | undefined | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(then).toISOString().slice(0, 10)
}

/** 完整日期格式化 */
function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** 作品类型标签映射 */
const WORK_TYPE_LABEL: Record<CreativeWork['type'], string> = {
  script: '剧本',
  video: '视频',
  image: '图片',
  article: '文章',
  game: '游戏',
  voice: '语音',
}

/** 从作品 result 中提取缩略图 URL（图片作品 result.images[0].url） */
function getWorkThumb(work: CreativeWork): string | null {
  const result = work.result
  if (!result || typeof result !== 'object') return null
  const images = (result as { images?: unknown }).images
  if (!Array.isArray(images) || images.length === 0) return null
  const first = images[0]
  if (first && typeof first === 'object' && 'url' in first) {
    const url = (first as { url?: unknown }).url
    if (typeof url === 'string') return url
  }
  return null
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

export function ProfilePageV3() {
  const { userId } = useParams() // 访客模式
  const { user, profile } = useAuth()
  const { favorites } = useFavorites()

  const isOwner = !userId || userId === user?.id
  const targetUserId = userId || user?.id

  // 目标用户资料（访客模式时拉取）
  const [visitorProfile, setVisitorProfile] = useState<VisitorProfile | null>(null)
  const [visitorLoading, setVisitorLoading] = useState(false)

  // 作品列表
  const [works, setWorks] = useState<CreativeWork[]>([])
  const [worksLoading, setWorksLoading] = useState(true)

  // 团队列表（仅本人）
  const [teams, setTeams] = useState<AgentTeam[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)

  // 成就列表
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([])
  const [myAchievements, setMyAchievements] = useState<UserAchievement[]>([])
  const [achievementsLoading, setAchievementsLoading] = useState(true)

  // 拉取访客资料
  useEffect(() => {
    if (!userId || userId === user?.id) {
      setVisitorProfile(null)
      return
    }
    let active = true
    setVisitorLoading(true)
    apiFetch<VisitorProfile>(`/users/${userId}`)
      .then((res) => {
        if (active) setVisitorProfile(res)
      })
      .catch(() => {
        if (active) setVisitorProfile({ id: userId })
      })
      .finally(() => {
        if (active) setVisitorLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId, user?.id])

  // 拉取作品（本人模式：调 /studio/works；访客模式：后端尚未支持，置空）
  useEffect(() => {
    if (!isOwner) {
      setWorks([])
      setWorksLoading(false)
      return
    }
    let active = true
    setWorksLoading(true)
    apiFetch<{ works: CreativeWork[] }>('/studio/works')
      .then((res) => {
        if (!active) return
        const sorted = [...(res.works ?? [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        setWorks(sorted)
      })
      .catch(() => {
        if (active) setWorks([])
      })
      .finally(() => {
        if (active) setWorksLoading(false)
      })
    return () => {
      active = false
    }
  }, [isOwner])

  // 拉取团队（仅本人可见）
  useEffect(() => {
    if (!isOwner) {
      setTeams([])
      return
    }
    let active = true
    setTeamsLoading(true)
    apiFetch<{ teams: AgentTeam[] }>('/teams')
      .then((res) => {
        if (!active) return
        setTeams(res.teams ?? [])
      })
      .catch(() => {
        // 后端可能尚未实现 /teams 路由，静默失败
        if (active) setTeams([])
      })
      .finally(() => {
        if (active) setTeamsLoading(false)
      })
    return () => {
      active = false
    }
  }, [isOwner])

  // 拉取成就定义（公开）
  useEffect(() => {
    let active = true
    setAchievementsLoading(true)
    apiFetch<{ achievements: Achievement[] }>('/achievements')
      .then((res) => {
        if (!active) return
        setAllAchievements(res.achievements ?? [])
      })
      .catch(() => {
        if (active) setAllAchievements([])
      })
      .finally(() => {
        if (active) setAchievementsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // 拉取本人成就进度（仅本人）
  useEffect(() => {
    if (!isOwner) {
      setMyAchievements([])
      return
    }
    let active = true
    apiFetch<{ achievements: UserAchievement[] }>('/achievements/me')
      .then((res) => {
        if (!active) return
        setMyAchievements(res.achievements ?? [])
      })
      .catch(() => {
        if (active) setMyAchievements([])
      })
    return () => {
      active = false
    }
  }, [isOwner])

  // 收藏智能体列表
  const favoriteAgents = useMemo<AgentConfig[]>(() => {
    if (!isOwner) return []
    const list: AgentConfig[] = []
    for (const id of favorites) {
      const agent = getAgentById(id)
      if (agent) list.push(agent)
    }
    return list
  }, [favorites, isOwner])

  // 成就合并：所有成就 + 用户进度（仅本人视图有 unlocked 状态）
  const mergedAchievements = useMemo(() => {
    const myMap = new Map(myAchievements.map((ua) => [ua.achievement_id, ua]))
    return allAchievements.map((a) => {
      const mine = myMap.get(a.id)
      return {
        ...a,
        progress: mine?.progress ?? 0,
        unlocked: mine?.unlocked ?? false,
        unlocked_at: mine?.unlocked_at ?? null,
      }
    })
  }, [allAchievements, myAchievements])

  // 显示昵称：本人用 profile.nickname，访客用 visitorProfile.nickname
  const displayName = isOwner
    ? profile?.nickname || '我'
    : visitorProfile?.nickname || '匿名用户'

  // 显示邮箱：仅本人
  const displayEmail = isOwner ? user?.email ?? '' : ''

  // 头像首字母
  const initial = (displayName || 'U').charAt(0).toUpperCase()

  // 分享按钮：复制主页链接到剪贴板
  async function handleShare() {
    if (!user?.id) return
    const shareUrl = `${window.location.origin}/profile/${user.id}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        // 兜底：使用 textarea 选中复制
        const ta = document.createElement('textarea')
        ta.value = shareUrl
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success('主页链接已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动复制链接')
    }
  }

  // 未登录或未拿到 profile（本人视图且仍在加载）
  if (isOwner && (!user || !profile)) return null
  // 访客模式但缺少目标 userId（理论上路由不会进入）
  if (!isOwner && !targetUserId) return null

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      {/* ============ Hero 区 ============ */}
      <header className="relative mb-12 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-amber-500/10 to-primary/5 p-8">
        {/* 趣味装扮元素：皇冠 emoji */}
        <div className="pointer-events-none absolute right-8 top-8 select-none text-6xl opacity-20">
          👑
        </div>

        {visitorLoading ? (
          <div className="flex items-center gap-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        ) : (
          <div className="relative flex items-center gap-6">
            <Avatar className="h-24 w-24 bg-gradient-to-br from-primary to-amber-500">
              <AvatarFallback className="bg-transparent text-4xl font-bold text-white">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-extrabold text-gray-900">
                {displayName}
              </h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {isOwner ? displayEmail || '—' : '访客视图'}
              </p>
              {/* 装扮徽章 */}
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge className="bg-amber-500/20 text-amber-700">⭐ 创作者</Badge>
                {isOwner && (
                  <Badge className="bg-primary/20 text-primary">👑 主人</Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 分享按钮（仅本人可见） */}
        {isOwner && !visitorLoading && (
          <Button
            onClick={handleShare}
            className="absolute bottom-8 right-8 gap-2"
          >
            <Share2 className="h-4 w-4" />
            分享我的主页
          </Button>
        )}
      </header>

      {/* ============ 作品网格 ============ */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {isOwner ? '我的作品' : 'TA 的作品'}
          </h2>
          {works.length > 0 && (
            <span className="text-sm text-gray-500">{works.length} 件</span>
          )}
        </div>
        {worksLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        ) : works.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-12 w-12" />}
            title={isOwner ? '还没有作品' : '该用户暂无公开作品'}
            description={
              isOwner
                ? '去创意工坊创造你的第一件作品'
                : '该用户尚未发布公开作品'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {works.map((work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
        )}
      </section>

      {/* ============ 收藏智能体（仅本人） ============ */}
      {isOwner && (
        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">我的收藏</h2>
            {favoriteAgents.length > 0 && (
              <span className="text-sm text-gray-500">
                {favoriteAgents.length} 个
              </span>
            )}
          </div>
          {favoriteAgents.length === 0 ? (
            <EmptyState
              icon={<Star className="h-12 w-12" />}
              title="还没有收藏"
              description="去智能体广场收藏你喜欢的 AI 角色"
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {favoriteAgents.map((agent) => (
                <AgentMiniCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ============ 组队记录（仅本人可见） ============ */}
      {isOwner && (
        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">我的团队</h2>
            {teams.length > 0 && (
              <span className="text-sm text-gray-500">{teams.length} 个</span>
            )}
          </div>
          {teamsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : teams.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title="还没有团队"
              description="组建你的第一个多智能体协作团队"
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {teams.map((team) => (
                <TeamCard key={team.id} team={team} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ============ 成就徽章（横向滚动） ============ */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">成就徽章</h2>
          {mergedAchievements.length > 0 && (
            <span className="text-sm text-gray-500">
              {mergedAchievements.filter((a) => a.unlocked).length} /{' '}
              {mergedAchievements.length}
            </span>
          )}
        </div>
        {achievementsLoading ? (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-40 shrink-0 rounded-xl" />
            ))}
          </div>
        ) : mergedAchievements.length === 0 ? (
          <EmptyState
            icon={<Award className="h-12 w-12" />}
            title="还没有成就"
            description="成就系统正在准备中，敬请期待"
          />
        ) : (
          <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-4">
            {mergedAchievements.map((a) => (
              <AchievementBadge key={a.id} achievement={a} isOwner={isOwner} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------

/** 作品卡片：标题 + 类型徽章 + 创建时间 + 缩略图（如有） */
function WorkCard({ work }: { work: CreativeWork }) {
  const thumb = getWorkThumb(work)
  return (
    <Card className="hover-lift group relative h-full overflow-hidden p-0">
      {/* 缩略图 */}
      <div className="relative h-40 w-full overflow-hidden bg-muted">
        {thumb ? (
          <img
            src={thumb}
            alt={work.title || '作品缩略图'}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-muted-foreground/30">
            {WORK_TYPE_LABEL[work.type]?.charAt(0) ?? '🎨'}
          </div>
        )}
        {/* hover 查看按钮 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <Button size="sm" variant="secondary" className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" />
            查看
          </Button>
        </div>
      </div>
      {/* 信息区 */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="shrink-0">
            {WORK_TYPE_LABEL[work.type] ?? work.type}
          </Badge>
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {work.title || '未命名作品'}
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          创建于 {formatRelativeTime(work.created_at)}
        </p>
      </div>
    </Card>
  )
}

/** 智能体小卡片：头像（渐变）+ 名称 + tagline */
function AgentMiniCard({ agent }: { agent: AgentConfig }) {
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <a
      href={`/chat/${agent.id}`}
      className="hover-lift block rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm transition-transform duration-300 ease-out hover:scale-[1.02]"
    >
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
        style={{ backgroundImage: agent.avatarGradient }}
      >
        {initial}
      </div>
      <h3 className="mt-3 truncate text-sm font-semibold text-gray-900">
        {agent.name}
      </h3>
      <p className="mt-1 line-clamp-2 text-xs text-gray-500">{agent.tagline}</p>
    </a>
  )
}

/** 团队卡片：团队名 + 包含的 agent 数量 + 创建时间 */
function TeamCard({ team }: { team: AgentTeam }) {
  const agentCount = Array.isArray(team.agent_ids) ? team.agent_ids.length : 0
  return (
    <Card className="hover-lift p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold text-gray-900">
            {team.name || '未命名团队'}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            创建于 {formatDate(team.created_at)}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 gap-1">
          <Users className="h-3 w-3" />
          {agentCount} 位成员
        </Badge>
      </div>
    </Card>
  )
}

/** 成就徽章：图标 + 名称 + 描述 + 进度（仅本人） */
function AchievementBadge({
  achievement,
  isOwner,
}: {
  achievement: Achievement & {
    progress: number
    unlocked: boolean
    unlocked_at: string | null
  }
  isOwner: boolean
}) {
  const { unlocked, progress } = achievement
  const progressPct =
    achievement.threshold > 0
      ? Math.min(100, (progress / achievement.threshold) * 100)
      : 0

  return (
    <div
      className={cn(
        'hover-lift relative w-44 shrink-0 overflow-hidden rounded-xl border p-4 shadow-sm transition-all',
        unlocked
          ? 'border-transparent bg-gradient-to-br from-amber-400 to-orange-500 text-white'
          : 'border-border bg-card text-muted-foreground',
      )}
    >
      {/* 图标 */}
      <div className="flex items-start justify-between">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full',
            unlocked ? 'bg-white/20' : 'bg-muted',
          )}
        >
          {unlocked ? (
            <Award className="h-5 w-5" />
          ) : (
            <Crown className="h-5 w-5 opacity-50" />
          )}
        </div>
        {unlocked && achievement.points > 0 && (
          <Badge className="border-0 bg-white/20 text-white">
            +{achievement.points}
          </Badge>
        )}
      </div>
      {/* 名称 */}
      <h3 className="mt-3 truncate font-bold">{achievement.name}</h3>
      <p
        className={cn(
          'mt-1 line-clamp-2 text-xs',
          unlocked ? 'text-white/80' : 'text-muted-foreground/70',
        )}
      >
        {achievement.description}
      </p>
      {/* 进度 / 已解锁 */}
      {isOwner && unlocked ? (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium">
          <Award className="h-3.5 w-3.5" />
          已解锁
          {achievement.unlocked_at && (
            <span className="opacity-70">
              · {formatDate(achievement.unlocked_at)}
            </span>
          )}
        </div>
      ) : isOwner ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span>
              {progress} / {achievement.threshold}
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs opacity-70">登录查看进度</p>
      )}
    </div>
  )
}
