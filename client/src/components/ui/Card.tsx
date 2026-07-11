import React from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 鼠标悬停时是否放大 */
  hoverScale?: boolean
}

// 卡片容器
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverScale = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition-all duration-300 ease-out hover:shadow-md',
        hoverScale && 'hover:scale-[1.02]',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

// 卡片头部
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pb-0', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

// 卡片主体
export const CardBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6', className)} {...props} />
  ),
)
CardBody.displayName = 'CardBody'

// 卡片底部
export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'
