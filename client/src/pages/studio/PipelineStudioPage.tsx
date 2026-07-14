// 多媒体流水线工坊
// - 表单：创作提示词 + 步骤多选（图片/视频/文章）
// - 启动后通过 SSE 接收 step_start / step_progress / step_done / pipeline_done
// - 每个步骤一张卡片：待处理 → 进行中（进度条）→ 完成（预览）/ 失败（重试）
// - 完成后展示产物汇总，支持「插入到对话」（演示用 toast）
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiStream } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  ChevronLeft,
  Sparkles,
  Image as ImageIcon,
  Video,
  FileText,
  Play,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ArrowRight,
} from 'lucide-react'

type StepKey = 'image' | 'video' | 'article'
type StepStatus = 'pending' | 'running' | 'done' | 'failed'

interface StepState {
  status: StepStatus
  progress: number
  result?: { url?: string; content?: string }
}

interface PipelineAsset {
  type: string
  url?: string
  content?: string
}

// 步骤配置：标签 + 图标
const STEP_OPTIONS: { key: StepKey; label: string; Icon: typeof FileText }[] = [
  { key: 'image', label: '图片生成', Icon: ImageIcon },
  { key: 'video', label: '视频生成', Icon: Video },
  { key: 'article', label: '文章生成', Icon: FileText },
]

const STATUS_LABEL: Record<StepStatus, string> = {
  pending: '待处理',
  running: '进行中',
  done: '完成',
  failed: '失败',
}

function getStepMeta(key: string): { label: string; Icon: typeof FileText } {
  const found = STEP_OPTIONS.find((o) => o.key === key)
  if (found) return { label: found.label, Icon: found.Icon }
  return { label: key, Icon: FileText }
}

export const PipelineStudioPage = () => {
  const { user, loading: authLoading } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [selectedSteps, setSelectedSteps] = useState<StepKey[]>([
    'image',
    'article',
  ])
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({})
  const [assets, setAssets] = useState<PipelineAsset[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  function toggleStep(key: StepKey) {
    setSelectedSteps((prev) =>
      prev.includes(key)
        ? prev.filter((s) => s !== key)
        : [...prev, key],
    )
  }

  function handleSSEEvent(event: string, data: Record<string, unknown>) {
    const step = typeof data.step === 'string' ? data.step : ''
    switch (event) {
      case 'step_start':
        if (step) {
          setStepStates((prev) => ({
            ...prev,
            [step]: { status: 'running', progress: 0 },
          }))
        }
        break
      case 'step_progress': {
        const progress = typeof data.progress === 'number' ? data.progress : 0
        if (step) {
          setStepStates((prev) => ({
            ...prev,
            [step]: {
              ...(prev[step] ?? { status: 'running' as StepStatus, progress: 0 }),
              status: 'running',
              progress,
            },
          }))
        }
        break
      }
      case 'step_done': {
        const url = typeof data.url === 'string' ? data.url : undefined
        const content =
          typeof data.content === 'string' ? data.content : undefined
        if (step) {
          setStepStates((prev) => ({
            ...prev,
            [step]: {
              status: 'done',
              progress: 100,
              result: { url, content },
            },
          }))
        }
        break
      }
      case 'pipeline_done': {
        const arr = Array.isArray(data.assets)
          ? (data.assets as PipelineAsset[])
          : []
        setAssets(arr)
        toast.success('流水线已完成')
        break
      }
      case 'error': {
        const msg =
          typeof data.error === 'string' ? data.error : '流水线执行失败'
        setErrorMsg(msg)
        toast.error(msg)
        setStepStates((prev) => {
          const next = { ...prev }
          for (const k of Object.keys(next)) {
            if (next[k].status === 'running' || next[k].status === 'pending') {
              next[k] = { ...next[k], status: 'failed' }
            }
          }
          return next
        })
        break
      }
      default:
        break
    }
  }

  async function handleRun() {
    const trimmed = prompt.trim()
    if (!trimmed || selectedSteps.length === 0 || isRunning) return

    setIsRunning(true)
    setErrorMsg('')
    setAssets([])

    // 初始化所有选中步骤为待处理
    const initial: Record<string, StepState> = {}
    for (const s of selectedSteps) {
      initial[s] = { status: 'pending', progress: 0 }
    }
    setStepStates(initial)

    try {
      const res = await apiStream('/pipeline/run', {
        prompt: trimmed,
        steps: selectedSteps,
      })
      if (!res.body) {
        setErrorMsg('未收到响应流')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            let data: Record<string, unknown>
            try {
              data = JSON.parse(line.slice(6))
            } catch {
              continue
            }
            handleSSEEvent(currentEvent, data)
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '流水线启动失败'
      setErrorMsg(msg)
      toast.error(msg)
      setStepStates((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(next)) {
          if (next[k].status === 'running' || next[k].status === 'pending') {
            next[k] = { ...next[k], status: 'failed' }
          }
        }
        return next
      })
    } finally {
      setIsRunning(false)
    }
  }

  function handleInsertToChat() {
    toast.success('已插入到对话（演示）')
  }

  const canRun =
    prompt.trim().length > 0 && selectedSteps.length > 0 && !isRunning

  // 未登录提示
  if (!authLoading && !user) {
    return (
      <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Link
            to="/studio"
            className="inline-flex items-center text-sm text-gray-500 hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" /> 返回创意工坊
          </Link>
        </div>
        <Card className="hover-lift p-8">
          <EmptyState
            title="登录后开启流水线"
            description="登录账号即可使用多媒体流水线创作"
            action={
              <Button asChild>
                <Link to="/auth/login">去登录</Link>
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/studio"
          className="inline-flex items-center text-sm text-gray-500 hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" /> 返回创意工坊
        </Link>
        <h1 className="mt-2 flex items-center gap-2 bg-gradient-to-r from-primary via-indigo-500 to-purple-500 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
          <Sparkles className="h-9 w-9 text-primary" />
          多媒体流水线
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          一键串联图片、视频、文章生成，流式查看进度
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* 配置面板 */}
        <Card className="hover-lift h-fit p-5">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                创作提示词 <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：一只穿着西装的猫在开早会，生成配图、短视频和一篇介绍文章"
                rows={5}
                disabled={isRunning}
              />
            </div>

            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700">
                流水线步骤
              </span>
              <div className="space-y-2">
                {STEP_OPTIONS.map((opt) => {
                  const Icon = opt.Icon
                  const checked = selectedSteps.includes(opt.key)
                  return (
                    <label
                      key={opt.key}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        checked
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${isRunning ? 'opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStep(opt.key)}
                        disabled={isRunning}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium text-gray-700">
                        {opt.label}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <Button
              className="w-full transition-transform duration-300 ease-out hover:scale-[1.02]"
              onClick={handleRun}
              disabled={!canRun}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 生成中…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> 启动流水线
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* 进度 & 结果区 */}
        <div className="space-y-4">
          {errorMsg && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMsg}
            </div>
          )}

          {Object.keys(stepStates).length === 0 && !errorMsg ? (
            <Card className="hover-lift">
              <EmptyState
                title="配置步骤并启动流水线"
                description="选择需要的生成步骤，输入提示词后点击「启动流水线」"
                icon={<Sparkles className="h-10 w-10" />}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {selectedSteps.map((step) => (
                <StepCard
                  key={step}
                  step={step}
                  state={stepStates[step]}
                  onRetry={handleRun}
                />
              ))}
            </div>
          )}

          {/* 产物汇总 */}
          {assets.length > 0 && (
            <Card className="hover-lift p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  流水线产物（共 {assets.length} 项）
                </h3>
                <Button size="sm" onClick={handleInsertToChat}>
                  插入到对话 <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {assets.map((asset, i) => (
                  <AssetItem key={`${asset.type}-${i}`} asset={asset} />
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------

function StatusBadge({ status }: { status: StepStatus }) {
  const config: Record<StepStatus, { text: string; cls: string }> = {
    pending: { text: STATUS_LABEL.pending, cls: 'bg-gray-100 text-gray-500' },
    running: { text: STATUS_LABEL.running, cls: 'bg-blue-50 text-blue-600' },
    done: { text: STATUS_LABEL.done, cls: 'bg-green-50 text-green-600' },
    failed: { text: STATUS_LABEL.failed, cls: 'bg-red-50 text-red-600' },
  }
  const c = config[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.cls}`}
    >
      {status === 'done' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
      {c.text}
    </span>
  )
}

function StepCard({
  step,
  state,
  onRetry,
}: {
  step: string
  state: StepState | undefined
  onRetry: () => void
}) {
  const status: StepStatus = state?.status ?? 'pending'
  const progress = state?.progress ?? 0
  const result = state?.result
  const { label, Icon } = getStepMeta(step)

  return (
    <Card className="hover-lift p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold text-gray-800">{label}</span>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* 进行中：进度条 */}
      {status === 'running' && (
        <div className="mb-1">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
            <span>{progress}%</span>
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> 生成中
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 完成：预览 */}
      {status === 'done' && result && <ResultPreview result={result} />}

      {/* 失败：重试 */}
      {status === 'failed' && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" /> 重试
        </Button>
      )}

      {/* 待处理 */}
      {status === 'pending' && (
        <p className="text-xs text-gray-400">等待执行…</p>
      )}
    </Card>
  )
}

function ResultPreview({
  result,
}: {
  result: { url?: string; content?: string }
}) {
  const [imgLoaded, setImgLoaded] = useState(false)

  useEffect(() => {
    setImgLoaded(false)
  }, [result.url])

  if (result.url) {
    return (
      <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-gray-50">
        {!imgLoaded && <Skeleton className="absolute inset-0" />}
        <img
          src={result.url}
          alt="生成结果"
          onLoad={() => setImgLoaded(true)}
          className={`h-full w-full object-contain transition-opacity duration-300 ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
    )
  }
  if (result.content) {
    return (
      <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
        {result.content}
      </div>
    )
  }
  return null
}

function AssetItem({ asset }: { asset: PipelineAsset }) {
  const { label, Icon } = getStepMeta(asset.type)
  const [imgLoaded, setImgLoaded] = useState(false)

  useEffect(() => {
    setImgLoaded(false)
  }, [asset.url])

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      {asset.url ? (
        <div className="relative aspect-[3/2] bg-gray-50">
          {!imgLoaded && <Skeleton className="absolute inset-0" />}
          <img
            src={asset.url}
            alt={label}
            onLoad={() => setImgLoaded(true)}
            className={`h-full w-full object-contain transition-opacity duration-300 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      ) : asset.content ? (
        <p className="max-h-32 overflow-auto whitespace-pre-wrap p-3 text-xs leading-relaxed text-gray-700">
          {asset.content}
        </p>
      ) : null}
    </div>
  )
}
