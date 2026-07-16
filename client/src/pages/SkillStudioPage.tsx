import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, AlertCircle, Wrench, CheckCircle2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { SkillCategory, SkillManifest } from '@shared/types'

/** 默认 manifest 模板（帮助用户快速上手） */
const DEFAULT_MANIFEST = `{
  "name": "我的 Skill",
  "description": "这个 Skill 能做什么",
  "tools": [
    {
      "name": "myTool",
      "description": "工具的用途说明",
      "parameters": {
        "input": {
          "type": "string",
          "description": "输入参数说明"
        }
      }
    }
  ],
  "systemPrompt": "你可以使用 myTool 工具来……"
}`

/** 合法的分类 */
const CATEGORIES: Array<{ value: SkillCategory; label: string }> = [
  { value: 'search', label: '搜索' },
  { value: 'media', label: '媒体' },
  { value: 'code', label: '代码' },
  { value: 'data', label: '数据' },
  { value: 'utility', label: '工具' },
  { value: 'custom', label: '自定义' },
]

/** Skill Studio 创建页面（精简实现：JSON 编辑 + 预览 + 发布） */
export function SkillStudioPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SkillCategory>('custom')
  const [manifestText, setManifestText] = useState(DEFAULT_MANIFEST)
  const [publishing, setPublishing] = useState(false)

  /** 解析 manifest JSON，实时预览 */
  const { manifest, manifestError } = useMemo(() => {
    try {
      const parsed = JSON.parse(manifestText) as SkillManifest
      if (typeof parsed.name !== 'string' || typeof parsed.description !== 'string' || !Array.isArray(parsed.tools)) {
        return { manifest: null, manifestError: 'manifest 需包含 name(string)、description(string)、tools(array)' }
      }
      return { manifest: parsed, manifestError: null }
    } catch (err) {
      return { manifest: null, manifestError: err instanceof Error ? err.message : 'JSON 解析失败' }
    }
  }, [manifestText])

  /** slug 自动生成（从小写 name） */
  const handleNameChange = useCallback((value: string) => {
    setName(value)
    // 如果 slug 为空或还是自动生成的，自动填充
    const autoSlug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!slug || slug === autoSlug.replace(/-$/, '')) {
      setSlug(autoSlug)
    }
  }, [slug])

  /** 发布 skill */
  const handlePublish = useCallback(async () => {
    // 校验
    if (!name.trim()) {
      toast.error('请填写 Skill 名称')
      return
    }
    if (!slug.trim() || !/^[a-z0-9-]+$/i.test(slug)) {
      toast.error('slug 仅允许小写字母、数字、连字符')
      return
    }
    if (!description.trim()) {
      toast.error('请填写 Skill 描述')
      return
    }
    if (!manifest || manifestError) {
      toast.error(manifestError || 'manifest JSON 无效')
      return
    }

    setPublishing(true)
    try {
      await apiFetch('/skills', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim(),
          category,
          manifest,
          version: '1.0.0',
        }),
      })
      toast.success('Skill 已提交，等待管理员审核发布')
      navigate('/skills')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发布失败')
    } finally {
      setPublishing(false)
    }
  }, [name, slug, description, category, manifest, manifestError, navigate])

  return (
    <div className="animate-fade-in mx-auto max-w-4xl px-4 py-6">
      {/* 顶部导航 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/skills')}
          className="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回市场
        </button>
      </div>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
        创建 Skill
      </h1>
      <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
        编写 Skill manifest JSON，定义工具签名与系统提示词。发布后需管理员审核。
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左侧：表单 */}
        <div className="space-y-4">
          {/* 名称 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
              Skill 名称
            </label>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="如：翻译助手"
              maxLength={100}
            />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
              Slug（唯一标识）
            </label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="如：my-translator"
              className="font-mono"
            />
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              仅小写字母、数字、连字符
            </p>
          </div>

          {/* 描述 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
              描述
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="这个 Skill 能做什么..."
              rows={2}
            />
          </div>

          {/* 分类 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
              分类
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300 ease-out',
                    category === cat.value
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Manifest JSON */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
              Manifest JSON
            </label>
            <Textarea
              value={manifestText}
              onChange={(e) => setManifestText(e.target.value)}
              rows={16}
              className="font-mono text-xs"
              spellCheck={false}
            />
            {manifestError ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-[hsl(var(--destructive))]">
                <AlertCircle className="h-3 w-3" />
                {manifestError}
              </p>
            ) : manifest ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                JSON 有效
              </p>
            ) : null}
          </div>

          {/* 发布按钮 */}
          <button
            onClick={handlePublish}
            disabled={publishing || !manifest || !!manifestError}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                发布中...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                提交发布
              </>
            )}
          </button>
        </div>

        {/* 右侧：实时预览 */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
              预览
            </h3>

            {/* 卡片预览 */}
            <div className="rounded-lg border border-[hsl(var(--border))] p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h4 className="text-base font-semibold text-[hsl(var(--foreground))]">
                  {name || 'Skill 名称'}
                </h4>
                <Badge variant="secondary" className="shrink-0">
                  {category}
                </Badge>
              </div>
              <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">
                {description || 'Skill 描述'}
              </p>

              {/* 工具签名预览 */}
              {manifest?.tools && manifest.tools.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    工具（{manifest.tools.length}）
                  </p>
                  {manifest.tools.map((t) => (
                    <div
                      key={t.name}
                      className="rounded-md bg-[hsl(var(--muted)/0.5)] p-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <Wrench className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                        <code className="text-xs font-medium text-[hsl(var(--foreground))]">
                          {t.name}
                        </code>
                      </div>
                      {t.description && (
                        <p className="mt-0.5 pl-4 text-xs text-[hsl(var(--muted-foreground))]">
                          {t.description}
                        </p>
                      )}
                      {t.parameters && Object.keys(t.parameters).length > 0 && (
                        <div className="mt-1 pl-4">
                          {Object.entries(t.parameters).map(([key, spec]) => {
                            const s = spec as { type?: string; description?: string }
                            return (
                              <div key={key} className="flex gap-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                                <code className="font-mono text-[hsl(var(--foreground))]/70">{key}</code>
                                <span>: {s.type || 'string'}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">暂无工具</p>
              )}

              {/* systemPrompt 预览 */}
              {manifest?.systemPrompt && (
                <div className="mt-3 rounded-md bg-[hsl(var(--accent)/0.05)] p-2">
                  <p className="mb-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    系统提示词
                  </p>
                  <p className="line-clamp-3 text-xs text-[hsl(var(--foreground))]">
                    {manifest.systemPrompt}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 说明 */}
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-4 text-xs text-[hsl(var(--muted-foreground))]">
            <p className="mb-2 font-medium text-[hsl(var(--foreground))]">提示</p>
            <ul className="space-y-1">
              <li>• 内置工具名（webSearch / generateImage / generateVideo / executeCode / bash / writeFile / readFile / saveMemory / recallMemory）会自动绑定服务端实现</li>
              <li>• 自定义工具名仅提供 schema，执行由前端 WebContainer 桥接（Batch D）</li>
              <li>• 发布后需管理员审核通过才会在市场显示</li>
              <li>• slug 全局唯一，发布后不可修改</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
