// =====================================================================
// 排行榜
// ---------------------------------------------------------------------
// - Tab 切换：智能体热度 / 用户活跃度 / 作品热度
// - 前 10 名表格（排名/头像/名称/数值）
// - recharts 柱状图展示前 5 名
// - 前三名特殊样式（金银铜）
// =====================================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Crown, Medal, Bot, Users, Image as ImageIcon, Trophy } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Tab = 'agents' | 'users' | 'works'

const TABS: { key: Tab; label: string; icon: typeof Bot }[] = [
  { key: 'agents', label: '智能体热度', icon: Bot },
  { key: 'users', label: '用户活跃度', icon: Users },
  { key: 'works', label: '作品热度', icon: ImageIcon },
]

// 排行榜条目通用结构
interface LeaderboardEntry {
  id?: string
  name: string
  value: number
  subtitle?: string
  avatarGradient?: string
}

// 智能体排行
interface AgentLeader {
  agent_id: string
  agent_name: string
  count: number
}
// 用户排行
interface UserLeader {
  user_id: string
  count: number
}
// 作品排行
interface WorkLeader {
  id: string
  title: string
  prompt: string
  type: string
  likes: number
  url?: string
}

// 颜色映射（前5名柱状图）
const CHART_COLORS = ['#fbbf24', '#cbd5e1', '#d97706', '#818cf8', '#34d399']
// 前三名奖牌样式
const MEDAL_STYLES = [
  'from-yellow-400 to-amber-500', // 金
  'from-gray-300 to-gray-400', // 银
  'from-orange-600 to-amber-700', // 铜
]

export function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('agents')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaderboard', tab],
    queryFn: async () => {
      const limit = 20
      const res = await apiFetch<{ leaderboard: any[] }>(
        `/leaderboard/${tab}?limit=${limit}`,
      )
      return normalizeEntries(res.leaderboard ?? [], tab)
    },
  })

  const entries = data ?? []

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6">
        <h1 className="bg-gradient-to-r from-primary via-amber-500 to-yellow-500 bg-clip-text text-3xl font-extrabold text-transparent">
          排行榜
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          看看谁是整活之王，谁是社区顶流
        </p>
      </header>

      {/* Tab 切换 */}
      <div className="mb-6 flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                tab === t.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* 内容 */}
      {isLoading ? (
        <LeaderboardSkeleton />
      ) : isError ? (
        <EmptyState title="加载失败" description="请稍后重试" />
      ) : entries.length === 0 ? (
        <EmptyState title="暂无数据" description="还没有排行数据，快去整活冲榜吧" />
      ) : (
        <div className="space-y-6">
          {/* 前 5 名柱状图 */}
          {entries.length > 0 && (
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Trophy className="h-4 w-4 text-amber-500" />
                TOP 5 可视化
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={entries.slice(0, 5).map((e) => ({ name: e.name, value: e.value }))}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-muted-foreground"
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} className="text-muted-foreground" />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--background))',
                      color: 'hsl(var(--foreground))',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {entries.slice(0, 5).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 前 10 名表格 */}
          <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">排名</th>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 text-right font-medium">
                    {tab === 'agents' ? '对话次数' : tab === 'users' ? '活跃度' : '点赞数'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 10).map((entry, i) => (
                  <LeaderRow key={entry.id || i} entry={entry} rank={i + 1} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// 排行行
function LeaderRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const initial = entry.name.trim().charAt(0).toUpperCase() || '?'
  const isTop3 = rank <= 3

  return (
    <motion.tr
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: (rank - 1) * 0.05 }}
      className="border-b transition-colors hover:bg-muted/50"
    >
      <td className="px-4 py-3">
        {isTop3 ? (
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-white',
              MEDAL_STYLES[rank - 1],
            )}
          >
            {rank === 1 ? (
              <Crown className="h-4 w-4" />
            ) : (
              <Medal className="h-4 w-4" />
            )}
          </div>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
            {rank}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {entry.avatarGradient ? (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundImage: entry.avatarGradient }}
            >
              {initial}
            </span>
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
              {initial}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{entry.name}</p>
            {entry.subtitle && (
              <p className="truncate text-xs text-muted-foreground">{entry.subtitle}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right font-bold text-primary">{entry.value}</td>
    </motion.tr>
  )
}

// 归一化：将不同 API 返回转为统一结构
function normalizeEntries(raw: any[], tab: Tab): LeaderboardEntry[] {
  if (tab === 'agents') {
    return (raw as AgentLeader[]).map((a) => ({
      id: a.agent_id,
      name: a.agent_name || '未知智能体',
      value: a.count || 0,
    }))
  }
  if (tab === 'users') {
    return (raw as UserLeader[]).map((u) => ({
      id: u.user_id,
      name: `用户 ${u.user_id?.slice(0, 6) || '???'}`,
      value: u.count || 0,
    }))
  }
  // works
  return (raw as WorkLeader[]).map((w) => ({
    id: w.id,
    name: w.title || w.prompt?.slice(0, 20) || '未命名作品',
    value: w.likes || 0,
    subtitle: w.type,
  }))
}

// 骨架屏
function LeaderboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-60 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
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
