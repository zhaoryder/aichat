// =====================================================================
// AI 记忆设置页（Batch E1.4）
// ---------------------------------------------------------------------
// 路由：/settings/memory
// 功能：
//   1. 列表显示所有 memory（key + value + 来源 + 创建时间）
//   2. 顶部"添加记忆"按钮，弹出 inline 表单（key + value）
//   3. 每条记忆支持 inline 编辑 value 和删除
//   4. 暗色模式 + 卡片样式 + 细腻动画
// =====================================================================

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Brain,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Clock,
  Sparkles,
  User,
  Settings as SettingsIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AgentMemory } from '@shared/types'

/** 来源样式映射 */
const SOURCE_STYLES: Record<AgentMemory['source'], { label: string; icon: typeof Sparkles; className: string }> = {
  agent: {
    label: 'AI',
    icon: Sparkles,
    className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  },
  user: {
    label: '用户',
    icon: User,
    className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  },
  system: {
    label: '系统',
    icon: SettingsIcon,
    className: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
  },
}

/** 格式化时间 */
function formatTime(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function SettingsMemoryPage() {
  const { user } = useAuth()
  const [memories, setMemories] = useState<AgentMemory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  /** 加载所有记忆 */
  const loadMemories = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch<{ memories: AgentMemory[] }>('/memory')
      setMemories(data.memories ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载记忆失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) loadMemories()
    else {
      setLoading(false)
    }
  }, [user, loadMemories])

  /** 添加新记忆 */
  const handleAdd = async () => {
    const key = newKey.trim()
    const value = newValue.trim()
    if (!key) {
      toast.error('key 不能为空')
      return
    }
    if (!value) {
      toast.error('value 不能为空')
      return
    }

    setSaving(true)
    try {
      const { memory } = await apiFetch<{ memory: AgentMemory }>('/memory', {
        method: 'POST',
        body: JSON.stringify({ key, value, source: 'user' }),
      })
      // 替换同 key 的旧记忆（upsert 行为）
      setMemories((prev) => {
        const filtered = prev.filter((m) => m.key !== key)
        return [memory, ...filtered]
      })
      toast.success(`已保存记忆「${key}」`)
      setNewKey('')
      setNewValue('')
      setIsAdding(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  /** 开始编辑 */
  const startEdit = (m: AgentMemory) => {
    setEditingId(m.id)
    setEditingValue(m.value)
  }

  /** 保存编辑 */
  const saveEdit = async (id: string) => {
    const value = editingValue.trim()
    if (!value) {
      toast.error('value 不能为空')
      return
    }
    setActionLoadingId(id)
    try {
      const { memory } = await apiFetch<{ memory: AgentMemory }>(`/memory/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      })
      setMemories((prev) => prev.map((m) => (m.id === id ? memory : m)))
      toast.success('已更新')
      setEditingId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setActionLoadingId(null)
    }
  }

  /** 删除记忆 */
  const handleDelete = async (m: AgentMemory) => {
    if (!confirm(`确认删除记忆「${m.key}」？此操作不可恢复。`)) return
    setActionLoadingId(m.id)
    try {
      await apiFetch(`/memory/${m.id}`, { method: 'DELETE' })
      setMemories((prev) => prev.filter((it) => it.id !== m.id))
      toast.success(`已删除「${m.key}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setActionLoadingId(null)
    }
  }

  if (!user) {
    return (
      <div className="animate-fade-in mx-auto max-w-3xl px-4 py-12">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-[hsl(var(--muted-foreground)/0.5)]" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">请先登录后查看 AI 记忆</p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/auth/login">去登录</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-6">
      {/* 顶部标题 + 返回 */}
      <div className="mb-6">
        <Link
          to="/settings"
          className="mb-3 flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回设置
        </Link>
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-[hsl(var(--primary))]" />
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            AI 记忆
          </h1>
        </div>
        <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))]">
          Agent 跨会话记住你的偏好、技术栈和历史决策 · 共 {memories.length} 条
        </p>
      </div>

      {/* 添加按钮 / 表单 */}
      <div className="mb-4">
        {!isAdding ? (
          <Button
            onClick={() => setIsAdding(true)}
            className="gap-1.5 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            添加记忆
          </Button>
        ) : (
          <Card className="border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--card))] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">新增记忆</h3>
              <button
                onClick={() => {
                  setIsAdding(false)
                  setNewKey('')
                  setNewValue('')
                }}
                className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  Key（键名，如 ui_framework）
                </label>
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="如：ui_framework / language / tech_stack"
                  maxLength={100}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  Value（值，如 tailwind）
                </label>
                <Textarea
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="如：tailwind / typescript / React"
                  rows={3}
                  maxLength={5000}
                  disabled={saving}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false)
                    setNewKey('')
                    setNewValue('')
                  }}
                  disabled={saving}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={saving || !newKey.trim() || !newValue.trim()}
                  className="gap-1.5"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  保存
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <Card className="mb-4 border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)] p-4">
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadMemories}
            className="mt-2"
          >
            重试
          </Button>
        </Card>
      )}

      {/* 记忆列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
        </div>
      ) : memories.length === 0 ? (
        <Card className="border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-10 text-center">
          <Brain className="mx-auto mb-3 h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]" />
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
            还没有 AI 记忆
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Agent 会在对话中自动保存你的偏好；也可以点击上方"添加记忆"手动添加
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {memories.map((m) => {
            const isEditing = editingId === m.id
            const isActioning = actionLoadingId === m.id
            const sourceStyle = SOURCE_STYLES[m.source] ?? SOURCE_STYLES.user
            const SourceIcon = sourceStyle.icon

            return (
              <Card
                key={m.id}
                className="border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-all duration-300 ease-out hover:shadow-md"
              >
                {/* Key + 来源 */}
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 font-mono text-xs font-semibold text-[hsl(var(--primary))]">
                      {m.key}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                        sourceStyle.className,
                      )}
                      title={`来源：${sourceStyle.label}`}
                    >
                      <SourceIcon className="h-2.5 w-2.5" />
                      {sourceStyle.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => startEdit(m)}
                          disabled={isActioning}
                          title="编辑"
                          className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] transition-all duration-300 ease-out hover:scale-[1.05] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--primary))]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(m)}
                          disabled={isActioning}
                          title="删除"
                          className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] transition-all duration-300 ease-out hover:scale-[1.05] hover:bg-[hsl(var(--destructive)/0.1)] hover:text-[hsl(var(--destructive))]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Value 或编辑器 */}
                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      rows={3}
                      maxLength={5000}
                      disabled={isActioning}
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(null)
                          setEditingValue('')
                        }}
                        disabled={isActioning}
                      >
                        <X className="mr-1 h-3 w-3" />
                        取消
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveEdit(m.id)}
                        disabled={isActioning || !editingValue.trim()}
                        className="gap-1"
                      >
                        {isActioning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        保存
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm text-[hsl(var(--foreground))]">
                    {m.value}
                  </p>
                )}

                {/* 创建时间 */}
                {!isEditing && (
                  <div className="mt-3 flex items-center gap-1 border-t border-[hsl(var(--border))] pt-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                    <Clock className="h-2.5 w-2.5" />
                    {formatTime(m.created_at)}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
