// =====================================================================
// AI 协作者选择器
// ---------------------------------------------------------------------
// 折叠式卡片，列出按 specialty 分组的 AI 创作者，支持搜索/筛选
// 用于 9 个 studio 页面顶部，让用户选择是否与 AI 协作
// =====================================================================

import { useState, useMemo } from 'react'
import { Sparkles, ChevronDown, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// 直接 import 根目录 shared/ai-creators（通过 @ai-creators alias）
import { AI_CREATORS } from '@ai-creators'
import type { AICreatorSpecialty } from '@ai-creators/types'

const SPECIALTY_LABELS: Record<AICreatorSpecialty, string> = {
  image: 'AI 绘画',
  video: '短视频',
  script: '剧本',
  article: '文章',
  voice: '语音',
  'vibe-code': 'Vibe Code',
  meme: '表情包',
  poster: '海报',
}

interface Props {
  /** 限定专长（如 image 页面只显示 image AI），不传则显示全部 */
  specialty?: AICreatorSpecialty
  /** 选中的 ai_creator_id */
  value?: string | null
  /** 值变化回调 */
  onChange: (creatorId: string | null) => void
}

export function AICollaboratorPicker({ specialty, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = AI_CREATORS
    if (specialty) list = list.filter((c) => c.specialty === specialty)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.nickname.toLowerCase().includes(q) ||
          c.style.toLowerCase().includes(q) ||
          c.style_tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    return list.slice(0, 50) // 最多展示 50 个，避免 DOM 过重
  }, [specialty, search])

  const selected = value ? AI_CREATORS.find((c) => c.id === value) : null

  return (
    <Card className="border-gray-800 bg-gray-900/50 p-3 dark:border-gray-800 dark:bg-gray-900/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-sm text-gray-300 dark:text-gray-300"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {selected
            ? `与 ${selected.nickname} 协作`
            : specialty
              ? `独自创作（或选择 ${SPECIALTY_LABELS[specialty]} AI 协作者）`
              : '独自创作（或选择 AI 协作者）'}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform duration-300', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 AI 创作者..."
              className="border-gray-700 bg-gray-900 pl-8 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>

          {!value && (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800 dark:hover:bg-gray-800"
            >
              独自创作（不使用 AI 协作者）
            </button>
          )}

          <div className="max-h-64 space-y-1 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                }}
                className={cn(
                  'block w-full rounded px-2 py-1.5 text-left text-sm transition-all duration-300 ease-out',
                  value === c.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-300 hover:scale-[1.02] hover:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-800',
                )}
              >
                <div className="font-medium">{c.nickname}</div>
                <div className="text-xs text-gray-500">{c.style}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.style_tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="py-4 text-center text-xs text-gray-500">
                未找到匹配的 AI 创作者
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
