// =====================================================================
// 个性化装扮设置页
// ---------------------------------------------------------------------
// 路由：/settings
// 区块：
//   1. 主题模板（6 个内置主题，卡片网格）
//   2. 自定义颜色（主色 + 背景色，input[type=color] + 十六进制输入）
//   3. 气泡样式（4 个选项卡片）
//   4. 加载动画（4 个选项卡片）
// 右侧：实时预览区（用户气泡 + AI 气泡 + 加载动画示例 + 重置按钮）
// =====================================================================

import { useEffect, useState } from 'react'
import { Palette, Check, RotateCcw, User, Bot } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useTheme } from '@/hooks/useTheme'
import {
  THEMES,
  BUBBLE_STYLES,
  LOADING_ANIMS,
  getThemeById,
} from '@shared/themes'
import { cn } from '@/lib/utils'

// 气泡样式 → Tailwind 圆角 class
const BUBBLE_RADIUS: Record<string, string> = {
  default: 'rounded-lg',
  rounded: 'rounded-full',
  sharp: 'rounded-none',
  bubble: 'rounded-3xl rounded-br-sm',
}

export function SettingsPage() {
  const {
    theme,
    loading,
    setThemeId,
    setCustomColors,
    setBubbleStyle,
    setLoadingAnim,
    resetTheme,
  } = useTheme()

  // 本地颜色输入状态（与 theme 同步，便于 input[type=color] 即时显示）
  const [primaryInput, setPrimaryInput] = useState<string>('')
  const [backgroundInput, setBackgroundInput] = useState<string>('')

  useEffect(() => {
    setPrimaryInput(theme?.custom_colors?.primary ?? '')
    setBackgroundInput(theme?.custom_colors?.background ?? '')
  }, [theme])

  // 当前主题模板（用于显示默认色作为占位）
  const currentTemplate = theme?.theme_id ? getThemeById(theme.theme_id) : undefined
  const placeholderPrimary = currentTemplate?.primary ?? '#6366f1'
  const placeholderBackground = currentTemplate?.background ?? '#fafafa'

  // 预览实际生效的颜色（自定义优先于模板）
  const previewPrimary = primaryInput || placeholderPrimary
  const previewBackground = backgroundInput || placeholderBackground

  async function handleThemeClick(themeId: string) {
    try {
      await setThemeId(themeId)
      toast.success('主题已切换')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换失败')
    }
  }

  async function handlePrimaryChange(value: string) {
    setPrimaryInput(value)
    try {
      await setCustomColors({ primary: value })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function handleBackgroundChange(value: string) {
    setBackgroundInput(value)
    try {
      await setCustomColors({ background: value })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function handleBubbleClick(style: string) {
    try {
      await setBubbleStyle(style)
      toast.success('气泡样式已更新')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    }
  }

  async function handleLoadingClick(anim: string) {
    try {
      await setLoadingAnim(anim)
      toast.success('加载动画已更新')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    }
  }

  async function handleReset() {
    try {
      await resetTheme()
      toast.success('已重置为默认主题')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重置失败')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  const currentBubbleStyle = theme?.bubble_style ?? 'default'
  const currentLoadingAnim = theme?.loading_anim ?? 'default'

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
        <Palette className="h-6 w-6 text-primary" />
        个性化装扮
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左列：4 个设置分区 */}
        <div className="space-y-6 lg:col-span-2">
          {/* 1. 主题模板 */}
          <Card className="p-6">
            <h2 className="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100">主题模板</h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">选择一套内置配色方案。</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {THEMES.map((t) => {
                const active = theme?.theme_id === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => handleThemeClick(t.id)}
                    className={cn(
                      'hover-lift-subtle relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full shadow-md"
                      style={{ backgroundColor: t.primary }}
                    >
                      {active && <Check className="h-6 w-6 text-white" />}
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t.name}</span>
                    <span
                      className="absolute right-2 top-2 h-3 w-3 rounded-full border border-gray-200 dark:border-gray-700"
                      style={{ backgroundColor: t.background }}
                      title="背景色"
                    />
                  </button>
                )
              })}
            </div>
          </Card>

          {/* 2. 自定义颜色 */}
          <Card className="p-6">
            <h2 className="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100">自定义颜色</h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              覆盖当前主题的默认颜色，清除输入框则恢复主题色。
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ColorPicker
                label="主色"
                value={primaryInput}
                placeholder={placeholderPrimary}
                onChange={handlePrimaryChange}
                onClear={() => handlePrimaryChange('')}
              />
              <ColorPicker
                label="背景色"
                value={backgroundInput}
                placeholder={placeholderBackground}
                onChange={handleBackgroundChange}
                onClear={() => handleBackgroundChange('')}
              />
            </div>
          </Card>

          {/* 3. 气泡样式 */}
          <Card className="p-6">
            <h2 className="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100">气泡样式</h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">选择对话消息气泡的圆角风格。</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BUBBLE_STYLES.map((b) => {
                const active = currentBubbleStyle === b.id
                return (
                  <button
                    key={b.id}
                    onClick={() => handleBubbleClick(b.id)}
                    className={cn(
                      'hover-lift-subtle relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div
                      className={cn(
                        'h-8 w-12 bg-primary/80',
                        BUBBLE_RADIUS[b.id],
                      )}
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{b.name}</span>
                    {active && (
                      <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />
                    )}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* 4. 加载动画 */}
          <Card className="p-6">
            <h2 className="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100">加载动画</h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">AI 思考时的加载动画样式。</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {LOADING_ANIMS.map((a) => {
                const active = currentLoadingAnim === a.id
                return (
                  <button
                    key={a.id}
                    onClick={() => handleLoadingClick(a.id)}
                    className={cn(
                      'hover-lift-subtle relative flex h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all',
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    <LoadingPreview anim={a.id} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{a.name}</span>
                    {active && (
                      <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />
                    )}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>

        {/* 右列：实时预览 */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-4">
            <Card
              className="overflow-hidden p-6"
              style={{ backgroundColor: previewBackground }}
            >
              <h2 className="mb-4 text-lg font-bold text-gray-900">实时预览</h2>

              {/* 示例对话 */}
              <div className="space-y-3">
                {/* 用户消息 */}
                <div className="flex items-end justify-end gap-2">
                  <div
                    className={cn(
                      'max-w-[80%] px-4 py-2 text-sm text-white shadow',
                      BUBBLE_RADIUS[currentBubbleStyle],
                    )}
                    style={{ backgroundColor: previewPrimary }}
                  >
                    你好，给我讲个笑话吧！
                  </div>
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: previewPrimary }}
                  >
                    <User className="h-4 w-4" />
                  </div>
                </div>

                {/* AI 消息 */}
                <div className="flex items-end gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div
                    className={cn(
                      'max-w-[80%] bg-white px-4 py-2 text-sm text-gray-800 shadow',
                      BUBBLE_RADIUS[currentBubbleStyle],
                    )}
                  >
                    好的，让我想想……
                  </div>
                </div>

                {/* 加载动画示例 */}
                <div className="flex items-end gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div
                    className={cn(
                      'flex items-center bg-white px-4 py-3 shadow',
                      BUBBLE_RADIUS[currentBubbleStyle],
                    )}
                  >
                    <LoadingPreview anim={currentLoadingAnim} />
                  </div>
                </div>
              </div>

              {/* 重置按钮 */}
              <div className="mt-6 border-t border-gray-200/60 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="w-full bg-white/60"
                >
                  <RotateCcw className="h-4 w-4" />
                  重置为默认
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------

/** 颜色选择器：原生 input[type=color] + 十六进制文本输入 */
function ColorPicker({
  label,
  value,
  placeholder,
  onChange,
  onClear,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (v: string) => void
  onClear: () => void
}) {
  // input[type=color] 必须有值，留空时显示占位色
  const colorValue = value || placeholder

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={colorValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded border border-gray-200 dark:border-gray-700 bg-transparent p-1"
          aria-label={`${label} 颜色选择`}
        />
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value
            // 允许空、单独的 #，或 #开头的 1-8 位十六进制
            if (v === '' || v === '#' || /^#[0-9a-fA-F]{1,8}$/.test(v)) {
              onChange(v)
            }
          }}
          className="h-10 flex-1 rounded border border-gray-200 dark:border-gray-700 px-3 text-sm font-mono"
          aria-label={`${label} 十六进制值`}
        />
        {value && (
          <button
            onClick={onClear}
            className="shrink-0 text-xs text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
            title="清除（恢复主题色）"
          >
            清除
          </button>
        )}
      </div>
    </div>
  )
}

/** 加载动画预览：根据 anim 类型渲染不同样式 */
function LoadingPreview({ anim }: { anim: string }) {
  switch (anim) {
    case 'pulse':
      return (
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-pulse rounded-full bg-primary"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      )
    case 'bounce':
      return (
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      )
    case 'spin':
      // 旋转：双圈环绕
      return (
        <div className="relative h-5 w-5">
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )
    case 'default':
    default:
      // 默认旋转：Loader2 图标
      return <Spinner size="sm" className="text-primary" />
  }
}
