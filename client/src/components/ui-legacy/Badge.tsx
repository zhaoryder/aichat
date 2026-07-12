import React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'primary' | 'secondary'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-gray-100 text-gray-700',
  primary: 'bg-primary/15 text-primary',
  secondary: 'bg-gray-200 text-gray-800',
}

// 小标签徽章
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
)
Badge.displayName = 'Badge'
