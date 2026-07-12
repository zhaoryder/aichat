// =====================================================================
// 提示词市场
// ---------------------------------------------------------------------
// - 卡片列表展示提示词
// - 分类筛选 Tabs（全部/通用/对话/创作/搞笑/角色）
// - 搜索框
// - 一键使用（复制到剪贴板）+ 点赞
// - 创建提示词（Dialog 弹窗表单）
// =====================================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, Heart, Copy, Plus, Sparkles, FileText, Loader2, PackageOpen } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Category = 'all' | '通用' | '对话' | '创作' | '搞笑' | '角色'

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: '通用', label: '通用' },
  { key: '对话', label: '对话' },
  { key: '创作', label: '创作' },
  { key: '搞笑', label: '搞笑' },
  { key: '角色', label: '角色' },
]

interface Prompt {
  id: string
  user_id: string
  title: string
  content: string
  category: string
  likes: number
  uses: number
  created_at: string
}

interface PromptListResponse {
  prompts: Prompt[]
  total: number
  page: number
  limit: number
}

export function PromptMarketPage() {
  const [category, setCategory] = useState<Category>('all')
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery<PromptListResponse>({
    queryKey: ['prompts', category, appliedSearch],
    queryFn: () => {
      const params = new URLSearchParams({
        page: '1',
        limit: '20',
        category,
      })
      if (appliedSearch) params.set('search', appliedSearch)
      return apiFetch<PromptListResponse>(`/prompts?${params.toString()}`)
    },
  })

  // 点赞
  const likeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean; likes: number }>(`/prompts/${id}/like`, {
        method: 'POST',
      }),
    onSuccess: (res, id) => {
      queryClient.setQueriesData<PromptListResponse>(
        { queryKey: ['prompts'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            prompts: old.prompts.map((p) =>
              p.id === id ? { ...p, likes: res.likes } : p,
            ),
          }
        },
      )
      toast.success('点赞成功')
    },
    onError: (err: Error) => toast.error(err.message || '点赞失败'),
  })

  // 使用（复制 + 计数）
  const usePromptMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean; uses: number }>(`/prompts/${id}/use`, {
        method: 'POST',
      }),
    onSuccess: (res, id) => {
      queryClient.setQueriesData<PromptListResponse>(
        { queryKey: ['prompts'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            prompts: old.prompts.map((p) =>
              p.id === id ? { ...p, uses: res.uses } : p,
            ),
          }
        },
      )
    },
  })

  const prompts = data?.prompts ?? []

  async function handleUse(prompt: Prompt) {
    try {
      await navigator.clipboard.writeText(prompt.content)
      usePromptMutation.mutate(prompt.id)
      toast.success('已复制到剪贴板')
    } catch {
      // 降级方案
      const textarea = document.createElement('textarea')
      textarea.value = prompt.content
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        usePromptMutation.mutate(prompt.id)
        toast.success('已复制到剪贴板')
      } catch {
        toast.error('复制失败，请手动复制')
      }
      document.body.removeChild(textarea)
    }
  }

  function handleSearch() {
    setAppliedSearch(searchInput.trim())
  }

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-3xl font-extrabold text-transparent">
            提示词市场
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            好用的提示词都在这，一键复制拿去用，也欢迎分享你的创意
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          分享提示词
        </Button>
      </header>

      {/* 搜索 */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="搜索提示词标题或内容…"
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>
          搜索
        </Button>
      </div>

      {/* 分类 Tabs */}
      <div className="mb-6 flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
        {CATEGORIES.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setCategory(tab.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              category === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="加载失败"
          description={error instanceof Error ? error.message : '请稍后重试'}
        />
      ) : prompts.length === 0 ? (
        <EmptyState
          title={appliedSearch ? '没有匹配的提示词' : '还没有提示词'}
          description={appliedSearch ? '换个关键词试试' : '来分享第一个提示词吧'}
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        >
          {prompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              onLike={() => likeMutation.mutate(prompt.id)}
              liking={likeMutation.isPending && likeMutation.variables === prompt.id}
              onUse={() => handleUse(prompt)}
            />
          ))}
        </motion.div>
      )}

      {/* 创建 Dialog */}
      <CreatePromptDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

// 提示词卡片
function PromptCard({
  prompt,
  onLike,
  liking,
  onUse,
}: {
  prompt: Prompt
  onLike: () => void
  liking: boolean
  onUse: () => void
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 },
      }}
      whileHover={{ y: -4 }}
      className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <h3 className="line-clamp-1 font-semibold text-foreground">{prompt.title}</h3>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {prompt.category}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
        {prompt.content}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {prompt.likes ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <Copy className="h-3.5 w-3.5" />
            {prompt.uses ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={onLike}
            disabled={liking}
            whileTap={{ scale: 1.3 }}
            className="text-muted-foreground transition-colors hover:text-pink-500 disabled:opacity-50"
          >
            <Heart className="h-4 w-4" />
          </motion.button>
          <Button size="sm" variant="outline" onClick={onUse} className="gap-1">
            <Copy className="h-3.5 w-3.5" />
            使用
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// 创建提示词 Dialog
function CreatePromptDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<string>('通用')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  async function handleSubmit() {
    const t = title.trim()
    const c = content.trim()
    if (t.length < 2) {
      setError('标题至少 2 个字符')
      return
    }
    if (c.length < 10) {
      setError('内容至少 10 个字符')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await apiFetch('/prompts', {
        method: 'POST',
        body: JSON.stringify({ title: t, content: c, category }),
      })
      toast.success('发布成功')
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      onOpenChange(false)
      setTitle('')
      setContent('')
      setCategory('通用')
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setError('')
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            分享提示词
          </DialogTitle>
          <DialogDescription>
            把好用的提示词分享给大家，让更多人受益
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">标题</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给提示词起个名字"
              maxLength={50}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">分类</label>
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.filter((c) => c.key !== 'all').map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm transition-all',
                    category === c.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入提示词内容，尽量详细描述你想要的效果…"
              rows={5}
              maxLength={2000}
              disabled={submitting}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                发布中…
              </>
            ) : (
              '发布'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 空状态
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <PackageOpen className="h-12 w-12 text-muted-foreground/40" />
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
