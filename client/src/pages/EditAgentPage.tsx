// 编辑自定义智能体表单
// ---------------------------------------------------------------------
// GET /api/agents/:id 返回 AgentConfig（含 name/avatarGradient/systemPrompt，
// 但缺少 description/personality/visibility）。因此编辑表单只展示并提交
// name + systemPrompt + avatarGradient 三字段，其余字段通过 PUT 的部分更新保留。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui-legacy/Button'
import { Input, Textarea } from '@/components/ui-legacy/Input'
import { Spinner } from '@/components/ui-legacy/Spinner'
import { cn } from '@/lib/utils'
import type { AgentConfig } from '@shared/agents'

// 6 种预设头像渐变（与创建页保持一致）
const GRADIENT_PRESETS: { label: string; value: string }[] = [
  { label: '红金', value: 'linear-gradient(135deg, #c1121f 0%, #f4a261 50%, #ffd700 100%)' },
  { label: '蓝银', value: 'linear-gradient(135deg, #4a90e2 0%, #c0c0c0 50%, #e8f4fd 100%)' },
  { label: '紫银', value: 'linear-gradient(135deg, #6a5acd 0%, #c0c0c0 50%, #e6e6fa 100%)' },
  { label: '金红', value: 'linear-gradient(135deg, #ffd700 0%, #c1121f 100%)' },
  { label: '青绿', value: 'linear-gradient(135deg, #00b4d8 0%, #06d6a0 100%)' },
  { label: '粉紫', value: 'linear-gradient(135deg, #ff80ab 0%, #9c27b0 100%)' },
]

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '名字至少 1 个字符')
    .max(50, '名字最多 50 个字符'),
  systemPrompt: z
    .string()
    .trim()
    .min(10, '系统提示词至少 10 个字符')
    .max(5000, '系统提示词最多 5000 个字符'),
  avatarGradient: z.string().min(1, '请选择头像配色'),
})

type FormState = {
  name: string
  systemPrompt: string
  avatarGradient: string
}

export const EditAgentPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [form, setForm] = useState<FormState>({
    name: '',
    systemPrompt: '',
    avatarGradient: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  )
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [polishing, setPolishing] = useState(false)
  const [polishError, setPolishError] = useState('')

  // 拉取智能体详情并预填
  useEffect(() => {
    if (!id) {
      setLoading(false)
      setSubmitError('缺少智能体 ID')
      return
    }
    let active = true
    apiFetch<{ agent: AgentConfig }>(`/agents/${id}`)
      .then((res) => {
        if (!active) return
        const a = res.agent
        setAgent(a)
        setForm({
          name: a.name,
          systemPrompt: a.systemPrompt,
          avatarGradient: a.avatarGradient,
        })
      })
      .catch((err: Error) => {
        if (!active) return
        setSubmitError(err.message || '加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  const update = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  // 一键润色系统提示词
  const handlePolish = async () => {
    const draft = form.systemPrompt.trim()
    if (draft.length < 2) {
      setPolishError('先写点草稿再润色（至少 2 个字符）')
      return
    }
    setPolishing(true)
    setPolishError('')
    try {
      const res = await apiFetch<{ polished: string }>('/agents/polish', {
        method: 'POST',
        body: JSON.stringify({ draft }),
      })
      update('systemPrompt', res.polished)
    } catch (err) {
      setPolishError(err instanceof Error ? err.message : '润色失败')
    } finally {
      setPolishing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')

    const parsed = schema.safeParse(form)
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      await apiFetch(`/agents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(parsed.data),
      })
      navigate('/agents')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  // 官方智能体不可编辑（PUT 仅对自定义智能体生效）
  const isOfficial = agent ? agent.era !== '自定义' : false

  return (
    <div className="animate-fade-in mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">编辑智能体</h1>
        <p className="mt-1 text-sm text-gray-500">
          修改名字、系统提示词与头像配色
        </p>
      </header>

      {isOfficial && (
        <div className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
          该智能体为官方智能体，保存时会因无编辑权限而失败。仅自定义智能体可编辑。
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 名字 */}
        <Field label="名字" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="给智能体起个名字（1-50 字）"
            maxLength={50}
            disabled={submitting}
          />
        </Field>

        {/* 系统提示词 */}
        <Field
          label="系统提示词"
          required
          hint="定义角色的身份、说话风格、必带梗与约束（10-5000 字）"
          error={errors.systemPrompt}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-gray-400">
              写个草稿点「一键润色」，AI 帮你补全结构
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePolish}
              disabled={polishing || submitting || form.systemPrompt.trim().length < 2}
              className="gap-1.5 shrink-0"
            >
              {polishing && <Spinner size="sm" />}
              {polishing ? '润色中…' : '一键润色'}
            </Button>
          </div>
          <Textarea
            value={form.systemPrompt}
            onChange={(e) => update('systemPrompt', e.target.value)}
            rows={10}
            maxLength={5000}
            disabled={submitting || polishing}
            className="font-mono text-xs"
          />
          {polishError && (
            <p className="mt-1 text-xs text-red-600">{polishError}</p>
          )}
          <p className="mt-1 text-right text-xs text-gray-400">
            {form.systemPrompt.length}/5000
          </p>
        </Field>

        {/* 头像配色 */}
        <Field label="头像配色" required error={errors.avatarGradient}>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {GRADIENT_PRESETS.map((g) => {
              const selected = form.avatarGradient === g.value
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => update('avatarGradient', g.value)}
                  disabled={submitting}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg p-2 transition-all',
                    selected
                      ? 'bg-primary/10 ring-2 ring-primary'
                      : 'hover:bg-muted',
                  )}
                >
                  <span
                    className="flex size-10 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundImage: g.value }}
                  >
                    {form.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="text-[11px] text-gray-600">{g.label}</span>
                </button>
              )
            })}
          </div>
        </Field>

        {submitError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {submitError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/agents')}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="submit" disabled={submitting} className="gap-1.5">
            {submitting && <Spinner size="sm" />}
            {submitting ? '保存中…' : '保存修改'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// 表单字段容器
function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {hint && <p className="mb-1.5 text-xs text-gray-400">{hint}</p>}
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
