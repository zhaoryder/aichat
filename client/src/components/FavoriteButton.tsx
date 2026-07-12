// =====================================================================
// 收藏按钮组件
// ---------------------------------------------------------------------
// Props: { agentId, agentType?, initialFavorited? }
//   - 心形图标：已收藏金黄填充，未收藏灰色描边
//   - 点击调 POST /favorite，乐观更新（点击立即切换，失败回滚）
//   - 加载中显示 Spinner
//   - 挂载时若未传 initialFavorited，则调 GET /favorite/check 拉初始状态
// =====================================================================

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { Spinner } from '@/components/ui-legacy/Spinner'
import { cn } from '@/lib/utils'

export interface FavoriteButtonProps {
  agentId: string
  agentType?: 'official' | 'custom'
  /** 初始收藏状态（未传则挂载时拉取） */
  initialFavorited?: boolean
  /** 可选的尺寸 */
  size?: 'sm' | 'md'
  /** 自定义类名 */
  className?: string
}

export function FavoriteButton({
  agentId,
  agentType,
  initialFavorited,
  size = 'md',
  className,
}: FavoriteButtonProps) {
  // null 表示初始状态未知（拉取中）
  const [favorited, setFavorited] = useState<boolean | null>(
    initialFavorited === undefined ? null : initialFavorited,
  )
  const [submitting, setSubmitting] = useState(false)

  // 挂载时若 initialFavorited 未传，拉取一次初始状态
  useEffect(() => {
    if (initialFavorited !== undefined) return
    if (!agentId) return
    let active = true
    const query = agentType
      ? `agentId=${encodeURIComponent(agentId)}&agentType=${encodeURIComponent(agentType)}`
      : `agentId=${encodeURIComponent(agentId)}`
    apiFetch<{ favorited: boolean }>(`/favorite/check?${query}`)
      .then((res) => {
        if (!active) return
        setFavorited(res.favorited === true)
      })
      .catch(() => {
        // 静默降级：默认未收藏
        if (active) setFavorited(false)
      })
    return () => {
      active = false
    }
  }, [agentId, agentType, initialFavorited])

  const handleClick = useCallback(async () => {
    if (submitting || favorited === null) return
    const prev = favorited
    // 乐观更新：立即切换图标
    setFavorited(!prev)
    setSubmitting(true)
    try {
      await apiFetch<{ favorited: boolean }>('/favorite', {
        method: 'POST',
        body: JSON.stringify({ agentId, agentType }),
      })
      // 不依赖返回值，保持乐观结果
      toast.success(!prev ? '收藏成功！' : '已取消收藏')
    } catch (err) {
      // 回滚
      setFavorited(prev)
      toast.error(err instanceof Error ? err.message : '操作失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }, [agentId, agentType, favorited, submitting])

  const sizeClass = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const iconSize = size === 'sm' ? 16 : 18

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={favorited === null || submitting}
      aria-label={favorited ? '取消收藏' : '收藏智能体'}
      aria-pressed={favorited === true}
      title={favorited ? '已收藏' : '收藏'}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed',
        sizeClass,
        favorited
          ? 'text-primary'
          : 'text-gray-400 hover:bg-muted hover:text-gray-700',
        className,
      )}
    >
      {submitting ? (
        <Spinner size="sm" className="text-primary" />
      ) : (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill={favorited ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
