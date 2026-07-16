// =====================================================================
// Agent 详情页（Batch E3.2）
// ---------------------------------------------------------------------
// 路由：/agents/:id
// 显示：
//   1. Agent 基本信息（头像、名字、era、title、tagline、topics）
//   2. Personality 卡片（MBTI 配色 + 技能矩阵 chips + 擅长语言 chips）
//   3. 卡牌信息（rarity + skills + combo）
//   4. 进入对话按钮（跳转 /chat/:id）
// 暗色模式 + 卡片样式
// =====================================================================

import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Sparkles, Layers, Globe, Brain, AlertCircle, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AgentConfig } from '@shared/agents'

// MBTI 4 个字母配色（每个字母一种颜色，暗色模式友好）
const MBTI_COLORS: Record<string, string> = {
  // 维度 1：E/I（外向/内向）
  E: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
  I: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  // 维度 2：S/N（实感/直觉）
  S: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  N: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  // 维度 3：T/F（思考/情感）
  T: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  F: 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30',
  // 维度 4：J/P（判断/感知）
  J: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  P: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
}

/** 渲染 MBTI 4 个字母（每个字母独立配色） */
function MbtiBadge({ mbti }: { mbti: string }) {
  const letters = mbti.toUpperCase().split('').slice(0, 4)
  return (
    <div className="flex items-center gap-1.5">
      {letters.map((ch, idx) => (
        <span
          key={idx}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-bold',
            MBTI_COLORS[ch] ?? 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
          )}
          title={MBTI_LABELS[ch] ?? ch}
        >
          {ch}
        </span>
      ))}
    </div>
  )
}

/** MBTI 字母含义说明（hover 时显示） */
const MBTI_LABELS: Record<string, string> = {
  E: 'Extraversion 外向',
  I: 'Introversion 内向',
  S: 'Sensing 实感',
  N: 'Intuition 直觉',
  T: 'Thinking 思考',
  F: 'Feeling 情感',
  J: 'Judging 判断',
  P: 'Perceiving 感知',
}

/** Rarity 配色 */
const RARITY_STYLES: Record<string, string> = {
  '普通': 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30',
  '稀有': 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  '史诗': 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
  '传说': 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
}

interface AgentsApiResponse {
  agents: AgentConfig[]
}

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setError('缺少 agent ID')
      setLoading(false)
      return
    }
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        // 通过列表 API 获取（也可考虑 getAgentById 静态查找）
        const data = await apiFetch<AgentsApiResponse>(
          `/agents?search=&filter=all&pageSize=200`,
        )
        if (!active) return
        const found = (data.agents ?? []).find((a) => a.id === id)
        if (!found) {
          setError('未找到该 Agent')
        } else {
          setAgent(found)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : '加载失败')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="animate-fade-in mx-auto max-w-3xl px-4 py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-[hsl(var(--destructive)/0.6)]" />
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
            {error || '未找到 Agent'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in mx-auto max-w-4xl px-4 py-6">
      {/* 返回按钮 */}
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </button>

      {/* 顶部基本信息卡片 */}
      <Card className="mb-6 overflow-hidden border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* 头像 */}
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-md"
            style={{ background: agent.avatarGradient }}
          >
            {agent.name[0]?.toUpperCase()}
          </div>

          {/* 信息 */}
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
                {agent.name}
              </h1>
              {agent.era && (
                <Badge variant="outline" className="text-xs">
                  {agent.era}
                </Badge>
              )}
              {agent.card?.rarity && (
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-medium',
                    RARITY_STYLES[agent.card.rarity] ?? RARITY_STYLES['普通'],
                  )}
                >
                  {agent.card.rarity}
                </span>
              )}
            </div>
            {agent.title && (
              <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                {agent.title}
              </p>
            )}
            {agent.tagline && (
              <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
                「{agent.tagline}」
              </p>
            )}
            {/* topics */}
            {agent.topics && agent.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {agent.topics.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 进入对话按钮 */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-[hsl(var(--border))] pt-4">
          <Button asChild size="sm">
            <Link to={`/chat/${agent.id}`}>
              <MessageCircle className="mr-1.5 h-4 w-4" />
              开始对话
            </Link>
          </Button>
        </div>
      </Card>

      {/* Personality 卡片（E3） */}
      {agent.personality ? (
        <Card className="mb-6 border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Brain className="h-5 w-5 text-[hsl(var(--primary))]" />
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
              性格画像
            </h2>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              Personality Profile
            </span>
          </div>

          {/* MBTI */}
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                MBTI:
              </span>
              <MbtiBadge mbti={agent.personality.mbti} />
            </div>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {MBTI_LABELS[agent.personality.mbti[0]?.toUpperCase()]} ·{' '}
              {MBTI_LABELS[agent.personality.mbti[1]?.toUpperCase()]} ·{' '}
              {MBTI_LABELS[agent.personality.mbti[2]?.toUpperCase()]} ·{' '}
              {MBTI_LABELS[agent.personality.mbti[3]?.toUpperCase()]}
            </span>
          </div>

          {/* 技能矩阵 chips */}
          {agent.personality.skills && agent.personality.skills.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  技能矩阵
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {agent.personality.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-lg border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--primary))]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 擅长语言 chips */}
          {agent.personality.languages && agent.personality.languages.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  擅长语言
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {agent.personality.languages.map((l) => (
                  <span
                    key={l}
                    className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--foreground))]"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card className="mb-6 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          该 Agent 暂未配置性格画像
        </Card>
      )}

      {/* 卡牌信息 */}
      {agent.card && (
        <Card className="border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-5 w-5 text-[hsl(var(--primary))]" />
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
              卡牌信息
            </h2>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                技能
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {agent.card.skills?.map((s) => (
                  <Badge key={s} variant="outline" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
            {agent.card.combo && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  组合效果
                </span>
                <p className="mt-1 text-sm text-[hsl(var(--foreground))]">
                  {agent.card.combo}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
