// =====================================================================
// StreamingIndicator：流式体验优化组合组件
// ---------------------------------------------------------------------
// - TypingCursor：打字机光标，流式输出时在消息末尾显示闪烁竖线光标
// - ThinkingIndicator：Agent 思考状态，流式开始前/中显示跳动圆点
// - ToolProgress：工具调用进度条，工具执行时显示无限循环进度动画
// - 暗色模式适配；framer-motion + lucide-react
// =====================================================================

import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

// ---------------------------------------------------------------------
// 打字机光标 — 显示在流式消息末尾
// ---------------------------------------------------------------------
// 使用 CSS animation（caret-blink）而非 framer-motion，性能更好；
// keyframes 通过内联 <style> 注入，避免改全局 CSS 文件。

export function TypingCursor({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <>
      <style>{`
        @keyframes caret-blink {
          0%, 50% { opacity: 1 }
          50.01%, 100% { opacity: 0 }
        }
      `}</style>
      <span
        className="inline-block w-2 h-4 bg-primary ml-0.5 align-middle"
        style={{ animation: 'caret-blink 1s steps(2) infinite' }}
      />
    </>
  )
}

// ---------------------------------------------------------------------
// Agent 思考状态 — 流式开始前显示
// ---------------------------------------------------------------------
// 三个圆点跳动动画（类 ChatGPT 风格），可选显示角色名。

export function ThinkingIndicator({
  visible,
  role,
}: {
  visible: boolean
  role?: string
}) {
  if (!visible) return null
  return (
    <div className="flex items-center gap-2 py-1 px-2 text-xs text-gray-500 dark:text-gray-400">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
      <span>{role ? `${role} 正在思考...` : '正在思考...'}</span>
    </div>
  )
}

// ---------------------------------------------------------------------
// 工具调用进度条 — 工具执行时显示
// ---------------------------------------------------------------------
// 进度条用渐变位移动画（无限循环），因为不知道实际进度百分比。

export function ToolProgress({
  name,
  isExecuting,
}: {
  name: string
  isExecuting: boolean
}) {
  if (!isExecuting) return null
  return (
    <div className="flex items-center gap-2 py-1 px-2 text-xs text-blue-600 dark:text-blue-400">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>执行 {name}...</span>
      <div className="relative h-0.5 w-16 bg-blue-100 dark:bg-blue-900/30 rounded overflow-hidden">
        <motion.div
          className="absolute h-full bg-blue-500 rounded"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: '50%' }}
        />
      </div>
    </div>
  )
}
