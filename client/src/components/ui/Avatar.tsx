import React from 'react'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

export interface AvatarProps {
  /** 智能体名称，用于提取首字母 */
  name: string
  /** 渐变背景，格式 'from-xxx to-yyy' 或任意 className 片段 */
  gradient?: string
  size?: Size
  className?: string
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl',
}

// 智能体头像：首字母 + 渐变背景
export const Avatar: React.FC<AvatarProps> = ({
  name,
  gradient = 'from-primary to-amber-500',
  size = 'md',
  className,
}) => {
  // 提取首字母（中文取第一个字，英文取首字母）
  const initial = name?.trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br shrink-0',
        sizeClasses[size],
        gradient,
        className,
      )}
    >
      {initial}
    </div>
  )
}
