// =====================================================================
// 前端 bash 工具桥接
// ---------------------------------------------------------------------
// 将后端 SSE 流中的 tool_call 事件（bash / writeFile / readFile / listFiles /
// install）转发到前端 WebContainer 沙箱执行，不经过后端。
//
// 工作流程：
//   1. VibeCodePage 初始化 WebContainerSandbox 后调用 setSandbox(sandbox)
//   2. SSE 消费逻辑中，收到 tool_call 事件时检查 name 是否在 FRONTEND_TOOLS 中
//   3. 若是，由前端 executeFrontendTool 执行，结果作为 tool_result 注入到
//      messages 状态（不发送回后端）
// =====================================================================

import type { WebContainerSandbox } from '@/components/WebContainerSandbox'

/** 全局 WebContainer 实例引用（由 VibeCodePage 设置） */
let _sandbox: WebContainerSandbox | null = null

/** 设置全局 WebContainer 沙箱引用 */
export function setSandbox(s: WebContainerSandbox | null): void {
  _sandbox = s
}

/** 获取当前全局沙箱引用 */
export function getSandbox(): WebContainerSandbox | null {
  return _sandbox
}

/** 判断一个 tool 是否由前端 WebContainer 执行 */
export const FRONTEND_TOOLS = new Set([
  'bash',
  'writeFile',
  'readFile',
  'listFiles',
  'install',
  'readTerminal',
  'getIframeErrors',
  'getConsoleLogs',
  'verifyRendering',
])

/**
 * 执行前端工具（返回 tool_result 数据）。
 * 由 VibeCodePage 在 SSE 消费逻辑中调用，结果直接注入到 messages 状态。
 */
export async function executeFrontendTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!_sandbox) throw new Error('WebContainer 未就绪')

  switch (name) {
    case 'bash': {
      const cmd = String(args.command ?? '')
      const result = await _sandbox.runCommand(cmd)
      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        exitCode: result.exitCode,
      }
    }
    case 'writeFile': {
      await _sandbox.writeFile(String(args.path ?? ''), String(args.content ?? ''))
      return { success: true, path: args.path }
    }
    case 'readFile': {
      const content = await _sandbox.readFile(String(args.path ?? ''))
      return { success: true, path: args.path, content }
    }
    case 'listFiles': {
      const files = await _sandbox.listFiles(String(args.path ?? '.'))
      return { success: true, files }
    }
    case 'install': {
      const pkg = String(args.pkg ?? '')
      const result = await _sandbox.runCommand(`npm install ${pkg}`)
      return { success: result.exitCode === 0, stdout: result.stdout }
    }
    case 'readTerminal': {
      const lines = (args.lines as number) ?? 50
      const output = _sandbox.getTerminalHistory(lines)
      return { success: true, output, lines }
    }
    case 'getIframeErrors': {
      const errors = _sandbox.getIframeErrors()
      const clear = args.clear !== false // 默认 true
      if (clear) _sandbox.clearIframeErrors()
      return { success: true, errors, count: errors.length }
    }
    case 'getConsoleLogs': {
      const level = (args.level as 'all' | 'log' | 'warn' | 'error') ?? 'all'
      const lines = (args.lines as number) ?? 50
      const all = _sandbox.getConsoleLogs()
      const filtered =
        level === 'all' ? all : all.filter((l) => l.method === level)
      const logs = filtered.slice(-lines)
      return { success: true, logs, count: logs.length }
    }
    case 'verifyRendering': {
      // 检查 iframe 是否加载成功、body 是否有内容
      const iframe = document.querySelector(
        'iframe[data-vibe-preview]',
      ) as HTMLIFrameElement | null
      if (!iframe || !iframe.contentDocument) {
        return { success: false, verified: false, error: 'iframe 未加载' }
      }
      const body = iframe.contentDocument.body
      const hasContent = !!(body && body.children.length > 0)
      const text = body?.textContent?.trim() || ''
      const hasText = text.length > 0
      return {
        success: true,
        verified: hasContent || hasText,
        hasContent,
        hasText,
        textLength: text.length,
        childElementCount: body?.children.length || 0,
        expectation: args.expectation,
      }
    }
    default:
      return { error: `未知前端工具：${name}` }
  }
}
