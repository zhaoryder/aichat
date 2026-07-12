// =====================================================================
// 角色卡牌系统
// ---------------------------------------------------------------------
// - 网格展示所有智能体卡牌
// - 翻转动画（点击翻转看背面）
// - 卡牌正面：智能体头像/名称/稀有度
// - 卡牌背面：技能/组合效果/描述
// - 收集进度条
// - 锁定的卡牌灰色显示
// 数据：从 @shared/agents 导入 agents 列表
// =====================================================================

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, Sparkles, Swords, BookOpen, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { agents, type AgentConfig } from '@shared/agents'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Rarity = '普通' | '稀有' | '史诗' | '传说'

// 稀有度颜色配置
const RARITY_CONFIG: Record<Rarity, { gradient: string; badge: string; glow: string; label: string }> = {
  传说: {
    gradient: 'from-amber-500 via-orange-500 to-red-500',
    badge: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
    glow: 'shadow-amber-500/30',
    label: '传说',
  },
  史诗: {
    gradient: 'from-purple-500 via-fuchsia-500 to-pink-500',
    badge: 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white',
    glow: 'shadow-purple-500/30',
    label: '史诗',
  },
  稀有: {
    gradient: 'from-blue-500 via-cyan-500 to-teal-500',
    badge: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white',
    glow: 'shadow-blue-500/30',
    label: '稀有',
  },
  普通: {
    gradient: 'from-gray-400 via-slate-400 to-zinc-400',
    badge: 'bg-gradient-to-r from-gray-400 to-slate-400 text-white',
    glow: 'shadow-gray-500/20',
    label: '普通',
  },
}

export function CardsPage() {
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set())

  // 锁定的卡牌：传说稀有度默认锁定（需通过对话解锁）
  // 使用 localStorage 持久化解锁状态
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('card_unlocks')
      if (stored) return new Set(JSON.parse(stored))
    } catch {
      // ignore
    }
    // 默认解锁非传说卡牌
    return new Set(
      agents.filter((a) => a.card.rarity !== '传说').map((a) => a.id),
    )
  })

  function toggleFlip(id: string) {
    setFlippedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCardClick(agent: AgentConfig) {
    if (!unlockedIds.has(agent.id)) {
      // 尝试解锁
      const next = new Set(unlockedIds)
      next.add(agent.id)
      setUnlockedIds(next)
      try {
        localStorage.setItem('card_unlocks', JSON.stringify([...next]))
      } catch {
        // ignore
      }
      toast.success(`解锁了「${agent.name}」的卡牌！`)
      return
    }
    toggleFlip(agent.id)
  }

  const unlockedCount = unlockedIds.size
  const totalCount = agents.length
  const progressPct = (unlockedCount / totalCount) * 100

  // 按稀有度统计
  const rarityStats = agents.reduce<Record<Rarity, { total: number; unlocked: number }>>(
    (acc, a) => {
      const r = a.card.rarity
      if (!acc[r]) acc[r] = { total: 0, unlocked: 0 }
      acc[r].total++
      if (unlockedIds.has(a.id)) acc[r].unlocked++
      return acc
    },
    {} as Record<Rarity, { total: number; unlocked: number }>,
  )

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6">
        <h1 className="bg-gradient-to-r from-primary via-amber-500 to-purple-500 bg-clip-text text-3xl font-extrabold text-transparent">
          角色卡牌
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          收集 17 位穿越时空的智能体卡牌，点击翻转查看技能与组合效果
        </p>
      </header>

      {/* 收集进度 */}
      <div className="mb-6 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">收集进度</span>
          </div>
          <span className="text-sm font-bold text-primary">
            {unlockedCount} / {totalCount}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary via-amber-500 to-purple-500"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        {/* 稀有度统计 */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(['传说', '史诗', '稀有', '普通'] as Rarity[]).map((r) => {
            const stat = rarityStats[r]
            if (!stat) return null
            return (
              <Badge key={r} className={cn('border-0', RARITY_CONFIG[r].badge)}>
                {r} {stat.unlocked}/{stat.total}
              </Badge>
            )
          })}
        </div>
      </div>

      {/* 卡牌网格 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {agents.map((agent) => (
          <CardItem
            key={agent.id}
            agent={agent}
            isFlipped={flippedIds.has(agent.id)}
            isUnlocked={unlockedIds.has(agent.id)}
            onClick={() => handleCardClick(agent)}
          />
        ))}
      </div>
    </div>
  )
}

// 卡牌项
function CardItem({
  agent,
  isFlipped,
  isUnlocked,
  onClick,
}: {
  agent: AgentConfig
  isFlipped: boolean
  isUnlocked: boolean
  onClick: () => void
}) {
  const rarity = agent.card.rarity
  const config = RARITY_CONFIG[rarity]
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4 }}
      className="[perspective:1000px]"
    >
      <motion.button
        type="button"
        onClick={onClick}
        className="relative aspect-[3/4] w-full cursor-pointer"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.5 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* 正面 */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-between rounded-xl border-2 p-3 shadow-lg [backface-visibility:hidden]',
            isUnlocked
              ? cn('border-transparent bg-gradient-to-br text-white', config.gradient, config.glow)
              : 'border-border bg-muted/50',
          )}
        >
          {isUnlocked ? (
            <>
              {/* 稀有度标签 */}
              <div className="flex w-full items-center justify-between">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                  {config.label}
                </span>
                <Sparkles className="h-3 w-3 opacity-70" />
              </div>
              {/* 头像 */}
              <div className="flex flex-1 items-center justify-center">
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/40 text-2xl font-bold text-white"
                  style={{ backgroundImage: agent.avatarGradient }}
                >
                  {initial}
                </span>
              </div>
              {/* 名称 */}
              <div className="text-center">
                <p className="font-bold">{agent.name}</p>
                <p className="text-[10px] opacity-80">{agent.title}</p>
              </div>
            </>
          ) : (
            <>
              {/* 锁定状态 */}
              <div className="flex w-full items-center justify-end">
                <Lock className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-2">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Lock className="h-6 w-6 text-muted-foreground/40" />
                </span>
                <p className="text-xs text-muted-foreground/60">未解锁</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-muted-foreground/50">???</p>
                <p className="text-[10px] text-muted-foreground/40">{config.label}</p>
              </div>
            </>
          )}
        </div>

        {/* 背面 */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col rounded-xl border-2 p-3 shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]',
            isUnlocked
              ? cn('border-transparent bg-gradient-to-br text-white', config.gradient)
              : 'border-border bg-muted/50',
          )}
        >
          {isUnlocked && (
            <>
              <div className="flex items-center gap-1.5 border-b border-white/20 pb-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundImage: agent.avatarGradient }}
                >
                  {initial}
                </span>
                <span className="text-sm font-bold">{agent.name}</span>
              </div>
              {/* 技能 */}
              <div className="mt-2">
                <p className="flex items-center gap-1 text-[10px] font-semibold opacity-80">
                  <Swords className="h-3 w-3" />
                  技能
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {agent.card.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
              {/* 组合效果 */}
              <div className="mt-2">
                <p className="flex items-center gap-1 text-[10px] font-semibold opacity-80">
                  <BookOpen className="h-3 w-3" />
                  组合
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed opacity-90">
                  {agent.card.combo}
                </p>
              </div>
              {/* 标语 */}
              <p className="mt-auto border-t border-white/20 pt-1.5 text-[10px] italic opacity-70">
                &ldquo;{agent.tagline}&rdquo;
              </p>
            </>
          )}
        </div>
      </motion.button>
    </motion.div>
  )
}
