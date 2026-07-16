// =====================================================================
// FileTree 组件：WebContainer 文件树
// ---------------------------------------------------------------------
// 功能：
//   - 使用 react-arborist 渲染虚拟滚动文件树
//   - 递归读取 WebContainer 根目录
//   - 点击文件 → 读取内容 → onFileSelect 回调
//   - 新建 / 删除 / 重命名按钮（lucide 图标）
//   - 暗色模式
//
// 降级说明：当 webcontainer 为 null 或未就绪时显示"沙箱未就绪"。
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Tree, type NodeRendererProps } from 'react-arborist'
import { FilePlus, Trash, Pencil, File as FileIcon, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import type { WebContainerSandbox } from '@/components/WebContainerSandbox'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface FileTreeProps {
  webcontainer: WebContainerSandbox | null
  onFileSelect?: (path: string, content: string) => void
}

/** useContainerHeight：用 ResizeObserver 动态获取容器高度，避免硬编码 */
function useContainerHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [height, setHeight] = useState(400)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height
        if (h > 0) setHeight(h)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, height }
}

/** react-arborist 节点数据结构 */
interface TreeNode {
  id: string
  name: string
  type: 'file' | 'directory'
  path: string
  children?: TreeNode[]
}

/** 从扁平文件列表构建树结构 */
function buildTree(
  files: Array<{ path: string; type: 'file' | 'directory' }>,
): TreeNode {
  const root: TreeNode = {
    id: 'root',
    name: '/',
    type: 'directory',
    path: '.',
    children: [],
  }

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root
    let currentPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLast = i === parts.length - 1

      // 查找或创建子节点
      let child = current.children?.find((c) => c.name === part)
      if (!child) {
        child = {
          id: currentPath,
          name: part,
          type: isLast ? file.type : 'directory',
          path: currentPath,
          children: file.type === 'directory' || !isLast ? [] : undefined,
        }
        current.children?.push(child)
      }
      current = child
    }
  }

  // 排序：目录在前，文件在后，字母升序
  const sortRecursive = (node: TreeNode) => {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      node.children.forEach(sortRecursive)
    }
  }
  sortRecursive(root)

  return root
}

/** 单个节点渲染器 */
function Node({ node, style }: NodeRendererProps<TreeNode>) {
  const data = node.data
  const isDir = data.type === 'directory'

  return (
    <div
      style={style}
      className={cn(
        'flex cursor-pointer items-center gap-1 px-1 text-xs leading-5 hover:bg-slate-700/40',
        node.isSelected && 'bg-primary/20 text-primary',
        isDir ? 'text-blue-300' : 'text-slate-300',
      )}
      onClick={() => {
        if (!isDir) {
          node.select()
        }
      }}
    >
      <span className="inline-flex w-4 justify-center">
        {isDir ? (
          node.isOpen ? (
            <FolderOpen className="h-3 w-3" />
          ) : (
            <Folder className="h-3 w-3" />
          )
        ) : (
          <FileIcon className="h-3 w-3" />
        )}
      </span>
      <span className="truncate">{data.name}</span>
    </div>
  )
}

export function FileTree({ webcontainer, onFileSelect }: FileTreeProps) {
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { ref: treeContainerRef, height: treeHeight } = useContainerHeight<HTMLDivElement>()

  /** 刷新文件树 */
  const refresh = useCallback(async () => {
    if (!webcontainer || !webcontainer.isReady) return
    setLoading(true)
    try {
      const files = await webcontainer.listFilesRecursive('.')
      const tree = buildTree(files)
      setTreeData(tree.children ?? [])
    } catch (err) {
      console.error('[FileTree] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [webcontainer])

  // 防抖刷新：文件操作后延迟 300ms 刷新，避免频繁刷新
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      void refresh()
    }, 300)
  }, [refresh])

  useEffect(() => {
    void refresh()
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [refresh])

  /** 点击文件：读取内容并回调 */
  const handleSelect = useCallback(
    async (node: TreeNode) => {
      if (node.type !== 'file') return
      setSelectedPath(node.path)
      if (!webcontainer || !webcontainer.isReady) return
      try {
        const content = await webcontainer.readFile(node.path)
        onFileSelect?.(node.path, content)
      } catch (err) {
        console.error('[FileTree] readFile failed:', err)
        onFileSelect?.(node.path, '')
      }
    },
    [webcontainer, onFileSelect],
  )

  /** 新建文件 */
  const handleCreateFile = useCallback(async () => {
    const name = newFileName.trim()
    if (!name || !webcontainer || !webcontainer.isReady) return
    try {
      await webcontainer.writeFile(name, '')
      setNewFileName('')
      debouncedRefresh()
    } catch (err) {
      console.error('[FileTree] createFile failed:', err)
    }
  }, [newFileName, webcontainer, debouncedRefresh])

  /** 删除文件 */
  const handleDelete = useCallback(
    async (path: string) => {
      if (!webcontainer || !webcontainer.isReady) return
      if (!confirm(`确认删除 ${path}？`)) return
      try {
        await webcontainer.deleteFile(path)
        if (selectedPath === path) setSelectedPath(null)
        debouncedRefresh()
      } catch (err) {
        console.error('[FileTree] delete failed:', err)
      }
    },
    [webcontainer, selectedPath, debouncedRefresh],
  )

  /** 重命名文件 */
  const handleRename = useCallback(
    async (oldPath: string, newName: string) => {
      if (!newName || !webcontainer || !webcontainer.isReady) return
      const parts = oldPath.split('/')
      parts[parts.length - 1] = newName
      const newPath = parts.join('/')
      try {
        await webcontainer.renameFile(oldPath, newPath)
        setRenamingPath(null)
        setRenameValue('')
        debouncedRefresh()
      } catch (err) {
        console.error('[FileTree] rename failed:', err)
      }
    },
    [webcontainer, debouncedRefresh],
  )

  if (!webcontainer || !webcontainer.isReady) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-xs text-slate-400">
        <Folder className="mb-2 h-6 w-6 opacity-40" />
        沙箱未就绪
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-200">
      {/* 顶部工具栏 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-700 px-2 py-1.5">
        <span className="flex-1 text-xs font-medium text-slate-400">文件</span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          title="刷新"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </button>
      </div>

      {/* 新建文件输入框 */}
      <div className="shrink-0 border-b border-slate-700 p-1.5">
        <div className="flex items-center gap-1">
          <Input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="新文件名（如 src/app.js）"
            className="h-6 border-slate-600 bg-slate-800 px-1.5 text-xs text-slate-200 placeholder:text-slate-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateFile()
              if (e.key === 'Escape') setNewFileName('')
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 px-1.5 text-slate-300 hover:bg-slate-700"
            onClick={() => void handleCreateFile()}
            disabled={!newFileName.trim()}
          >
            <FilePlus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* 文件树 */}
      <div ref={treeContainerRef} className="flex-1 overflow-auto scrollbar-thin">
        {treeData.length === 0 ? (
          <div className="p-3 text-center text-xs text-slate-500">
            {loading ? '加载中…' : '暂无文件'}
          </div>
        ) : (
          <Tree
            data={treeData}
            width="100%"
            height={treeHeight}
            rowHeight={22}
            indent={12}
            openByDefault={false}
            onActivate={(node) => {
              const data = node.data as TreeNode
              if (data.type === 'file') {
                void handleSelect(data)
              }
            }}
          >
            {Node}
          </Tree>
        )}
      </div>

      {/* 选中文件的操作栏 */}
      {selectedPath && (
        <div className="shrink-0 border-t border-slate-700 px-2 py-1">
          <div className="flex items-center gap-1">
            <span className="flex-1 truncate text-xs text-slate-400" title={selectedPath}>
              {selectedPath}
            </span>
            <button
              type="button"
              onClick={() => {
                setRenamingPath(selectedPath)
                const parts = selectedPath.split('/')
                setRenameValue(parts[parts.length - 1] || '')
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              title="重命名"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(selectedPath)}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-red-900/50 hover:text-red-300"
              title="删除"
            >
              <Trash className="h-3 w-3" />
            </button>
          </div>
          {renamingPath === selectedPath && (
            <div className="mt-1 flex items-center gap-1">
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="h-6 border-slate-600 bg-slate-800 px-1.5 text-xs text-slate-200"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRename(selectedPath, renameValue)
                  if (e.key === 'Escape') {
                    setRenamingPath(null)
                    setRenameValue('')
                  }
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-6 shrink-0 px-1.5 text-slate-300 hover:bg-slate-700"
                onClick={() => void handleRename(selectedPath, renameValue)}
              >
                确定
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FileTree
