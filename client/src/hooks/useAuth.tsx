import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import type { UserProfile } from '../../../shared/types'

/** Auth Context 提供的值 */
interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/** 从后端 API 拉取用户资料 */
async function fetchProfile(): Promise<UserProfile | null> {
  try {
    return await apiFetch<UserProfile>('/users/me')
  } catch {
    // 接口未就绪或报错时，不阻塞登录流程
    return null
  }
}

// Auth Provider：在应用根部包裹，提供 user/profile 与登录方法
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 初始化：尝试从本地存储恢复会话
    let active = true

    supabase.auth.getSession().then(async ({ data }: { data: { session: Session | null } }) => {
      if (!active) return
      if (data.session) {
        setUser(data.session.user)
        const p = await fetchProfile()
        if (active) setProfile(p)
      }
      setLoading(false)
    })

    // 监听认证状态变化
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const p = await fetchProfile()
        setProfile(p)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  /** 邮箱密码登录 */
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  /** 注册 */
  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  /** 登出 */
  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
    setProfile(null)
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, signIn, signUp, signOut }),
    [user, profile, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// useAuth hook：必须在 AuthProvider 内使用
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return ctx
}
