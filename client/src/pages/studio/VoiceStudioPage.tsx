// 语音工坊：TTS 语音合成
// - 表单：文本（长文本）/ 音色选择
// - 提交：返回 audioUrl
// - 完成后：audio 播放器 + 下载链接 + 分享按钮
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

// 预设音色：value 传给后端 voice 字段
const VOICES: { value: string; label: string }[] = [
  { value: '', label: '默认' },
  { value: '活泼少女', label: '活泼少女' },
  { value: '沉稳大叔', label: '沉稳大叔' },
  { value: '温柔姐姐', label: '温柔姐姐' },
  { value: '搞怪少年', label: '搞怪少年' },
]

export const VoiceStudioPage = () => {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('')

  const [audioUrl, setAudioUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setError('')
    setAudioUrl('')

    try {
      const res = await apiFetch<{ audioUrl: string }>('/studio/voice', {
        method: 'POST',
        body: JSON.stringify({ text: trimmed, voice: voice || undefined }),
      })
      setAudioUrl(res.audioUrl)
    } catch (err) {
      const raw = err instanceof Error ? err.message : '语音生成失败'
      // 429 友好提示：免费额度有限
      const friendly = /429|too many requests|繁忙|限流/i.test(raw)
        ? '语音合成服务繁忙（免费额度有限），请稍后重试'
        : raw
      setError(friendly)
    } finally {
      setLoading(false)
    }
  }

  // 分享：复制 audioUrl
  async function handleShare() {
    if (!audioUrl) return
    try {
      await navigator.clipboard.writeText(audioUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 静默
    }
  }

  const charCount = text.length

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link to="/studio" className="text-sm text-gray-500 hover:text-primary">
          ← 返回创意工坊
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-gray-900">搞笑语音</h1>
        <p className="mt-1 text-sm text-gray-500">把文字变成会说话的搞笑语音</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px]">
        {/* 表单 */}
        <Card className="p-5">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                文本 <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="输入要合成语音的文字，越长越好，越搞怪越好…"
                rows={10}
                maxLength={500}
                disabled={loading}
              />
              <p className="mt-1 text-right text-xs text-gray-400">{charCount}/500</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">音色</label>
              <div className="flex flex-wrap gap-2">
                {VOICES.map((v) => (
                  <button
                    key={v.value || 'default'}
                    type="button"
                    onClick={() => setVoice(v.value)}
                    disabled={loading}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      voice === v.value
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300',
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="transition-transform duration-300 ease-out hover:scale-[1.02]"
              onClick={handleGenerate}
              disabled={!text.trim() || loading}
            >
              {loading ? '合成中…' : '生成语音'}
            </Button>
          </div>
        </Card>

        {/* 结果区 */}
        <Card className="flex min-h-[400px] flex-col">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
              <Spinner className="h-10 w-10" />
              <p className="text-sm font-medium text-gray-600">AI 正在合成语音…</p>
              {/* indeterminate shimmer 进度条 */}
              <div className="mt-2 h-1 w-full max-w-md overflow-hidden rounded-full bg-gray-200">
                <div className="h-full w-full animate-shimmer rounded-full bg-gradient-to-r from-transparent via-primary to-transparent bg-[length:200%_100%]" />
              </div>
            </div>
          ) : audioUrl ? (
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-4 flex items-center gap-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                  <path d="M11 5L6 9H3v6h3l5 4V5z" strokeLinejoin="round" />
                  <path d="M15.5 8.5a5 5 0 010 7" strokeLinecap="round" />
                </svg>
                <span className="text-sm font-medium text-gray-700">语音已生成</span>
              </div>
              <audio src={audioUrl} controls className="w-full" />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={audioUrl} download={`voice-${Date.now()}.mp3`}>
                    下载语音
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={audioUrl} target="_blank" rel="noreferrer">
                    新窗口打开
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={handleShare}>
                  {copied ? '已复制链接' : '分享'}
                </Button>
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={() => setAudioUrl('')}
                >
                  再生成一个
                </Button>
              </div>
            </div>
          ) : (
            !error && (
              <EmptyState
                className="flex-1"
                title="输入文字开始合成"
                description="选择一个音色，让 AI 把你的文字念出来"
              />
            )
          )}
        </Card>
      </div>
    </div>
  )
}
