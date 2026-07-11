import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Spinner'

// 路由守卫：未登录跳登录页，可选 admin 校验
export function ProtectedRoute({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { user, loading, profile } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />
  if (admin && profile?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}
