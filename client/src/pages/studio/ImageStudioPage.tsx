// 图片工坊：CogView4 文生图
// - 表单：描述 / 风格 / 数量(1-4)
// - 画廊网格：点击放大（Dialog）、单独下载、全部下载
// - 表情包字幕（Canvas 合成）：drawImage + fillText → toDataURL 下载
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Dialog } from '@/components/ui/Dialog'
import { cn } from '@/lib/utils'

const STYLES = ['动漫', '写实', '油画', '水彩', '像素风'] as const

interface ImageItem {
  url: string
}

export const ImageStudioPage = () => {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<string>('')
  const [count, setCount] = useState(1)

  const [images, setImages] = useState<ImageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 放大查看
  const [previewUrl, setPreviewUrl] = useState('')

  // 字幕
  const [caption, setCaption] = useState('')

  async function handleGenerate() {
    const trimmed = prompt.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setError('')
    setImages([])

    try {
      const res = await apiFetch<{ images: ImageItem[] }>('/studio/image', {
        method: 'POST',
        body: JSON.stringify({ prompt: trimmed, style: style.trim(), count }),
      })
      setImages(res.images ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片生成失败')
    } finally {
      setLoading(false)
    }
  }

  // 下载单张图片：直接用 a 标签触发
  function downloadImage(url: string, name: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // 全部下载：依次触发
  function downloadAll() {
    images.forEach((img, i) => {
      // 稍微错开避免浏览器拦截并发下载
      setTimeout(() => downloadImage(img.url, `ai-image-${Date.now()}-${i + 1}.png`), i * 300)
    })
  }

  // Canvas 合成字幕：drawImage + fillText → toDataURL 下载
  async function downloadWithCaption(url: string, text: string, index: number) {
    if (!text.trim()) {
      // 无字幕直接下载原图
      downloadImage(url, `meme-${Date.now()}-${index}.png`)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('图片加载失败'))
    })

    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // Canvas 不可用：回退原图
      downloadImage(url, `meme-${Date.now()}-${index}.png`)
      return
    }

    // 画原图
    ctx.drawImage(img, 0, 0)

    // 字幕样式：白色文字 + 黑色描边，贴近底部
    const fontSize = Math.max(24, Math.floor(canvas.width / 14))
    ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = Math.max(2, Math.floor(fontSize / 12))
    ctx.lineJoin = 'round'

    // 自动换行
    const maxWidth = canvas.width * 0.9
    const lines = wrapText(ctx, text.trim(), maxWidth)
    const lineHeight = fontSize * 1.2
    const padding = fontSize * 0.6
    const startY = canvas.height - padding - (lines.length - 1) * lineHeight

    lines.forEach((line, i) => {
      const y = startY + i * lineHeight
      ctx.strokeText(line, canvas.width / 2, y)
      ctx.fillText(line, canvas.width / 2, y)
    })

    // 导出
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `meme-${Date.now()}-${index}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      // toDataURL 可能因跨域失败：回退原图
      downloadImage(url, `meme-${Date.now()}-${index}.png`)
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link to="/studio" className="text-sm text-gray-500 hover:text-primary">
          ← 返回创意工坊
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-gray-900">搞笑图片</h1>
        <p className="mt-1 text-sm text-gray-500">CogView4 文生图，还能合成表情包字幕</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* 表单 */}
        <Card className="h-fit p-5">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                描述 <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：一只穿着西装的猫在开早会"
                rows={4}
                disabled={loading}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                风格 <span className="text-gray-400">（可选）</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(style === s ? '' : s)}
                    disabled={loading}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      style === s
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                数量
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    disabled={loading}
                    className={cn(
                      'h-10 w-10 rounded-lg border text-sm transition-colors',
                      count === n
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                表情包字幕 <span className="text-gray-400">（可选，合成到图上）</span>
              </label>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="例如：本喵在开人 类 学 研讨会"
                disabled={loading}
              />
            </div>
            <Button
              className="w-full transition-transform duration-300 ease-out hover:scale-[1.02]"
              onClick={handleGenerate}
              disabled={!prompt.trim() || loading}
            >
              {loading ? '生成中…' : '生成图片'}
            </Button>
          </div>
        </Card>

        {/* 画廊 */}
        <Card className="flex min-h-[400px] flex-col">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
              <Spinner className="h-10 w-10" />
              <p className="text-sm font-medium text-gray-600">AI 正在绘画…</p>
            </div>
          ) : images.length === 0 && !error ? (
            <EmptyState
              className="flex-1"
              title="输入描述开始作画"
              description="描述越具体，画面越精彩"
            />
          ) : (
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">共 {images.length} 张</span>
                {images.length > 0 && (
                  <Button size="sm" variant="outline" onClick={downloadAll}>
                    全部下载
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {images.map((img, i) => (
                  <div key={i} className="group overflow-hidden rounded-lg ring-1 ring-gray-200">
                    <div className="relative">
                      <img
                        src={img.url}
                        alt={`生成图 ${i + 1}`}
                        className="w-full cursor-zoom-in bg-gray-50 transition-transform duration-300 group-hover:scale-[1.02]"
                        onClick={() => setPreviewUrl(img.url)}
                      />
                    </div>
                    <div className="flex items-center gap-2 border-t border-gray-100 p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadWithCaption(img.url, caption, i + 1)
                        }
                      >
                        {caption.trim() ? '下载带字幕版' : '下载'}
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <a href={img.url} target="_blank" rel="noreferrer">
                          新窗口
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 大图预览 */}
      <Dialog open={!!previewUrl} onClose={() => setPreviewUrl('')} className="max-w-3xl">
        {previewUrl && (
          <img src={previewUrl} alt="大图预览" className="w-full rounded-lg" />
        )}
      </Dialog>
    </div>
  )
}

// Canvas 文本自动换行
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = Array.from(text)
  const lines: string[] = []
  let current = ''
  for (const ch of chars) {
    const test = current + ch
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = ch
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}
