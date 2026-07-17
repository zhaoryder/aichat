import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Download, Link as LinkIcon, Loader2, Share2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shareSnapshotApi, createSnapshotApi } from '@/lib/api'
import { exportProjectAsZip } from '@/lib/export-project'
import type { WebContainerSandbox } from '@/components/WebContainerSandbox'

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sandbox: WebContainerSandbox | null
  /** 当前项目 ID（如果有保存的项目） */
  projectId?: string | null
  /** 当前代码（用于创建快照） */
  currentCode: string
}

export function ShareDialog({ open, onOpenChange, sandbox, projectId, currentCode }: ShareDialogProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 创建只读分享链接
  const handleCreateShareLink = async () => {
    setLoading(true)
    try {
      // 先创建快照（createSnapshotApi 返回 { snapshot: ProjectSnapshot }）
      const { snapshot } = await createSnapshotApi({
        projectId: projectId || 'temp',
        code: currentCode,
        label: `分享 ${new Date().toLocaleString()}`,
      })
      // 再生成分享链接（后端记录分享行为；URL 用 snapshot.id 拼装）
      await shareSnapshotApi(snapshot.id)
      const url = `${window.location.origin}/snapshots/${snapshot.id}`
      setShareUrl(url)
      await navigator.clipboard.writeText(url)
      toast.success('分享链接已复制到剪贴板')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建分享链接失败')
    } finally {
      setLoading(false)
    }
  }

  // 导出 ZIP
  const handleExportZip = async () => {
    if (!sandbox) {
      toast.error('沙箱未就绪')
      return
    }
    setLoading(true)
    try {
      await exportProjectAsZip(sandbox)
      toast.success('项目已导出为 ZIP')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            分享项目
          </DialogTitle>
          <DialogDescription>选择分享方式</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* 分享链接 */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleCreateShareLink}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              创建只读分享链接
            </Button>
            {shareUrl && (
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly className="text-xs" />
                <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success('已复制') }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* 导出 ZIP */}
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleExportZip}
            disabled={loading || !sandbox?.isReady}
          >
            <Download className="h-4 w-4" />
            导出为 ZIP 文件
          </Button>
          {!sandbox?.isReady && (
            <p className="text-xs text-gray-500">沙箱未就绪，无法导出 ZIP</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
