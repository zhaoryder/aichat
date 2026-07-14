import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/** 加载旋转图标组件 */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }[size]

  return <Loader2 className={cn('animate-spin', sizeClass, className)} />
}
