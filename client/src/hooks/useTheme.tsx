// =====================================================================
// 主题装扮全局 Context
// ---------------------------------------------------------------------
// 在应用根部加载一次当前用户的主题，提供 setThemeId / setCustomColors /
// setBubbleStyle / setLoadingAnim / applyTheme（预览）/ resetTheme 方法。
// 切换时立即更新 CSS 变量（--primary / --background）以驱动全局样式。
// =====================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './useAuth'
import { apiFetch } from '@/lib/api'
import { getThemeById } from '@shared/themes'
// 注意：从根 shared/types.ts 导入 UserTheme。
// client/shared/types.ts 暂未同步 v3 类型（UserTheme），
// 根 shared/types.ts 已由主 agent 添加 UserTheme，故用相对路径引用。
import type { UserTheme } from '../../../shared/types'

interface ThemeContextValue {
  theme: UserTheme | null
  loading: boolean
  setThemeId: (themeId: string) => Promise<void>
  setCustomColors: (colors: { primary?: string; background?: string }) => Promise<void>
  setBubbleStyle: (style: string) => Promise<void>
  setLoadingAnim: (anim: string) => Promise<void>
  /** 立即应用主题到 CSS 变量（用于预览） */
  applyTheme: (theme: Partial<UserTheme>) => void
  /** 重置为默认主题 */
  resetTheme: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** 默认主题常量（未登录或重置时使用） */
const DEFAULT_THEME: UserTheme = {
  user_id: '',
  theme_id: 'default',
  custom_colors: {},
  bubble_style: 'default',
  loading_anim: 'default',
  updated_at: '',
}

/** 将主题应用到 document 的 CSS 变量 */
function applyThemeToCSS(t: Partial<UserTheme>): void {
  const template = t.theme_id ? getThemeById(t.theme_id) : undefined
  const primary = t.custom_colors?.primary || template?.primary || '#6366f1'
  const background = t.custom_colors?.background || template?.background || '#fafafa'
  const root = document.documentElement
  root.style.setProperty('--primary', primary)
  root.style.setProperty('--background', background)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [theme, setTheme] = useState<UserTheme | null>(null)
  const [loading, setLoading] = useState(true)

  // 加载用户主题
  useEffect(() => {
    let active = true
    if (!user) {
      setTheme(null)
      setLoading(false)
      applyThemeToCSS(DEFAULT_THEME)
      return
    }
    setLoading(true)
    apiFetch<{ theme: UserTheme }>('/themes')
      .then((res) => {
        if (!active) return
        setTheme(res.theme)
        applyThemeToCSS(res.theme)
      })
      .catch(() => {
        if (active) setTheme(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user])

  /** 立即应用（仅 CSS 变量），不调用后端。用于切换前的预览 */
  const applyTheme = useCallback(
    (partial: Partial<UserTheme>) => {
      const merged: UserTheme = { ...(theme ?? DEFAULT_THEME), ...partial }
      applyThemeToCSS(merged)
    },
    [theme],
  )

  const setThemeId = useCallback(
    async (themeId: string) => {
      if (!user) return
      applyTheme({ theme_id: themeId })
      const res = await apiFetch<{ theme: UserTheme }>('/themes', {
        method: 'PUT',
        body: JSON.stringify({ themeId }),
      })
      setTheme(res.theme)
      applyThemeToCSS(res.theme)
    },
    [user, applyTheme],
  )

  const setCustomColors = useCallback(
    async (colors: { primary?: string; background?: string }) => {
      if (!user) return
      const current = theme ?? DEFAULT_THEME
      const merged: UserTheme = {
        ...current,
        custom_colors: { ...current.custom_colors, ...colors },
      }
      applyThemeToCSS(merged)
      const res = await apiFetch<{ theme: UserTheme }>('/themes', {
        method: 'PUT',
        body: JSON.stringify({ customColors: colors }),
      })
      setTheme(res.theme)
      applyThemeToCSS(res.theme)
    },
    [user, theme],
  )

  const setBubbleStyle = useCallback(
    async (style: string) => {
      if (!user) return
      applyTheme({ bubble_style: style })
      const res = await apiFetch<{ theme: UserTheme }>('/themes', {
        method: 'PUT',
        body: JSON.stringify({ bubbleStyle: style }),
      })
      setTheme(res.theme)
    },
    [user, applyTheme],
  )

  const setLoadingAnim = useCallback(
    async (anim: string) => {
      if (!user) return
      applyTheme({ loading_anim: anim })
      const res = await apiFetch<{ theme: UserTheme }>('/themes', {
        method: 'PUT',
        body: JSON.stringify({ loadingAnim: anim }),
      })
      setTheme(res.theme)
    },
    [user, applyTheme],
  )

  const resetTheme = useCallback(async () => {
    if (!user) return
    applyThemeToCSS(DEFAULT_THEME)
    const res = await apiFetch<{ theme: UserTheme }>('/themes', {
      method: 'PUT',
      body: JSON.stringify({
        themeId: 'default',
        customColors: {},
        bubbleStyle: 'default',
        loadingAnim: 'default',
      }),
    })
    setTheme(res.theme)
    applyThemeToCSS(res.theme)
  }, [user])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        loading,
        setThemeId,
        setCustomColors,
        setBubbleStyle,
        setLoadingAnim,
        applyTheme,
        resetTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
