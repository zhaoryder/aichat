// 视频工坊：AI 生成搞笑短视频
// - 提交任务 → 拿 taskId → 轮询状态（每 5 秒）
// - 进度条：pending / processing / SUCCESS / FAIL
// - 超时：轮询超过 5 分钟提示
// - 完成：展示 video 播放器 + 下载链接
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Card } from '@/components/ui-legacy/Card'
import { Input } from '@/components/ui-legacy/Input'
import { Button } from '@/components/ui-legacy/Button'
import { Spinner } from '@/components/ui-legacy/Spinner'
import { EmptyState } from '@/components/ui-legacy/EmptyState'
import { Badge } from '@/components/ui-legacy/Badge'
import { SelectWithCustom } from '@/components/SelectWithCustom'
import { VIDEO_STYLES } from '@shared/presets'

// 视频状态：服务端 SUCCESS / FAIL / pending / processing 等
type VideoPhase = 'idle' | 'submitting' | 'pending' | 'processing' | 'success' | 'failed' | 'timeout'

const POLL_INTERVAL = 5000 // 5 秒
const TIMEOUT_MS = 5 * 60 * 1000 // 5 分钟

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

export const VideoStudioPage = () => {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('')
  const [duration, setDuration] = useState(5)

  const [phase, setPhase] = useState<VideoPhase>('idle')
  const [videoUrl, setVideoUrl] = useState('')
  const [error, setError] = useState('')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)

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
        const res = await apiFetch<{ status: string; videoUrl?: string; error?: string }>(
          `/studio/video/status/${taskId}`,
        )
        const status = (res.status || '').toUpperCase()
        if (status === 'SUCCESS' && res.videoUrl) {
          clearPoll()
          setVideoUrl(res.videoUrl)
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                时长（秒）
              </label>
              <Input
                type="number"
                min={1}
                max={60}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 5)}
                disabled={isWorking}
              />
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
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
              <Spinner className="h-10 w-10" />
              <p className="text-sm font-medium text-gray-700">{PHASE_TEXT[phase]}</p>
              {/* indeterminate 进度条 */}
              <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-gray-200">
                <div className="h-full w-1/3 rounded-full bg-primary shimmer-bar" />
              </div>
              <p className="text-xs text-gray-400">每 5 秒自动刷新状态</p>
            </div>
          ) : phase === 'success' && videoUrl ? (
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="primary">已完成</Badge>
                <span className="text-sm text-gray-500">视频已生成，可播放或下载</span>
              </div>
              <video
                src={videoUrl}
                controls
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
                {phase === 'timeout' ? '生成超时（超过 5 分钟）' : '生成失败'}
              </p>
              {error && <p className="max-w-sm text-xs text-gray-500">{error}</p>}
              <Button size="sm" onClick={handleRetry}>
                重试
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* indeterminate 进度条动画样式 */}
      <style>{`
        .shimmer-bar {
          animation: shimmer-slide 1.4s ease-in-out infinite;
        }
        @keyframes shimmer-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  )
}
