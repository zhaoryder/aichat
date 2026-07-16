// 表情包工坊：选择模板 + 输入文字，生成表情包
// - 表单：顶部文字 / 底部文字 / 表情模板 / 自定义 emoji
// - AI 模式：描述想要的表情，AI 建议文字
// - 结果：div 渲染的表情包（模板背景 + 文字叠加）
// - 下载：SVG → Canvas → PNG，无需额外依赖
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  Sparkles,
  Download,
  Smile,
  Type,
  Wand2,
} from 'lucide-react'

// 预设表情模板：emoji + tailwind 渐变 + 实际颜色（用于 SVG 导出）
interface MemeTemplate {
  id: string
  emoji: string
  label: string
  gradient: string
  from: string
  to: string
}

const TEMPLATES: MemeTemplate[] = [
  { id: 'huaji', emoji: '😂', label: '滑稽', gradient: 'from-yellow-400 to-orange-500', from: '#fbbf24', to: '#f97316' },
  { id: 'sikao', emoji: '🤔', label: '思考', gradient: 'from-blue-400 to-indigo-600', from: '#60a5fa', to: '#4f46e5' },
  { id: 'dese', emoji: '😎', label: '得瑟', gradient: 'from-amber-300 to-pink-500', from: '#fcd34d', to: '#ec4899' },
  { id: 'weiqu', emoji: '😭', label: '委屈', gradient: 'from-sky-300 to-blue-500', from: '#7dd3fc', to: '#3b82f6' },
  { id: 'gaoguai', emoji: '🤪', label: '搞怪', gradient: 'from-fuchsia-400 to-purple-600', from: '#e879f9', to: '#9333ea' },
  { id: 'shengqi', emoji: '😡', label: '生气', gradient: 'from-red-400 to-rose-600', from: '#f87171', to: '#e11d48' },
  { id: 'jingxia', emoji: '😨', label: '惊吓', gradient: 'from-slate-300 to-slate-600', from: '#cbd5e1', to: '#475569' },
  { id: 'aixin', emoji: '🥰', label: '爱心', gradient: 'from-pink-300 to-rose-400', from: '#f9a8d4', to: '#fb7185' },
  { id: 'tuoli', emoji: '🤯', label: '脱离', gradient: 'from-orange-400 to-red-600', from: '#fb923c', to: '#dc2626' },
  { id: 'wunai', emoji: '🤷', label: '无奈', gradient: 'from-gray-300 to-gray-500', from: '#d1d5db', to: '#6b7280' },
  { id: 'kunle', emoji: '😴', label: '困了', gradient: 'from-indigo-300 to-purple-400', from: '#a5b4fc', to: '#c084fc' },
  { id: 'chengzhang', emoji: '🤓', label: '书呆', gradient: 'from-emerald-300 to-teal-500', from: '#6ee7b7', to: '#14b8a6' },
]

interface MemeResult {
  templateId: string
  customEmoji?: string
  topText: string
  bottomText: string
  createdAt: number
}

interface SuggestResponse {
  topText?: string
  bottomText?: string
  text?: string
}

import { AICollaboratorPicker } from '@/components/AICollaboratorPicker'

export const MemeStudioPage = () => {
  const [aiCollaborator, setAiCollaborator] = useState<string | null>(null)
  const { user } = useAuth()

  const [topText, setTopText] = useState('')
  const [bottomText, setBottomText] = useState('')
  const [templateId, setTemplateId] = useState<string>('huaji')
  const [customEmoji, setCustomEmoji] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')

  const [result, setResult] = useState<MemeResult | null>(null)
  const [history, setHistory] = useState<MemeResult[]>([])
  const [loading, setLoading] = useState(false)

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]
  // 自定义 emoji 优先，否则用模板 emoji
  const displayEmoji = customEmoji.trim() || template.emoji

  async function handleGenerate() {
    if (loading) return

    if (!user) {
      toast.error('请先登录后再创作')
      return
    }

    const aiTrimmed = aiPrompt.trim()
    // 没有任何文字输入时拦截
    if (!topText.trim() && !bottomText.trim() && !aiTrimmed) {
      toast.error('请输入文字或描述你想要的表情')
      return
    }

    setLoading(true)

    try {
      let finalTop = topText.trim()
      let finalBottom = bottomText.trim()

      // AI 模式：调用接口获取建议文字
      if (aiTrimmed) {
        try {
          const res = await apiFetch<SuggestResponse>('/studio/meme', {
            method: 'POST',
            body: JSON.stringify({
              prompt: aiTrimmed,
              template: templateId,
            }),
          })
          if (res.topText) finalTop = finalTop || res.topText
          if (res.bottomText) finalBottom = finalBottom || res.bottomText
          if (!res.topText && !res.bottomText && res.text) {
            finalTop = finalTop || res.text
          }
        } catch {
          // 兜底：通用生成端点
          const res = await apiFetch<SuggestResponse>('/studio/generate', {
            method: 'POST',
            body: JSON.stringify({ type: 'meme', prompt: aiTrimmed, template: templateId }),
          })
          if (res.topText) finalTop = finalTop || res.topText
          if (res.bottomText) finalBottom = finalBottom || res.bottomText
          if (!res.topText && !res.bottomText && res.text) {
            finalTop = finalTop || res.text
          }
        }
      }

      const item: MemeResult = {
        templateId,
        customEmoji: customEmoji.trim() || undefined,
        topText: finalTop,
        bottomText: finalBottom,
        createdAt: Date.now(),
      }
      setResult(item)
      setHistory((prev) => [item, ...prev].slice(0, 12))
      toast.success('表情包已生成')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '表情包生成失败'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // 下载：构造 SVG → 转 PNG（无需外部依赖）
  function downloadMeme(item: MemeResult) {
    const tpl = TEMPLATES.find((t) => t.id === item.templateId) ?? TEMPLATES[0]
    const emoji = item.customEmoji || tpl.emoji
    const W = 800
    const H = 800

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${tpl.from}" />
      <stop offset="100%" stop-color="${tpl.to}" />
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)" />
  <text x="50%" y="48%" text-anchor="middle" dominant-baseline="middle" font-size="320" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
  ${item.topText ? renderSvgText(item.topText, W / 2, 70, W * 0.9) : ''}
  ${item.bottomText ? renderSvgText(item.bottomText, W / 2, H - 50, W * 0.9) : ''}
</svg>`

    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        toast.error('无法创建画布，请重试')
        return
      }
      ctx.drawImage(img, 0, 0, W, H)
      URL.revokeObjectURL(url)
      try {
        canvas.toBlob((blob) => {
          if (!blob) {
            toast.error('导出失败，请重试')
            return
          }
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = `meme-${item.createdAt}.png`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(link.href)
        }, 'image/png')
      } catch {
        toast.error('导出失败，可能是浏览器限制')
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error('表情包渲染失败')
    }
    img.src = url
  }

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      <AICollaboratorPicker specialty="meme" value={aiCollaborator} onChange={setAiCollaborator} />
      {/* 头部 */}
      <header className="mb-8">
        <Link
          to="/studio"
          className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-primary dark:text-gray-400"
        >
          <ChevronLeft className="h-4 w-4" />
          返回创意工坊
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Smile className="h-6 w-6" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-primary via-fuchsia-500 to-pink-500 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
              表情包制作
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              挑个表情，配上文字，AI 还能帮你写台词
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        {/* 左侧：表单 */}
        <Card className="hover-lift h-fit p-5">
          <div className="space-y-5">
            {/* 顶部文字 */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Type className="h-4 w-4 text-primary" />
                顶部文字
              </label>
              <Input
                value={topText}
                onChange={(e) => setTopText(e.target.value)}
                placeholder="例如：当我看到工资条"
                disabled={loading}
              />
            </div>

            {/* 底部文字 */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Type className="h-4 w-4 text-primary" />
                底部文字
              </label>
              <Input
                value={bottomText}
                onChange={(e) => setBottomText(e.target.value)}
                placeholder="例如：笑不出来"
                disabled={loading}
              />
            </div>

            {/* 自定义 emoji */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Smile className="h-4 w-4 text-primary" />
                自定义 emoji <span className="text-gray-400 dark:text-gray-500">（可选，覆盖模板）</span>
              </label>
              <Input
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value)}
                placeholder="例如：🦄 或 🐱"
                disabled={loading}
                maxLength={4}
              />
            </div>

            {/* AI 描述 */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Wand2 className="h-4 w-4 text-primary" />
                AI 生成台词 <span className="text-gray-400 dark:text-gray-500">（可选）</span>
              </label>
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="描述你想要的表情包，AI 会帮你写台词。例如：一只社恐猫咪被同事约饭的内心 OS"
                rows={3}
                disabled={loading}
              />
            </div>

            <Button
              className="w-full transition-transform duration-300 ease-out hover:scale-[1.02]"
              onClick={handleGenerate}
              disabled={
                loading || (!topText.trim() && !bottomText.trim() && !aiPrompt.trim())
              }
            >
              {loading ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  生成中…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  生成表情包
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* 右侧：模板选择 + 结果 */}
        <div className="space-y-6">
          {/* 模板画廊 */}
          <Card className="hover-lift p-5">
            <h2 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              选择表情模板
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  disabled={loading}
                  className={cn(
                    'group flex aspect-square flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br text-white shadow-sm transition-all duration-300 ease-out',
                    t.gradient,
                    templateId === t.id
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.04]'
                      : 'hover:scale-[1.05] hover:shadow-md',
                  )}
                >
                  <span className="text-3xl transition-transform duration-300 group-hover:scale-110">
                    {t.emoji}
                  </span>
                  <span className="text-xs font-medium drop-shadow-sm">{t.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* 结果展示 */}
          <Card className="hover-lift flex min-h-[400px] flex-col">
            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
                <div className="aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
                  <Skeleton className="h-full w-full" />
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  AI 正在为你构思台词…
                </p>
              </div>
            ) : result ? (
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(result.createdAt).toLocaleString('zh-CN')}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadMeme(result)}
                  >
                    <Download className="h-4 w-4" />
                    下载
                  </Button>
                </div>
                <div className="flex flex-1 items-center justify-center">
                  <MemeCanvas
                    template={template}
                    emoji={displayEmoji}
                    topText={result.topText}
                    bottomText={result.bottomText}
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                className="flex-1"
                icon={<Smile className="h-10 w-10" />}
                title="还没有生成表情包"
                description="选择一个模板，输入文字或 AI 描述，点击「生成表情包」"
              />
            )}
          </Card>
        </div>
      </div>

      {/* 历史记录 */}
      {history.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">本次会话历史</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">共 {history.length} 个</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {history.map((item, i) => {
              const tpl = TEMPLATES.find((t) => t.id === item.templateId) ?? TEMPLATES[0]
              const emoji = item.customEmoji || tpl.emoji
              return (
                <Card
                  key={`${item.createdAt}-${i}`}
                  className="hover-lift group overflow-hidden p-0 transition-transform duration-300 ease-out hover:scale-[1.03]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setResult(item)
                      setTemplateId(item.templateId)
                      setCustomEmoji(item.customEmoji || '')
                    }}
                    className="block w-full"
                  >
                    <div className="relative aspect-square">
                      <MemeCanvas template={tpl} emoji={emoji} topText={item.topText} bottomText={item.bottomText} />
                    </div>
                  </button>
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(item.createdAt).toLocaleTimeString('zh-CN')}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadMeme(item)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-primary/10 hover:text-primary dark:text-gray-500"
                      aria-label="下载表情包"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// 表情包画布：div 渲染模板背景 + emoji + 顶/底文字叠加
function MemeCanvas({
  template,
  emoji,
  topText,
  bottomText,
}: {
  template: MemeTemplate
  emoji: string
  topText: string
  bottomText: string
}) {
  return (
    <div
      className={cn(
        'relative flex aspect-square w-full max-w-sm items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br shadow-sm',
        template.gradient,
      )}
    >
      {/* 居中大 emoji */}
      <span className="select-none text-[7rem] leading-none drop-shadow-lg sm:text-[8rem]">
        {emoji}
      </span>

      {/* 顶部文字 */}
      {topText && (
        <span className="absolute left-1/2 top-3 w-[90%] -translate-x-1/2 text-center text-xl font-extrabold text-white [text-shadow:_0_2px_4px_rgb(0_0_0_/_60%)] sm:text-2xl">
          {topText}
        </span>
      )}

      {/* 底部文字 */}
      {bottomText && (
        <span className="absolute bottom-3 left-1/2 w-[90%] -translate-x-1/2 text-center text-xl font-extrabold text-white [text-shadow:_0_2px_4px_rgb(0_0_0_/_60%)] sm:text-2xl">
          {bottomText}
        </span>
      )}
    </div>
  )
}

// SVG 文字渲染（带描边，自动换行）
function renderSvgText(text: string, x: number, y: number, maxWidth: number): string {
  // 简单按字符宽度换行（中文逐字估算）
  const fontSize = 48
  const charWidth = fontSize
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / charWidth))
  const chars = Array.from(text)
  const lines: string[] = []
  for (let i = 0; i < chars.length; i += maxCharsPerLine) {
    lines.push(chars.slice(i, i + maxCharsPerLine).join(''))
  }

  return lines
    .map((line, idx) => {
      const lineY = y + idx * (fontSize + 6)
      const escaped = escapeXml(line)
      return `<text x="${x}" y="${lineY}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="PingFang SC, Microsoft YaHei, sans-serif" fill="#ffffff" stroke="#000000" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${escaped}</text>`
    })
    .join('')
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
