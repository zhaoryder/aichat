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
  'captureIframeSnapshot',
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
    case 'captureIframeSnapshot': {
      // P2-8 多模态：捕获 iframe 结构化 DOM 快照
      const maxDepth = Math.min(Number(args.maxDepth ?? 3), 5)
      const includeStyles = args.includeStyles !== false
      const iframe = document.querySelector(
        'iframe[data-vibe-preview]',
      ) as HTMLIFrameElement | null
      if (!iframe || !iframe.contentDocument) {
        return { success: false, error: 'iframe 未加载，无法捕获快照' }
      }
      const doc = iframe.contentDocument
      const win = iframe.contentWindow
      const body = doc.body

      // 视口信息
      const viewport = {
        width: win?.innerWidth || 0,
        height: win?.innerHeight || 0,
      }

      // 可见文本（前 500 字符，去除多余空白）
      const rawText = body?.textContent || ''
      const visibleText = rawText.replace(/\s+/g, ' ').trim().slice(0, 500)

      // 元素统计
      const stats = {
        elements: doc.getElementsByTagName('*').length,
        forms: doc.getElementsByTagName('form').length,
        images: doc.getElementsByTagName('img').length,
        links: doc.getElementsByTagName('a').length,
        buttons: doc.getElementsByTagName('button').length,
        inputs: doc.getElementsByTagName('input').length,
        scripts: doc.getElementsByTagName('script').length,
        styles: doc.getElementsByTagName('style').length,
      }

      // 简化 DOM 树（深度限制，跳过 script/style/svg）
      const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'LINK', 'META', 'HEAD'])
      function buildTree(el: Element, depth: number): string {
        if (depth > maxDepth) return ''
        const tag = el.tagName.toLowerCase()
        // 跳过空 div/span（无子元素也无文本）
        const hasChildren = el.children.length > 0
        const directText = (el.childNodes.length > 0
          ? Array.from(el.childNodes)
              .filter((n) => n.nodeType === 3)
              .map((n) => n.textContent || '')
              .join('')
              .trim()
          : ''
        ).slice(0, 60)
        const indent = '  '.repeat(depth)
        let line = `${indent}<${tag}`
        // 关键属性（id / class / role / type / href / src 简化）
        const id = el.id ? `#${el.id}` : ''
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
          : ''
        const role = el.getAttribute('role')
        const type = el.getAttribute('type')
        const href = el.getAttribute('href')
        const src = el.getAttribute('src')
        const attrs: string[] = []
        if (id) attrs.push(id)
        if (cls) attrs.push(cls)
        if (role) attrs.push(`role=${role}`)
        if (type) attrs.push(`type=${type}`)
        if (href && href.length < 50) attrs.push(`href=${href}`)
        if (src && src.length < 50) attrs.push(`src=${src}`)
        if (attrs.length > 0) line += ' ' + attrs.join(' ')
        if (directText) line += ' > "' + directText + '"' 
        line += '>'
        if (!hasChildren) return line
        const childLines: string[] = []
        for (let i = 0; i < el.children.length && i < 10; i++) {
          const child = el.children[i]
          if (SKIP_TAGS.has(child.tagName)) continue
          const sub = buildTree(child, depth + 1)
          if (sub) childLines.push(sub)
        }
        return childLines.length > 0 ? line + '\n' + childLines.join('\n') : line
      }

      const root = body ? buildTree(body, 0) : '(empty body)'

      // 主容器计算样式摘要（body 的第一个有 children 的子元素）
      let stylesSummary: Record<string, string> | null = null
      if (includeStyles && body) {
        let mainContainer: Element | null = null
        for (let i = 0; i < body.children.length; i++) {
          const child = body.children[i]
          if (!SKIP_TAGS.has(child.tagName) && child.children.length > 0) {
            mainContainer = child
            break
          }
        }
        if (mainContainer && win) {
          const cs = win.getComputedStyle(mainContainer)
          stylesSummary = {
            tag: mainContainer.tagName.toLowerCase(),
            display: cs.display,
            flexDirection: cs.flexDirection || 'normal',
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            fontSize: cs.fontSize,
            padding: cs.padding,
            margin: cs.margin,
          }
        }
      }

      return {
        success: true,
        viewport,
        visibleText: visibleText || '(无可见文本)',
        textLength: rawText.length,
        stats,
        domTree: root,
        mainContainerStyles: stylesSummary,
        capturedAt: new Date().toISOString(),
      }
    }
    default:
      return { error: `未知前端工具：${name}` }
  }
}
