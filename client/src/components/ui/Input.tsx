import React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

// 输入框：focus 时金黄 ring
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-input bg-white px-3 py-2 text-sm transition-all duration-200',
        'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 自适应高度 */
  autoResize?: boolean
}

// 文本域：支持自适应高度
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = false, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoResize) {
        e.target.style.height = 'auto'
        e.target.style.height = `${e.target.scrollHeight}px`
      }
      onChange?.(e)
    }

    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-lg border border-input bg-white px-3 py-2 text-sm transition-all duration-200',
          'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed resize-none',
          className,
        )}
        onChange={handleChange}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'
