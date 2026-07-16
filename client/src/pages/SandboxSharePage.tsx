// =====================================================================
// 沙箱快照分享页（Batch D - D8）
// ---------------------------------------------------------------------
// 路由：/share/sandbox/:slug（公开访问，无需登录）
// 功能：
//   - 从 URL 取 slug
//   - 调 GET /api/sandbox/:slug 拉取快照（每次访问累加 view_count）
//   - 渲染快照信息卡（标题 / 作者 / 浏览次数 / 创建时间）
//   - 优先用 previewHtml 渲染 iframe（无需启动 dev server）
//   - 文件列表只读浏览（点选切换右侧代码视图）
//   - 顶部 CTA：前往 Vibe Coding 体验
// =====================================================================

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { getSandboxSnapshotApi, type SandboxFileEntry, type SandboxSnapshot } from '@/lib/api'

type LoadStatus = 'loading' | 'ok' | 'error'

/** 从文件扩展名推断语言（仅用于显示标签） */
function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    js: 'JavaScript',
    jsx: 'JavaScript',
    ts: 'TypeScript',
    tsx: 'TypeScript',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    md: 'Markdown',
    vue: 'Vue',
    py: 'Python',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    sh: 'Shell',
    yml: 'YAML',
    yaml: 'YAML',
  }
  return map[ext] ?? 'Text'
}

/** 格式化创建时间 */
function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 构建预览 iframe 的 srcDoc（优先用 previewHtml，否则从 index.html 提取） */
function buildPreviewSrcDoc(snapshot: SandboxSnapshot): string | null {
  if (snapshot.previewHtml) return snapshot.previewHtml
  // 从文件列表中找 index.html
  const files = snapshot.files ?? []
  const indexHtml = files.find((f) => f.type === 'file' && f.path.endsWith('index.html'))
  return indexHtml?.content ?? null
}

/** 从扁平路径数组构建树结构（用于渲染文件列表） */
interface TreeNode {
  path: string
  name: string
  type: 'file' | 'directory'
  children: TreeNode[]
}

function buildTree(files: SandboxFileEntry[]): TreeNode {
  const root: TreeNode = { path: '', name: 'root', type: 'directory', children: [] }
  for (const file of files) {
    if (file.type !== 'file') continue
    const parts = file.path.split('/').filter(Boolean)
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')
      let child = current.children.find((c) => c.name === part)
      if (!child) {
        child = {
          path,
          name: part,
          type: isLast ? 'file' : 'directory',
          children: [],
        }
        current.children.push(child)
      }
      current = child
    }
  }
  // 排序：目录在前，字母升序
  const sortRecursive = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortRecursive)
  }
  sortRecursive(root)
  return root
}

/** 渲染文件树节点（递归） */
function renderTreeNode(
  node: TreeNode,
  depth: number,
  selectedPath: string | null,
  onSelect: (path: string) => void,
): ReactNode {
  if (node.type === 'file') {
    const isSelected = node.path === selectedPath
    return (
      <button
        key={node.path}
        onClick={() => onSelect(node.path)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-all duration-200',
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="truncate">{node.name}</span>
      </button>
    )
  }
  // 目录
  return (
    <div key={node.path || 'root'}>
      {node.path && (
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="text-amber-500 dark:text-amber-400">📁</span>
          <span className="truncate">{node.name}</span>
        </div>
      )}
      {node.children.map((child) => renderTreeNode(child, depth + 1, selectedPath, onSelect))}
    </div>
  )
}

export function SandboxSharePage() {
  const { slug } = useParams<{ slug: string }>()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [snapshot, setSnapshot] = useState<SandboxSnapshot | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setStatus('error')
      setErrorMsg('缺少分享参数')
      return
    }
    let active = true
    setStatus('loading')
    getSandboxSnapshotApi(slug)
      .then((res) => {
        if (!active) return
        const snap = res.snapshot
        setSnapshot(snap)
        // 默认选中 index.html 或第一个文件
        const files = snap.files ?? []
        const defaultFile =
          files.find((f) => f.type === 'file' && f.path.endsWith('index.html')) ??
          files.find((f) => f.type === 'file') ??
          null
        setSelectedPath(defaultFile?.path ?? null)
        setStatus('ok')
      })
      .catch((err: Error) => {
        if (!active) return
        setErrorMsg(err.message || '沙箱快照不存在或已被删除')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [slug])

  // 文件树
  const tree = useMemo(() => {
    if (!snapshot?.files) return null
    return buildTree(snapshot.files)
  }, [snapshot])

  // 当前选中的文件内容
  const selectedFile = useMemo(() => {
    if (!snapshot?.files || !selectedPath) return null
    return snapshot.files.find((f) => f.path === selectedPath) ?? null
  }, [snapshot, selectedPath])

  // iframe 预览 srcDoc
  const previewSrcDoc = useMemo(() => {
    if (!snapshot) return null
    return buildPreviewSrcDoc(snapshot)
  }, [snapshot])

  // ---------------------------------------------------------------------
  // 加载中
  // ---------------------------------------------------------------------
  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-50 dark:bg-gray-950">
        <SimpleHeader />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------
  // 错误
  // ---------------------------------------------------------------------
  if (status === 'error' || !snapshot) {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-50 dark:bg-gray-950">
        <SimpleHeader />
        <div className="flex flex-1 items-center justify-center px-4">
          <EmptyState
            title="沙箱不存在"
            description={errorMsg || '此分享可能已被删除或链接错误'}
            action={
              <Button asChild>
                <Link to="/">返回首页</Link>
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------
  // 主视图
  // ---------------------------------------------------------------------
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 dark:bg-gray-950">
      <SimpleHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          {/* 标题区 */}
          <header className="mb-6 text-center animate-slide-up">
            <h1 className="bg-gradient-to-r from-primary via-amber-400 to-orange-500 bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl">
              {snapshot.title || '未命名沙箱'}
            </h1>
            {snapshot.description && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {snapshot.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              {snapshot.authorName && (
                <span>
                  作者：<span className="font-medium text-gray-700 dark:text-gray-300">{snapshot.authorName}</span>
                </span>
              )}
              <span>👁 {snapshot.viewCount} 次浏览</span>
              <span>📅 {formatCreatedAt(snapshot.createdAt)}</span>
            </div>
          </header>

          {/* 主体：左文件树 / 中代码 / 右预览（桌面三栏，移动端 Tabs） */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_1fr]">
            {/* 文件树 */}
            <aside className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                文件列表
              </h2>
              <div className="max-h-[60vh] overflow-y-auto">
                {tree && tree.children.length > 0 ? (
                  tree.children.map((node) => renderTreeNode(node, 0, selectedPath, setSelectedPath))
                ) : (
                  <p className="px-2 py-4 text-xs text-gray-400 dark:text-gray-500">暂无文件</p>
                )}
              </div>
            </aside>

            {/* 代码区 */}
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
                <span className="truncate font-mono text-xs text-gray-700 dark:text-gray-300">
                  {selectedFile?.path ?? '未选择文件'}
                </span>
                {selectedFile?.path && (
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {detectLanguage(selectedFile.path)}
                  </span>
                )}
              </div>
              <pre className="max-h-[60vh] overflow-auto p-4 text-xs leading-relaxed">
                <code className="font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                  {selectedFile?.content ?? '// 选择左侧文件查看内容'}
                </code>
              </pre>
            </section>

            {/* 预览区 */}
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">实时预览</span>
                {previewSrcDoc ? (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    ● Live
                  </span>
                ) : (
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    无预览
                  </span>
                )}
              </div>
              {previewSrcDoc ? (
                <iframe
                  title="sandbox-preview"
                  srcDoc={previewSrcDoc}
                  sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
                  className="h-[60vh] w-full rounded-b-xl bg-white"
                />
              ) : (
                <div className="flex h-[60vh] items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                  该沙箱未提供 previewHtml，无法直接预览
                </div>
              )}
            </section>
          </div>

          {/* 底部 CTA */}
          <footer className="mt-8 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              来 AI Lab 亲手试一试
            </h2>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              在 Vibe Coding 中创建你自己的沙箱，与 AI 协作编码并一键分享
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button asChild>
                <Link to="/studio/vibe-code">前往 Vibe Coding</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">回首页</Link>
              </Button>
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------

/** 简单顶部条：仅 logo + 回首页 */
function SimpleHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link
          to="/"
          className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-xl font-extrabold text-transparent transition-transform duration-300 ease-out hover:scale-[1.05]"
        >
          AI Lab
        </Link>
        <Button asChild size="sm" variant="outline">
          <Link to="/">回首页</Link>
        </Button>
      </nav>
    </header>
  )
}

export default SandboxSharePage
