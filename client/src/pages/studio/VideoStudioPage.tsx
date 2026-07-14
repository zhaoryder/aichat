// 视频工坊：AI 生成搞笑短视频
// - 提交任务 → 拿 taskId → 轮询状态（每 5 秒）
// - 进度条：pending / processing / SUCCESS / FAIL
// - 超时：轮询超过 5 分钟提示
// - 完成：展示 video 播放器 + 下载链接
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { SelectWithCustom } from '@/components/SelectWithCustom'
import { VIDEO_STYLES } from '@shared/presets'
import { cn } from '@/lib/utils'

// 视频状态：服务端 SUCCESS / FAIL / pending / processing 等
type VideoPhase = 'idle' | 'submitting' | 'pending' | 'processing' | 'success' | 'failed' | 'timeout'

const POLL_INTERVAL = 10000 // 10 秒（减少请求次数避免 429）
const TIMEOUT_MS = 10 * 60 * 1000 // 10 分钟（CogVideoX-3 生成 10 秒视频可能需 3-5 分钟）

// 状态文案
const PHASE_TEXT: Record<VideoPhase, string> = {
  idle: '',
  submitting: '正在提交任务…',
  pending: '任务排队中…',
  processing: 'AI 正在生成视频…',
  success: '生成完成',
  failed: '生成失败',
  timeout: '生成超时',
}

// 分阶段进度：提交中 → 排队中 → 生成中 → 完成
const STAGES = ['提交中', '排队中', '生成中', '完成'] as const

/** 把当前 phase 映射到 STAGES 的索引（-1 表示未进入流程，如 idle/failed/timeout） */
function phaseToStageIndex(phase: VideoPhase): number {
  switch (phase) {
    case 'submitting':
      return 0
    case 'pending':
      return 1
    case 'processing':
      return 2
    case 'success':
      return 3
    default:
      return -1
  }
}

export const VideoStudioPage = () => {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('')
  const [duration, setDuration] = useState<5 | 10>(5)

  const [phase, setPhase] = useState<VideoPhase>('idle')
  const [videoUrl, setVideoUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [error, setError] = useState('')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const [elapsedSec, setElapsedSec] = useState(0)

  // 清理轮询定时器
  const clearPoll = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // 组件卸载清理
  useEffect(() => {
    return () => clearPoll()
  }, [clearPoll])

  // 计时器：显示已等待秒数
  useEffect(() => {
    if (phase !== 'pending' && phase !== 'processing') {
      setElapsedSec(0)
      return
    }
    const t = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  // 轮询单次状态查询
  const pollOnce = useCallback(
    async (taskId: string) => {
      // 超时检查
      if (Date.now() - startTimeRef.current > TIMEOUT_MS) {
        clearPoll()
        setPhase('timeout')
        return
      }
      try {
        const res = await apiFetch<{ status: string; videoUrl?: string; coverUrl?: string; error?: string }>(
          `/studio/video/status/${taskId}`,
        )
        const status = (res.status || '').toUpperCase()
        if (status === 'SUCCESS' && res.videoUrl) {
          clearPoll()
          setVideoUrl(res.videoUrl)
          if (res.coverUrl) setCoverUrl(res.coverUrl)
          setPhase('success')
        } else if (status === 'FAIL' || status === 'FAILED') {
          clearPoll()
          setError(res.error || '视频生成失败')
          setPhase('failed')
        } else if (status === 'PROCESSING') {
          setPhase('processing')
        } else {
          // pending 或未知：保持当前阶段
          setPhase((p) => (p === 'processing' ? p : 'pending'))
        }
      } catch (err) {
        // 单次查询失败不终止轮询，保留上次状态
        // 连续失败最终会触发超时
        console.warn('[video poll] 查询失败', err)
      }
    },
    [clearPoll],
  )

  // 提交任务并启动轮询
  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || phase === 'submitting' || phase === 'pending' || phase === 'processing') {
      return
    }

    setError('')
    setVideoUrl('')
    setPhase('submitting')
    clearPoll()

    try {
      const res = await apiFetch<{ taskId: string }>('/studio/video/create', {
        method: 'POST',
        body: JSON.stringify({ prompt: trimmed, style: style.trim(), duration }),
      })
      const taskId = res.taskId
      if (!taskId) {
        setError('未拿到任务 ID')
        setPhase('failed')
        return
      }
      setPhase('pending')
      startTimeRef.current = Date.now()
      // 立即查询一次
      pollOnce(taskId)
      // 启动定时轮询
      timerRef.current = setInterval(() => pollOnce(taskId), POLL_INTERVAL)
    } catch (err) {
      const raw = err instanceof Error ? err.message : '提交任务失败'
      // 429 友好提示：智谱 CogVideoX 免费额度有限
      const friendly =
        /429|too many requests|繁忙|限流/i.test(raw)
          ? '视频生成服务繁忙（免费额度有限），请稍后重试'
          : raw
      setError(friendly)
      setPhase('failed')
    }
  }, [prompt, style, duration, phase, clearPoll, pollOnce])

  // 重试：重新提交相同参数
  const handleRetry = useCallback(() => {
    setPhase('idle')
    setError('')
    setVideoUrl('')
    handleSubmit()
  }, [handleSubmit])

  const isWorking =
    phase === 'submitting' || phase === 'pending' || phase === 'processing'

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link to="/studio" className="text-sm text-gray-500 hover:text-primary">
          ← 返回创意工坊
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-gray-900">搞笑视频</h1>
        <p className="mt-1 text-sm text-gray-500">用 AI 生成一段搞笑短视频</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]">
        {/* 表单 */}
        <Card className="h-fit p-5">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                主题 <span className="text-red-500">*</span>
              </label>
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：孔子教你用筷子吃牛排"
                disabled={isWorking}
              />
            </div>
            <SelectWithCustom
              label="风格"
              options={VIDEO_STYLES}
              value={style}
              onChange={setStyle}
              placeholder="选择风格（可选）"
              disabled={isWorking}
            />
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">时长</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDuration(5)}
                  disabled={isWorking}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-sm transition-all',
                    duration === 5
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  )}
                >
                  5 秒
                </button>
                <button
                  type="button"
                  onClick={() => setDuration(10)}
                  disabled={isWorking}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-sm transition-all',
                    duration === 10
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  )}
                >
                  10 秒
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">含 AI 音效，429 时自动重试</p>
            </div>
            <Button
              className="w-full transition-transform duration-300 ease-out hover:scale-[1.02]"
              onClick={handleSubmit}
              disabled={!prompt.trim() || isWorking}
            >
              {phase === 'idle' ? '生成视频' : '生成中…'}
            </Button>
          </div>
        </Card>

        {/* 结果区 */}
        <Card className="flex min-h-[400px] flex-col">
          {phase === 'idle' ? (
            <EmptyState
              className="flex-1"
              title="填写表单开始生成"
              description="视频生成通常需要几分钟，请耐心等待"
            />
          ) : isWorking ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
              <Spinner className="h-10 w-10" />
              <p className="text-sm font-medium text-gray-700">{PHASE_TEXT[phase]}</p>
              {/* 分阶段进度条：提交中 → 排队中 → 生成中 → 完成 */}
              <div className="flex w-full max-w-md items-start">
                {STAGES.map((stage, i) => {
                  const currentStage = phaseToStageIndex(phase)
                  const reached = i <= currentStage
                  const isCurrent = i === currentStage
                  return (
                    <div key={stage} className="flex flex-1 flex-col items-center">
                      <div className="flex w-full items-center">
                        {/* 左侧连线 */}
                        <div
                          className={cn(
                            'h-0.5 flex-1',
                            i === 0 ? 'bg-transparent' : reached ? 'bg-primary' : 'bg-gray-200',
                          )}
                        />
                        {/* 圆点 */}
                        <div
                          className={cn(
                            'h-3 w-3 shrink-0 rounded-full transition-colors',
                            isCurrent
                              ? 'animate-pulse bg-primary ring-4 ring-primary/20'
                              : reached
                                ? 'bg-green-500'
                                : 'bg-gray-300',
                          )}
                        />
                        {/* 右侧连线 */}
                        <div
                          className={cn(
                            'h-0.5 flex-1',
                            i === STAGES.length - 1
                              ? 'bg-transparent'
                              : i < currentStage
                                ? 'bg-primary'
                                : 'bg-gray-200',
                          )}
                        />
                      </div>
                      <span
                        className={cn(
                          'mt-2 whitespace-nowrap text-xs',
                          isCurrent
                            ? 'font-medium text-primary'
                            : reached
                              ? 'text-green-600'
                              : 'text-gray-400',
                        )}
                      >
                        {stage}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400">
                已等待 {Math.floor(elapsedSec / 60)}分{elapsedSec % 60}秒 · 通常 3-5 分钟 · 每 10 秒自动刷新
              </p>
            </div>
          ) : phase === 'success' && videoUrl ? (
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="default">已完成</Badge>
                <span className="text-sm text-gray-500">视频已生成，可播放或下载</span>
              </div>
              <video
                src={videoUrl}
                poster={coverUrl || undefined}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
                style={{ maxHeight: '60vh' }}
              />
              <div className="mt-4 flex items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={videoUrl} download={`video-${Date.now()}.mp4`}>
                    下载视频
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={videoUrl} target="_blank" rel="noreferrer">
                    新窗口打开
                  </a>
                </Button>
                <Button size="sm" className="ml-auto" onClick={() => setPhase('idle')}>
                  再生成一个
                </Button>
              </div>
            </div>
          ) : (
            // failed / timeout
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">
                {phase === 'timeout' ? '生成超时（超过 10 分钟，AI 视频生成确实较慢）' : '生成失败'}
              </p>
              {error && <p className="max-w-sm text-xs text-gray-500">{error}</p>}
              <Button size="sm" onClick={handleRetry}>
                重试
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
