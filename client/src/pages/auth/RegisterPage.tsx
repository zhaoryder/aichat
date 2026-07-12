import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui-legacy/Button'
import { Input } from '@/components/ui-legacy/Input'
import { Card, CardBody, CardHeader } from '@/components/ui-legacy/Card'

// 注册表单校验 schema
const registerSchema = z.object({
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位'),
  nickname: z.string().min(2, '昵称至少 2 个字').max(20, '昵称最多 20 个字'),
})

type FormValues = z.infer<typeof registerSchema>

// 将后端/Supabase 错误信息转为友好提示
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/already registered|already been registered/i.test(msg)) return '该邮箱已注册，请直接登录'
  if (/weak password|password.*weak/i.test(msg)) return '密码太弱，请使用更复杂的密码'
  if (/rate limit|too many/i.test(msg)) return '操作过于频繁，请稍后再试'
  return msg || '注册失败，请稍后重试'
}

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormValues>({ email: '', password: '', nickname: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({})
  const [globalError, setGlobalError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update<K extends keyof FormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setGlobalError('')

    // zod 校验
    const parsed = registerSchema.safeParse(form)
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FormValues, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormValues
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      // 1. 注册 Supabase 账号
      await signUp(form.email, form.password)

      // 2. 尝试通过 API 写入 profile（best-effort，邮箱确认前可能无 session）
      try {
        await apiFetch('/users/profile', {
          method: 'POST',
          body: JSON.stringify({ nickname: form.nickname }),
        })
      } catch {
        // profile 可能由后端触发器自动创建，或确认邮件后首次登录时创建
      }

      // 3. 跳转登录页并带注册成功标记
      navigate('/auth/login?registered=1', { replace: true })
    } catch (err) {
      setGlobalError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary-light to-gray-50 px-4 py-10">
      <Card className="w-full max-w-md animate-slide-up">
        <CardHeader className="pb-2 text-center">
          <h1 className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-2xl font-extrabold text-transparent">
            注册账号
          </h1>
          <p className="mt-2 text-sm text-gray-500">加入 AI 搞笑工坊，开启创意之旅</p>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                邮箱
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                disabled={submitting}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="nickname" className="block text-sm font-medium text-gray-700">
                昵称
              </label>
              <Input
                id="nickname"
                type="text"
                placeholder="2-20 个字"
                value={form.nickname}
                onChange={(e) => update('nickname', e.target.value)}
                disabled={submitting}
              />
              {errors.nickname && <p className="text-xs text-red-500">{errors.nickname}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                密码
              </label>
              <Input
                id="password"
                type="password"
                placeholder="至少 6 位"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                disabled={submitting}
              />
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>

            {globalError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{globalError}</div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full transition-transform duration-300 ease-out hover:scale-[1.02]"
              disabled={submitting}
            >
              {submitting ? '注册中...' : '注册'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            已有账号？{' '}
            <Link to="/auth/login" className="font-medium text-primary hover:underline">
              去登录
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
