// =====================================================================
// 收藏按钮组件
// ---------------------------------------------------------------------
// Props: { agentId, agentType?, size?, className? }
//   - 心形图标：已收藏金黄填充，未收藏灰色描边
//   - 点击调 useFavorites().toggleFavorite（POST /favorite），全局状态同步
//   - 加载中显示 Spinner
//   - 收藏状态从全局 Context 读取，刷新后保持
// =====================================================================

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useFavorites } from '@/hooks/useFavorites'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export interface FavoriteButtonProps {
  agentId: string
  agentType?: 'official' | 'custom'
  /** 可选的尺寸 */
  size?: 'sm' | 'md'
  /** 自定义类名 */
  className?: string
}

export function FavoriteButton({
  agentId,
  agentType = 'official',
  size = 'md',
  className,
}: FavoriteButtonProps) {
  const { isFavorited, toggleFavorite, loading } = useFavorites()
  const favorited = isFavorited(agentId)
  const [submitting, setSubmitting] = useState(false)

  const handleClick = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    const prev = favorited
    try {
      await toggleFavorite(agentId, agentType)
      toast.success(!prev ? '收藏成功！' : '已取消收藏')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }, [agentId, agentType, favorited, submitting, toggleFavorite])

  const sizeClass = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const iconSize = size === 'sm' ? 16 : 18

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || submitting}
      aria-label={favorited ? '取消收藏' : '收藏智能体'}
      aria-pressed={favorited}
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
