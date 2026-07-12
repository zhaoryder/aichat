import React from 'react'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

export interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  size?: Size
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

// 加载旋转图标
export const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, size = 'md', ...props }, ref) => (
    <svg
      ref={ref}
      className={cn('animate-spin text-primary', sizeClasses[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  ),
)
Spinner.displayName = 'Spinner'
