// 趣味海报工坊：输入主题，AI 生成趣味海报
// - 表单：海报主题描述 / 模板 / 配色方案
// - 结果：海报图片 + 下载按钮
// - 历史：本地状态记录本次会话内生成过的海报
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
  Image as ImageIcon,
  Palette,
  Wand2,
} from 'lucide-react'

// 预设模板
const TEMPLATES = [
  { id: 'festival', label: '节日海报' },
  { id: 'product', label: '产品宣传' },
  { id: 'joke', label: '搞笑段子' },
  { id: 'motivational', label: '励志名言' },
] as const

// 预设配色方案：tailwind 渐变 + 展示用的色块
const COLOR_SCHEMES = [
  { id: 'rainbow', label: '彩虹', preview: 'from-pink-500 via-yellow-400 to-cyan-400' },
  { id: 'retro', label: '复古', preview: 'from-amber-500 to-rose-700' },
  { id: 'minimal', label: '极简', preview: 'from-slate-200 to-slate-400' },
  { id: 'dark', label: '暗夜', preview: 'from-slate-800 to-indigo-900' },
  { id: 'candy', label: '糖果', preview: 'from-pink-300 to-purple-300' },
] as const

interface PosterItem {
  id: string
  url: string
  prompt: string
  template: string
  colorScheme: string
  createdAt: number
}

interface GenerateResponse {
  url: string
  prompt?: string
}

import { AICollaboratorPicker } from '@/components/AICollaboratorPicker'

export const PosterStudioPage = () => {
  const [aiCollaborator, setAiCollaborator] = useState<string | null>(null)
  const { user } = useAuth()

  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [template, setTemplate] = useState<string>('festival')
  const [colorScheme, setColorScheme] = useState<string>('rainbow')

  const [current, setCurrent] = useState<PosterItem | null>(null)
  const [history, setHistory] = useState<PosterItem[]>([])
  const [loading, setLoading] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  async function handleGenerate() {
    const trimmed = prompt.trim()
    if (!trimmed || loading) return

    if (!user) {
      toast.error('请先登录后再创作')
      return
    }

    setLoading(true)
    setImageLoaded(false)
    setCurrent(null)

    const payload = {
      prompt: trimmed,
      title: title.trim() || undefined,
      template,
      colorScheme,
    }

    try {
      // 主端点：POST /studio/poster（服务端就绪后直接生效）
      let res: GenerateResponse
      try {
        res = await apiFetch<GenerateResponse>('/studio/poster', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      } catch {
        // 兜底：服务端尚未提供 /studio/poster 时走通用生成端点
        res = await apiFetch<GenerateResponse>('/studio/generate', {
          method: 'POST',
          body: JSON.stringify({ type: 'poster', ...payload }),
        })
      }

      if (!res?.url) {
        throw new Error('未返回海报图片地址')
      }

      const item: PosterItem = {
        id: `${Date.now()}`,
        url: res.url,
        prompt: trimmed,
        template,
        colorScheme,
        createdAt: Date.now(),
      }
      setCurrent(item)
      setHistory((prev) => [item, ...prev].slice(0, 12))
      toast.success('海报已生成')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '海报生成失败'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  function downloadPoster(url: string, name: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      <AICollaboratorPicker specialty="poster" value={aiCollaborator} onChange={setAiCollaborator} />
      {/* 头部：返回链接 + 渐变标题 */}
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
            <ImageIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
              趣味海报
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">输入主题，AI 帮你生成一张趣味海报</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        {/* 左侧：表单 */}
        <Card className="hover-lift h-fit p-5">
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                海报标题 <span className="text-gray-400 dark:text-gray-500">（可选）</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：夏日海滩派对"
                disabled={loading}
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Wand2 className="h-4 w-4 text-primary" />
                海报主题 <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：夏日海滩派对，阳光、沙滩、冰镇西瓜，邀请大家一起来玩水"
                rows={5}
                disabled={loading}
              />
              <p className="mt-1 text-right text-xs text-gray-400 dark:text-gray-500">{prompt.length} 字</p>
            </div>

            {/* 模板选择 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">选择模板</label>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    disabled={loading}
                    className={cn(
                      'rounded-full border px-4 py-1.5 text-sm transition-all duration-300 ease-out',
                      template === t.id
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-gray-200 text-gray-600 hover:scale-[1.03] hover:border-primary/40 hover:text-primary dark:border-gray-700 dark:text-gray-400',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 配色方案 */}
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Palette className="h-4 w-4 text-primary" />
                配色方案
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_SCHEMES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColorScheme(c.id)}
                    disabled={loading}
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-300 ease-out',
                      colorScheme === c.id
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-gray-200 text-gray-600 hover:scale-[1.03] hover:border-primary/40 hover:text-primary dark:border-gray-700 dark:text-gray-400',
                    )}
                  >
                    <span
                      className={cn(
                        'h-4 w-4 rounded-full bg-gradient-to-r',
                        c.preview,
                      )}
                    />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full transition-transform duration-300 ease-out hover:scale-[1.02]"
              onClick={handleGenerate}
              disabled={!prompt.trim() || loading}
            >
              {loading ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  生成中…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  生成海报
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* 右侧：结果展示 */}
        <Card className="hover-lift flex min-h-[480px] flex-col">
          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
              <div className="flex aspect-[3/4] w-full max-w-sm overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
                <Skeleton className="h-full w-full" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">AI 正在为你绘制海报…</p>
            </div>
          ) : current ? (
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {current.prompt}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    {new Date(current.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadPoster(current.url, `poster-${current.id}.png`)
                  }
                >
                  <Download className="h-4 w-4" />
                  下载
                </Button>
              </div>
              <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4">
                {!imageLoaded && <Skeleton className="absolute inset-4 rounded-lg" />}
                <img
                  src={current.url}
                  alt={current.prompt}
                  onLoad={() => setImageLoaded(true)}
                  className={cn(
                    'max-h-[520px] w-auto max-w-full rounded-lg shadow-sm transition-all duration-500',
                    imageLoaded ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </div>
            </div>
          ) : (
            <EmptyState
              className="flex-1"
              icon={<ImageIcon className="h-10 w-10" />}
              title="还没有生成海报"
              description="在左侧输入主题，选择模板与配色，点击「生成海报」即可"
            />
          )}
        </Card>
      </div>

      {/* 历史记录 */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">本次会话历史</h2>
          {history.length > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">共 {history.length} 张</span>
          )}
        </div>

        {history.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              icon={<ImageIcon className="h-8 w-8" />}
              title="暂无历史记录"
              description="生成的海报会在这里展示（仅本次会话，刷新后清空）"
            />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {history.map((item) => (
              <Card
                key={item.id}
                className="hover-lift group overflow-hidden p-0 transition-transform duration-300 ease-out hover:scale-[1.03]"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-gray-100 dark:bg-gray-800">
                  <img
                    src={item.url}
                    alt={item.prompt}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <button
                    type="button"
                    onClick={() => downloadPoster(item.url, `poster-${item.id}.png`)}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-300 hover:bg-black/70 group-hover:opacity-100"
                    aria-label="下载海报"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                    {item.prompt}
                  </p>
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                    {new Date(item.createdAt).toLocaleTimeString('zh-CN')}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
