// Vibe Coding Agent：用自然语言描述需求 → AI 生成可运行 HTML → 浏览器内即时预览
// - 左侧：需求输入框 + 生成按钮 + 历史项目列表
// - 右侧：上半部分流式代码显示，下半部分 iframe(srcDoc) 预览
// - 工具栏：保存 / 下载 / 修复 / 重置
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  saveVibeProject,
  listVibeProjects,
  streamVibeCode,
  streamVibeFix,
  type VibeProject,
} from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui-legacy/Card'
import { Button } from '@/components/ui-legacy/Button'
import { Input } from '@/components/ui-legacy/Input'
import { Spinner } from '@/components/ui-legacy/Spinner'
import { EmptyState } from '@/components/ui-legacy/EmptyState'
import { Dialog } from '@/components/ui-legacy/Dialog'

const EXAMPLE_PROMPTS = [
  '一个带动画的登录表单',
  '贪吃蛇小游戏',
  '一个会下雪的圣诞主题页面',
  '带本地存储的待办事项 App',
]

export const VibeCodePage = () => {
  const { user } = useAuth()

  const [prompt, setPrompt] = useState('')
  const [code, setCode] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [lastPrompt, setLastPrompt] = useState('')

  // 历史项目
  const [projects, setProjects] = useState<VibeProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)

  // 保存弹窗
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [savePublic, setSavePublic] = useState(false)
  const [saving, setSaving] = useState(false)

  // 修复弹窗
  const [fixOpen, setFixOpen] = useState(false)
  const [fixError, setFixError] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const codeRef = useRef<HTMLPreElement>(null)

  // 流式代码自动滚底
  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight
    }
  }, [code])

  // 卸载时取消流式请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // 加载历史项目列表
  const loadProjects = useCallback(async () => {
    if (!user) return
    setProjectsLoading(true)
    try {
      const res = await listVibeProjects()
      setProjects(res.projects ?? [])
    } catch {
      // 静默
    } finally {
      setProjectsLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // 生成代码
  const handleGenerate = useCallback(
    async (promptText?: string) => {
      const trimmed = (promptText ?? prompt).trim()
      if (!trimmed || streaming) return

      setPrompt(trimmed)
      setLastPrompt(trimmed)
      setCode('')
      setError('')
      setStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      let collected = ''
      try {
        await streamVibeCode(trimmed, {
          signal: controller.signal,
          onToken: (token) => {
            collected += token
            setCode(collected)
          },
          onDone: (finalCode) => {
            setCode(finalCode || collected)
            setStreaming(false)
          },
          onError: (err) => {
            setError(err)
            setStreaming(false)
          },
        })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setStreaming(false)
        } else {
          setError(err instanceof Error ? err.message : '生成失败')
          setStreaming(false)
        }
      } finally {
        abortRef.current = null
      }
    },
    [prompt, streaming],
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
  }, [])

  // 重置
  const handleReset = useCallback(() => {
    setCode('')
    setError('')
    setPrompt('')
    setLastPrompt('')
  }, [])

  // 下载 HTML
  const handleDownload = useCallback(() => {
    if (!code) return
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(lastPrompt || 'vibe-code').slice(0, 30).replace(/\s+/g, '-')}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [code, lastPrompt])

  // 复制代码
  const handleCopy = useCallback(async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // 静默
    }
  }, [code])

  // 保存项目
  const handleSave = useCallback(async () => {
    if (!code || !saveTitle.trim()) return
    setSaving(true)
    try {
      await saveVibeProject({
        title: saveTitle.trim(),
        code,
        prompt: lastPrompt,
        is_public: savePublic,
      })
      toast.success('作品保存成功！')
      setSaveOpen(false)
      setSaveTitle('')
      setSavePublic(false)
      loadProjects()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }, [code, saveTitle, savePublic, lastPrompt, loadProjects])

  // 修复代码
  const handleFix = useCallback(async () => {
    if (!code || streaming) return
    setFixOpen(false)
    setCode('')
    setError('')
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    const errDesc = fixError.trim() || '运行时错误，请检查并修复代码中的问题'
    let collected = ''
    try {
      await streamVibeFix(code, errDesc, {
        signal: controller.signal,
        onToken: (token) => {
          collected += token
          setCode(collected)
        },
        onDone: (finalCode) => {
          setCode(finalCode || collected)
          setStreaming(false)
        },
        onError: (err) => {
          setError(err)
          setStreaming(false)
        },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStreaming(false)
      } else {
        setError(err instanceof Error ? err.message : '修复失败')
        setStreaming(false)
      }
    } finally {
      abortRef.current = null
      setFixError('')
    }
  }, [code, streaming, fixError])

  // 加载历史项目
  const handleLoadProject = useCallback((project: VibeProject) => {
    setCode(project.code)
    setPrompt(project.prompt)
    setLastPrompt(project.prompt)
    setError('')
  }, [])

  const hasCode = code.length > 0

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-6">
      {/* 头部 */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link to="/studio" className="text-sm text-gray-500 hover:text-primary">
            ← 返回创意工坊
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold text-gray-900">
            Vibe 编程
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            用自然语言描述需求，AI 生成可运行代码，浏览器内即时预览
          </p>
        </div>

        {/* 工具栏 */}
        {hasCode && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              disabled={streaming}
            >
              复制
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={streaming}
            >
              下载
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFixOpen(true)}
              disabled={streaming}
            >
              修复
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={streaming}
            >
              重置
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSaveTitle(lastPrompt.slice(0, 40) || '未命名项目')
                setSaveOpen(true)
              }}
              disabled={streaming}
            >
              保存
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* 左侧：输入 + 历史 */}
        <div className="space-y-4">
          <Card className="p-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              描述你的需求 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：做一个带动画的登录表单，有用户名和密码输入框，提交时验证非空..."
              disabled={streaming}
              rows={6}
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />

            {/* 示例提示 */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  disabled={streaming}
                  className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              {streaming ? (
                <Button variant="outline" className="flex-1" onClick={handleStop}>
                  停止生成
                </Button>
              ) : (
                <Button
                  className="flex-1 transition-transform duration-300 ease-out hover:scale-[1.02]"
                  onClick={() => handleGenerate()}
                  disabled={!prompt.trim()}
                >
                  生成代码
                </Button>
              )}
            </div>
          </Card>

          {/* 历史项目 */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">我的项目</h3>
              {projects.length > 0 && (
                <span className="text-xs text-gray-400">{projects.length}</span>
              )}
            </div>

            {!user ? (
              <p className="py-3 text-center text-xs text-gray-400">
                <Link to="/auth/login" className="text-primary hover:underline">
                  登录
                </Link>
                后可保存项目
              </p>
            ) : projectsLoading ? (
              <div className="flex justify-center py-4">
                <Spinner size="sm" />
              </div>
            ) : projects.length === 0 ? (
              <p className="py-3 text-center text-xs text-gray-400">
                还没有项目，生成后点击「保存」
              </p>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto scrollbar-thin">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleLoadProject(p)}
                    className="block w-full rounded-lg border border-gray-100 px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <p className="truncate text-sm font-medium text-gray-800">
                      {p.title}
                    </p>
                    {p.prompt && (
                      <p className="mt-0.5 truncate text-xs text-gray-400">
                        {p.prompt}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-300">
                      {new Date(p.created_at).toLocaleString('zh-CN')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* 右侧：代码 + 预览 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-rows-[1fr_1fr]">
          {/* 代码显示 */}
          <Card className="flex min-h-[280px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <span className="text-xs font-medium text-gray-500">
                代码
              </span>
              {streaming && (
                <span className="flex items-center gap-1.5 text-xs text-primary">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  生成中…
                </span>
              )}
              {hasCode && !streaming && (
                <span className="text-xs text-gray-400">{code.length} 字符</span>
              )}
            </div>

            {hasCode ? (
              <pre
                ref={codeRef}
                className="flex-1 overflow-auto bg-gray-50 p-4 font-mono text-xs leading-5 text-gray-800 scrollbar-thin"
              >
                <code>{code}</code>
                {streaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-primary animate-pulse-cursor" />
                )}
              </pre>
            ) : (
              <EmptyState
                className="flex-1"
                title="描述需求开始生成"
                description="在左侧输入框描述你想要的页面或功能，AI 会实时生成可运行的 HTML 代码"
              />
            )}
          </Card>

          {/* iframe 预览 */}
          <Card className="flex min-h-[280px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <span className="text-xs font-medium text-gray-500">预览</span>
              {hasCode && !streaming && (
                <span className="text-xs text-gray-400">iframe srcDoc</span>
              )}
            </div>

            {hasCode ? (
              <iframe
                title="vibe-code-preview"
                srcDoc={code}
                sandbox="allow-scripts allow-modals"
                className="flex-1 w-full border-0 bg-white"
              />
            ) : (
              <EmptyState
                className="flex-1"
                title="预览区"
                description="生成代码后将在此处实时预览运行效果"
              />
            )}
          </Card>
        </div>
      </div>

      {/* 保存弹窗 */}
      <Dialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="保存项目"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              标题
            </label>
            <Input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="给项目起个名字"
              autoFocus
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={savePublic}
              onChange={(e) => setSavePublic(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            公开到广场（其他人可见）
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!saveTitle.trim() || saving}
            >
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 修复弹窗 */}
      <Dialog
        open={fixOpen}
        onClose={() => setFixOpen(false)}
        title="修复代码错误"
        className="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            描述运行时遇到的错误，AI 会基于当前代码生成修复版本。
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              错误信息（可选）
            </label>
            <textarea
              value={fixError}
              onChange={(e) => setFixError(e.target.value)}
              placeholder="例如：点击按钮没反应，控制台报错 xxx is not defined"
              rows={4}
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setFixOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleFix}>
              提交修复
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
