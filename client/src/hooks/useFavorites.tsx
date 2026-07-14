// =====================================================================
// 收藏列表全局状态管理
// ---------------------------------------------------------------------
// 通过 Context 在应用根部加载一次 /favorite/list，避免每个 FavoriteButton
// 各自拉取初始状态、刷新后丢失收藏。组件用 useFavorites() 读写统一状态。
// =====================================================================

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { apiFetch } from '@/lib/api'

interface FavoritesContextValue {
  favorites: Set<string>
  isFavorited: (id: string) => boolean
  toggleFavorite: (id: string, agentType: 'official' | 'custom') => Promise<void>
  refresh: () => Promise<void>
  loading: boolean
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ favorites: Array<{ agent_id: string; agent_type: string }> }>('/favorite/list')
      setFavorites(new Set(data.favorites.map(f => f.agent_id)))
    } catch (e) {
      // 静默失败，不影响使用
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const isFavorited = useCallback((id: string) => favorites.has(id), [favorites])

  const toggleFavorite = useCallback(async (id: string, agentType: 'official' | 'custom') => {
    await apiFetch('/favorite', {
      method: 'POST',
      body: JSON.stringify({ agentId: id, agentType }),
    })
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorited, toggleFavorite, refresh, loading }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider')
  return ctx
}
