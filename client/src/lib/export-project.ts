import JSZip from 'jszip'
import type { WebContainerSandbox } from '@/components/WebContainerSandbox'

/**
 * 导出 WebContainer 项目为 ZIP 文件并触发下载
 * @param sandbox WebContainerSandbox 实例
 * @param filename 文件名，默认 'vibe-project.zip'
 */
export async function exportProjectAsZip(
  sandbox: WebContainerSandbox,
  filename: string = 'vibe-project.zip',
): Promise<void> {
  if (!sandbox.isReady) {
    throw new Error('沙箱未就绪，无法导出')
  }

  const files = await sandbox.listFilesRecursive('.')
  if (files.length === 0) {
    throw new Error('项目为空，没有文件可导出')
  }

  const zip = new JSZip()
  let addedCount = 0

  for (const file of files) {
    if (file.type !== 'file') continue
    // 跳过 node_modules / .git（listFilesRecursive 已经过滤）
    try {
      const content = await sandbox.readFile(file.path)
      zip.file(file.path, content)
      addedCount++
    } catch (err) {
      console.warn(`[exportProjectAsZip] 跳过文件 ${file.path}:`, err)
    }
  }

  if (addedCount === 0) {
    throw new Error('没有可导出的文件')
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
