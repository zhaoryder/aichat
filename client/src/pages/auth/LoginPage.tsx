import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui-legacy/Button'
import { Input } from '@/components/ui-legacy/Input'
import { Card, CardBody, CardHeader } from '@/components/ui-legacy/Card'

// 登录失败时的友好提示
const LOGIN_FAIL_HINT = '登录失败，可能原因：① 邮箱未点确认链接 ② 邮箱或密码错误。请先去邮箱点确认链接。'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const registered = searchParams.get('registered') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('请输入邮箱和密码')
      return
    }

    setSubmitting(true)
    try {
      await signIn(email, password)
      // 登录成功：跳转到来源页或首页
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname || '/'
      navigate(from, { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '登录失败'
      // Supabase 错误信息不够友好，统一用提示文案
      if (/invalid credentials|not confirmed|email not confirmed/i.test(msg)) {
        setError(LOGIN_FAIL_HINT)
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary-light to-gray-50 px-4 py-10">
      <Card className="w-full max-w-md animate-slide-up">
        <CardHeader className="pb-2 text-center">
          <h1 className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-2xl font-extrabold text-transparent">
            欢迎登录
          </h1>
          <p className="mt-2 text-sm text-gray-500">AI 搞笑工坊，等你来玩</p>
        </CardHeader>
        <CardBody>
          {registered && (
            <div className="mb-4 rounded-lg bg-primary/15 px-3 py-2 text-sm text-primary">
              注册成功！请去邮箱点击确认链接，确认后再登录。
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                邮箱
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                密码
              </label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full transition-transform duration-300 ease-out hover:scale-[1.02]"
              disabled={submitting}
            >
              {submitting ? '登录中...' : '登录'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            还没有账号？{' '}
            <Link to="/auth/register" className="font-medium text-primary hover:underline">
              去注册
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
