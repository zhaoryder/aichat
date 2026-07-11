import React from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** 图标节点 */
  icon?: React.ReactNode
  title: string
  description?: string
  /** 可选的行动按钮区域 */
  action?: React.ReactNode
  className?: string
}

// 空状态占位：图标 + 标题 + 描述 + 可选 CTA
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center text-center py-12 px-4',
      className,
    )}
  >
    {icon && <div className="mb-3 text-gray-400">{icon}</div>}
    <h3 className="text-base font-medium text-gray-700">{title}</h3>
    {description && <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
)
