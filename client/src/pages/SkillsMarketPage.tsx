import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Download, Trash2, Power, PowerOff, Loader2, AlertCircle, Package, Plus, Wrench } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Skill, SkillCategory } from '@shared/types'

/** 带安装状态的 Skill（列表 API 返回） */
interface SkillWithInstall extends Skill {
  installed?: boolean
  enabled?: boolean
}

/** 分类选项 */
const CATEGORIES: Array<{ value: '' | SkillCategory | 'mine'; label: string }> = [
  { value: '', label: '全部' },
  { value: 'mine', label: '我的' },
  { value: 'search', label: '搜索' },
  { value: 'media', label: '媒体' },
  { value: 'code', label: '代码' },
  { value: 'data', label: '数据' },
  { value: 'utility', label: '工具' },
  { value: 'custom', label: '自定义' },
]

/** 分类标签配色 */
const CATEGORY_STYLES: Record<SkillCategory, string> = {
  search: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  media: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  code: 'bg-green-500/10 text-green-600 dark:text-green-400',
  data: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  utility: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  custom: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
}

/** 卡片骨架 */
function SkillCardSkeleton() {
  return (
    <div className="break-inside-avoid overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <Skeleton className="mb-3 h-5 w-2/3" />
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="mb-4 h-3 w-4/5" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  )
}

/** 单个 Skill 卡片 */
function SkillCard({
  skill,
  onInstall,
  onUninstall,
  onToggleEnable,
  actionLoading,
}: {
  skill: SkillWithInstall
  onInstall: (skill: SkillWithInstall) => void
  onUninstall: (skill: SkillWithInstall) => void
  onToggleEnable: (skill: SkillWithInstall) => void
  actionLoading: string | null
}) {
  const isInstalled = skill.installed === true
  const isEnabled = skill.enabled !== false
  const isLoading = actionLoading === skill.id

  return (
    <article
      className={cn(
        'break-inside-avoid overflow-hidden rounded-xl border bg-[hsl(var(--card))] p-4 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg',
        isInstalled
          ? 'border-[hsl(var(--primary)/0.4)] ring-1 ring-[hsl(var(--primary)/0.1)]'
          : 'border-[hsl(var(--border))]',
      )}
    >
      {/* 头部：名称 + 分类标签 */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-tight text-[hsl(var(--foreground))]">
          {skill.name}
        </h3>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            CATEGORY_STYLES[skill.category] || CATEGORY_STYLES.custom,
          )}
        >
          {skill.category}
        </span>
      </div>

      {/* 描述 */}
      <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        {skill.description || '暂无描述'}
      </p>

      {/* 工具列表预览 */}
      {skill.manifest?.tools && skill.manifest.tools.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {skill.manifest.tools.slice(0, 4).map((t) => (
            <span
              key={t.name}
              className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] font-mono text-[hsl(var(--muted-foreground))]"
            >
              <Wrench className="h-2.5 w-2.5" />
              {t.name}
            </span>
          ))}
          {skill.manifest.tools.length > 4 && (
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
              +{skill.manifest.tools.length - 4}
            </span>
          )}
        </div>
      )}

      {/* 元信息 */}
      <div className="mb-3 flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
        <span className="flex items-center gap-1">
          <Download className="h-3 w-3" />
          {skill.install_count || 0}
        </span>
        <span className="flex items-center gap-1">
          <Package className="h-3 w-3" />
          v{skill.version || '1.0.0'}
        </span>
        {skill.author_id === null && (
          <span className="rounded bg-[hsl(var(--accent)/0.1)] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--accent))]">
            官方
          </span>
        )}
        {/* E2.3：AI 自建工具标识 */}
        {skill.slug?.startsWith('user.dynamic-') && (
          <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
            AI 创建
          </span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        {!isInstalled ? (
          <button
            onClick={() => onInstall(skill)}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-medium text-[hsl(var(--primary-foreground))] transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-md disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            安装
          </button>
        ) : (
          <>
            <button
              onClick={() => onToggleEnable(skill)}
              disabled={isLoading}
              className={cn(
                'flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-300 ease-out hover:scale-[1.03] disabled:opacity-50',
                isEnabled
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
              )}
              title={isEnabled ? '已启用，点击禁用' : '已禁用，点击启用'}
            >
              {isEnabled ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
              {isEnabled ? '已启用' : '已禁用'}
            </button>
            <button
              onClick={() => onUninstall(skill)}
              disabled={isLoading}
              className="flex items-center justify-center gap-1 rounded-lg bg-[hsl(var(--muted))] px-3 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-all duration-300 ease-out hover:scale-[1.03] hover:bg-[hsl(var(--destructive)/0.1)] hover:text-[hsl(var(--destructive))] disabled:opacity-50"
              title="卸载"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </article>
  )
}

/** Skill 市场页面 */
export function SkillsMarketPage() {
  const { user } = useAuth()
  const [skills, setSkills] = useState<SkillWithInstall[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<'' | SkillCategory | 'mine'>('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  /** 加载 skill 列表 */
  const loadSkills = useCallback(async () => {
    // "我的" tab 走单独的 API
    if (category === 'mine') {
      if (!user) {
        setSkills([])
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const data = await apiFetch<{ userSkills: Array<{ skill: Skill; enabled: boolean; skill_id: string }> }>('/users/me/skills')
        const mine = (data.userSkills || [])
          .filter((us) => us.skill)
          .map((us) => ({ ...us.skill, installed: true, enabled: us.enabled }))
        setSkills(mine)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载已安装 Skill 失败')
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (search) params.set('q', search)
      params.set('page', '1')
      params.set('limit', '50')
      const data = await apiFetch<{ skills: SkillWithInstall[] }>(`/skills?${params.toString()}`)
      setSkills(data.skills || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Skill 列表失败')
    } finally {
      setLoading(false)
    }
  }, [category, search, user])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  /** 搜索提交 */
  const handleSearch = useCallback(() => {
    setSearch(searchInput.trim())
  }, [searchInput])

  /** 安装 skill */
  const handleInstall = useCallback(async (skill: SkillWithInstall) => {
    if (!user) {
      toast.info('请先登录')
      return
    }
    setActionLoading(skill.id)
    try {
      await apiFetch(`/skills/${skill.id}/install`, { method: 'POST' })
      toast.success(`已安装 ${skill.name}`)
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, installed: true, enabled: true, install_count: s.install_count + 1 } : s)),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '安装失败')
    } finally {
      setActionLoading(null)
    }
  }, [user])

  /** 卸载 skill */
  const handleUninstall = useCallback(async (skill: SkillWithInstall) => {
    setActionLoading(skill.id)
    try {
      await apiFetch(`/skills/${skill.id}/install`, { method: 'DELETE' })
      toast.success(`已卸载 ${skill.name}`)
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, installed: false, enabled: false, install_count: Math.max(0, s.install_count - 1) } : s)),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '卸载失败')
    } finally {
      setActionLoading(null)
    }
  }, [])

  /** 启用/禁用 skill */
  const handleToggleEnable = useCallback(async (skill: SkillWithInstall) => {
    const currentlyEnabled = skill.enabled !== false
    setActionLoading(skill.id)
    try {
      if (currentlyEnabled) {
        await apiFetch(`/skills/${skill.id}/enable`, { method: 'DELETE' })
        toast.success(`已禁用 ${skill.name}`)
      } else {
        await apiFetch(`/skills/${skill.id}/enable`, { method: 'POST' })
        toast.success(`已启用 ${skill.name}`)
      }
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, enabled: !currentlyEnabled } : s)),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }, [])

  // 排序：已安装的置顶
  const sortedSkills = [...skills].sort((a, b) => {
    const aInstalled = a.installed ? 1 : 0
    const bInstalled = b.installed ? 1 : 0
    if (aInstalled !== bInstalled) return bInstalled - aInstalled
    return (b.install_count || 0) - (a.install_count || 0)
  })

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-6">
      {/* 页面标题 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Skill 市场
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            安装插件扩展 Agent 能力 · 联网搜索、图片生成、代码执行、文件读写…
          </p>
        </div>
        {user && (
          <Link
            to="/skills/create"
            className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">创建 Skill</span>
          </Link>
        )}
      </div>

      {/* 分类 tabs + 搜索框 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value || 'all'}
              onClick={() => setCategory(cat.value)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300 ease-out',
                category === cat.value
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.7)] hover:text-[hsl(var(--foreground))]',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:w-64">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
              placeholder="搜索 Skill..."
              className="h-9 pl-8"
            />
          </div>
        </div>
      </div>

      {/* 内容区 */}
      {loading ? (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkillCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-[hsl(var(--destructive)/0.6)]" />
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">加载失败</p>
          <p className="mt-1 max-w-md text-xs text-[hsl(var(--muted-foreground))]">{error}</p>
          <button
            onClick={loadSkills}
            className="mt-4 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-medium text-[hsl(var(--primary-foreground))] transition-all duration-300 ease-out hover:scale-[1.03]"
          >
            重试
          </button>
        </div>
      ) : sortedSkills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="mb-3 h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]" />
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
            {category === 'mine' ? '还没有安装任何 Skill' : '暂无 Skill'}
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            {category === 'mine' ? '去市场逛逛，安装第一个 Skill 吧' : '试试其他分类或关键词'}
          </p>
          {category === 'mine' && (
            <button
              onClick={() => setCategory('')}
              className="mt-4 rounded-lg bg-[hsl(var(--muted))] px-4 py-2 text-xs font-medium text-[hsl(var(--foreground))] transition-all duration-300 ease-out hover:scale-[1.03]"
            >
              浏览市场
            </button>
          )}
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
          {sortedSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onToggleEnable={handleToggleEnable}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </div>
  )
}
