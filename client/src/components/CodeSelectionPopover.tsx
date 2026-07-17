import { useState, useEffect, useRef } from 'react'
import { Sparkles, X, Send, Loader2, Code2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface CodeSelectionPopoverProps {
  /** 选中的代码 */
  selectedCode: string
  /** 是否可见 */
  visible: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 提交修改指令回调 */
  onModify: (instruction: string) => void
  /** 浮窗定位（相对于选区的位置） */
  position?: { top: number; left: number }
  /** 是否正在流式生成中（禁用提交） */
  disabled?: boolean
}

// 选中代码 AI 修改浮窗：在 CodeArea 选区附近弹出，输入指令后回调父组件
export function CodeSelectionPopover({
  selectedCode,
  visible,
  onClose,
  onModify,
  position,
  disabled,
}: CodeSelectionPopoverProps) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 可见时聚焦输入框
  useEffect(() => {
    if (visible) {
      setTimeout(() => textareaRef.current?.focus(), 100)
      setInstruction('')
      setLoading(false)
    }
  }, [visible])

  // ESC 关闭
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, onClose])

  if (!visible || !selectedCode) return null

  const handleSubmit = () => {
    if (!instruction.trim() || disabled || loading) return
    setLoading(true)
    onModify(instruction.trim())
    // 注意：不在这里关闭，让父组件控制（等 AI 回复后关闭）
  }

  const preview =
    selectedCode.length > 100
      ? selectedCode.slice(0, 100) + '...'
      : selectedCode

  return (
    <div
      className={cn(
        'fixed z-50 w-80 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl',
        'animate-in fade-in slide-in-from-bottom-2 duration-200'
      )}
      style={{
        top: position?.top ?? 100,
        left: position?.left ?? 100,
      }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI 修改选中代码
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="关闭"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 代码预览 */}
      <div className="border-b border-gray-100 dark:border-gray-800 px-3 py-2">
        <div className="mb-1 flex items-center gap-1 text-[10px] text-gray-400">
          <Code2 className="h-2.5 w-2.5" />
          选中代码预览
        </div>
        <pre className="text-[10px] font-mono text-gray-500 dark:text-gray-400 max-h-20 overflow-auto whitespace-pre-wrap">
          {preview}
        </pre>
      </div>

      {/* 输入区 */}
      <div className="p-3">
        <textarea
          ref={textareaRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="描述你想要的修改，如：改成 TypeScript / 加上错误处理 / 重构为函数"
          rows={2}
          className="w-full resize-none rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          disabled={disabled || loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">⌘+Enter 发送</span>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="h-7 px-2 text-xs"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!instruction.trim() || disabled || loading}
              className="h-7 gap-1 px-2.5 text-xs"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              修改
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
