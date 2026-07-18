import JSZip from 'jszip'
import type { WebContainerSandbox } from '@/components/WebContainerSandbox'

/** 二进制文件扩展名白名单（用 Uint8Array 读取，避免 utf8 解码损坏） */
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'webm', 'ogg', 'wav', 'mpga',
  'pdf', 'zip', 'gz', 'tar',
])

/** 判断文件路径是否为二进制文件 */
function isBinaryFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  return BINARY_EXTENSIONS.has(ext)
}

/**
 * 导出 WebContainer 项目为 ZIP 文件并触发下载
 *
 * 增强（修复"无法下载整个沙箱内的所有文件"问题）：
 *   - 二进制文件（图片/字体/音视频）用 Uint8Array 读取，避免 utf8 解码损坏
 *   - 提供进度回调，让 UI 显示导出进度
 *   - 单个文件读取失败不中断整体导出
 *   - 返回导出统计（成功/跳过数）
 *
 * @param sandbox WebContainerSandbox 实例
 * @param filename 文件名，默认 'vibe-project.zip'
 * @param onProgress 进度回调 (current, total)
 */
export async function exportProjectAsZip(
  sandbox: WebContainerSandbox,
  filename: string = 'vibe-project.zip',
  onProgress?: (current: number, total: number) => void,
): Promise<{ addedCount: number; skippedCount: number; skippedPaths: string[] }> {
  if (!sandbox.isReady) {
    throw new Error('沙箱未就绪，无法导出')
  }

  const files = await sandbox.listFilesRecursive('.')
  const fileEntries = files.filter((f) => f.type === 'file')
  if (fileEntries.length === 0) {
    throw new Error('项目为空，没有文件可导出')
  }

  const zip = new JSZip()
  let addedCount = 0
  let skippedCount = 0
  const skippedPaths: string[] = []
  const total = fileEntries.length

  for (let i = 0; i < fileEntries.length; i++) {
    const file = fileEntries[i]
    // 跳过 node_modules / .git（listFilesRecursive 已经过滤）
    try {
      if (isBinaryFile(file.path)) {
        // 二进制文件：用 Uint8Array 读取
        const buf = await sandbox.readFileBinary(file.path)
        zip.file(file.path, buf)
      } else {
        // 文本文件：用 utf8 读取
        const content = await sandbox.readFile(file.path)
        zip.file(file.path, content)
      }
      addedCount++
    } catch (err) {
      console.warn(`[exportProjectAsZip] 跳过文件 ${file.path}:`, err)
      skippedCount++
      skippedPaths.push(file.path)
    }
    // 进度回调
    if (onProgress) {
      try {
        onProgress(i + 1, total)
      } catch {
        // 进度回调失败不影响导出
      }
    }
  }

  if (addedCount === 0) {
    throw new Error('没有可导出的文件（所有文件读取失败）')
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

  return { addedCount, skippedCount, skippedPaths }
}
