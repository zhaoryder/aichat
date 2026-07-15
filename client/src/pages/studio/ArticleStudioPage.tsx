// 文章工坊：长文创作（SSE 流式）
// - 表单：主题 / 文体 / 字数
// - SSE：currentEvent 在 while 外部声明
// - 简单 markdown 渲染：# 标题金黄、**粗体**、> 金句卡片
// - 完成后：生成配图按钮、复制、下载 md
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, apiStream } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { SelectWithCustom } from '@/components/SelectWithCustom'
import { ARTICLE_STYLES } from '@shared/presets'

const WORD_COUNTS = [400, 800, 1200] as const

export const ArticleStudioPage = () => {
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState<string>('杂文')
  const [wordCount, setWordCount] = useState(800)

  const [fullText, setFullText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // 配图
  const [illustration, setIllustration] = useState('')
  const [illustrating, setIllustrating] = useState(false)

  const outputRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 流式输出自动滚底
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [fullText])

  // 卸载取消
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function handleGenerate() {
    const trimmed = topic.trim()
    if (!trimmed || streaming) return

    setFullText('')
    setDone(false)
    setError('')
    setIllustration('')
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await apiStream(
        '/studio/article',
        { topic: trimmed, style, wordCount },
        { signal: controller.signal },
      )

      if (!response.body) {
        setStreaming(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // 关键：currentEvent 在 while 外部声明，避免 chunk 边界 bug
      let currentEvent = ''
      let collected = ''

      while (true) {
        if (controller.signal.aborted) break
        const { done: readDone, value } = await reader.read()
        if (readDone) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            let data: { c?: string; message?: string }
            try {
              data = JSON.parse(line.slice(6))
            } catch {
              continue
            }
            if (currentEvent === 'token' && data.c) {
              collected += data.c
              setFullText(collected)
            } else if (currentEvent === 'done') {
              setDone(true)
            } else if (currentEvent === 'error') {
              setError(data.message || '文章生成失败')
            }
          }
        }
      }

      if (!controller.signal.aborted) {
        setDone(true)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setDone(true)
      } else {
        setError(err instanceof Error ? err.message : '文章生成失败')
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  // 一键生成配图
  async function handleIllustrate() {
    const trimmed = topic.trim()
    if (!trimmed || illustrating) return
    setIllustrating(true)
    try {
      const res = await apiFetch<{ images: Array<{ url: string }> }>('/studio/image', {
        method: 'POST',
        body: JSON.stringify({ prompt: trimmed, count: 1 }),
      })
      if (res.images?.[0]?.url) {
        setIllustration(res.images[0].url)
      }
    } catch (err) {
      // 配图失败不阻塞：静默
      console.warn('[article illustrate] 失败', err)
    } finally {
      setIllustrating(false)
    }
  }

  async function handleCopy() {
    if (!fullText) return
    try {
      await navigator.clipboard.writeText(fullText)
    } catch {
      // 静默
    }
  }

  function handleDownload() {
    if (!fullText) return
    const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${topic.trim() || '文章'}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link to="/studio" className="text-sm text-gray-500 hover:text-primary dark:text-gray-400">
          ← 返回创意工坊
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-gray-100">搞笑文章</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">让 AI 写一篇长文，有梗有反转</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* 表单 */}
        <Card className="h-fit p-5">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                主题 <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例如：打工人的周一早晨"
                disabled={streaming}
              />
            </div>
            <SelectWithCustom
              label="文体"
              options={ARTICLE_STYLES}
              value={style}
              onChange={setStyle}
              placeholder="选择文体"
              disabled={streaming}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">字数</label>
              <div className="flex gap-2">
                {WORD_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWordCount(n)}
                    disabled={streaming}
                    className={cn(
                      'flex-1 rounded-lg border py-2 text-sm transition-colors',
                      wordCount === n
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              {streaming ? (
                <Button variant="outline" className="flex-1" onClick={handleStop}>
                  停止生成
                </Button>
              ) : (
                <Button
                  className="flex-1 transition-transform duration-300 ease-out hover:scale-[1.02]"
                  onClick={handleGenerate}
                  disabled={!topic.trim()}
                >
                  生成文章
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* 输出区 */}
        <Card className="flex min-h-[400px] flex-col">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </div>
          )}

          {!fullText && !streaming && !error ? (
            <EmptyState
              className="flex-1"
              title="填写表单开始创作"
              description="选好文体与字数，点击「生成文章」即可看到 AI 实时写作"
            />
          ) : (
            <div className="flex flex-1 flex-col">
              <div
                ref={outputRef}
                className="flex-1 overflow-y-auto p-5 scrollbar-thin"
              >
                <ArticleMarkdown content={fullText} streaming={streaming} />
              </div>

              {done && fullText && !streaming && (
                <div className="space-y-3 border-t border-gray-100 p-4 dark:border-gray-800">
                  {/* 配图 */}
                  {illustration && (
                    <img
                      src={illustration}
                      alt="文章配图"
                      className="max-h-64 w-full rounded-lg object-cover"
                    />
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleIllustrate}
                      disabled={illustrating}
                    >
                      {illustrating ? '生成配图中…' : '生成配图'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCopy}>
                      复制
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDownload}>
                      下载 md
                    </Button>
                    <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                      共 {fullText.length} 字
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// 简单 markdown 渲染组件
// 支持：# 标题、**粗体**、> 金句卡片、- 列表
function ArticleMarkdown({ content, streaming }: { content: string; streaming: boolean }) {
  if (!content) return null
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    // 标题：# 开头
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h2
          key={`h-${i}`}
          className="mt-5 mb-3 text-2xl font-bold text-primary"
        >
          {trimmed.slice(2)}
        </h2>,
      )
    } else if (trimmed.startsWith('## ')) {
      blocks.push(
        <h3 key={`h-${i}`} className="mt-4 mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">
          {trimmed.slice(3)}
        </h3>,
      )
    } else if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4 key={`h-${i}`} className="mt-3 mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
          {trimmed.slice(4)}
        </h4>,
      )
    } else if (trimmed.startsWith('> ')) {
      // 金句卡片：金黄底色
      blocks.push(
        <blockquote
          key={`q-${i}`}
          className="my-4 rounded-lg bg-primary/15 px-4 py-3 text-base font-medium text-gray-800 dark:text-gray-200 ring-1 ring-primary/30"
        >
          {renderInline(trimmed.slice(2))}
        </blockquote>,
      )
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push(
        <div key={`li-${i}`} className="flex gap-2 py-0.5 text-sm text-gray-700 dark:text-gray-300">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{renderInline(trimmed.slice(2))}</span>
        </div>,
      )
    } else if (trimmed === '') {
      blocks.push(<div key={`br-${i}`} className="h-3" />)
    } else {
      blocks.push(
        <p key={`p-${i}`} className="py-1 text-sm leading-7 text-gray-700 dark:text-gray-300">
          {renderInline(trimmed)}
        </p>,
      )
    }
  })

  // 流式光标
  if (streaming) {
    blocks.push(
      <span
        key="cursor"
        className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-primary animate-pulse-cursor"
      />,
    )
  }

  return <div className="whitespace-normal">{blocks}</div>
}

// 行内渲染：**粗体**
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-bold text-gray-900 dark:text-gray-100">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}
