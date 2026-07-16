// =====================================================================
// Terminal 组件：基于 xterm.js 的浏览器内终端
// ---------------------------------------------------------------------
// 功能：
//   - 使用 @xterm/xterm 渲染暗色终端
//   - 用户输入命令 → webcontainer.runCommand() → 流式显示输出
//   - 历史命令（↑↓ 切换）
//   - $ 提示符
//   - 自动 fit 到容器大小
//
// 降级说明：当 webcontainer 为 null 时显示"沙箱未就绪"提示。
// =====================================================================

import { useEffect, useRef, useState } from 'react'
import { Terminal as XTermTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { WebContainerSandbox } from '@/components/WebContainerSandbox'
import { cn } from '@/lib/utils'

interface TerminalProps {
  webcontainer: WebContainerSandbox | null
  className?: string
}

/** 暗色终端主题 */
const TERM_THEME = {
  background: '#0f172a',
  foreground: '#e2e8f0',
  cursor: '#e2e8f0',
  cursorAccent: '#0f172a',
  selectionBackground: '#334155',
}

/** 提示符 */
const PROMPT = '$ '

export function Terminal({ webcontainer, className }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)

  // 命令历史（保存在 ref 中，避免组件重渲染影响）
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef<number>(-1)
  // 当前输入缓冲（用户正在输入的命令，尚未回车）
  const inputBufferRef = useRef<string>('')

  useEffect(() => {
    if (!containerRef.current) return

    // 初始化 xterm
    const term = new XTermTerminal({
      theme: TERM_THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      scrollback: 1000,
      disableStdin: false,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    setIsReady(true)

    // 写入欢迎信息
    term.writeln('\x1b[36m┌─────────────────────────────────────┐\x1b[0m')
    term.writeln('\x1b[36m│  Vibe Coding 沙箱终端 (WebContainer) │\x1b[0m')
    term.writeln('\x1b[36m└─────────────────────────────────────┘\x1b[0m')
    term.writeln('')

    // 监听窗口大小变化，自动 fit
    const handleResize = () => {
      try {
        fitAddon.fit()
      } catch {
        // ignore：容器可能尚未渲染
      }
    }
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)

    /** 清空当前输入行并重写提示符 */
    const clearCurrentLine = (): void => {
      term.write('\r\x1b[K')
      term.write(PROMPT)
    }

    /** 用新内容替换当前输入行 */
    const replaceCurrentLine = (newText: string): void => {
      clearCurrentLine()
      term.write(newText)
    }

    /** ↑ 历史上一条 */
    const handleHistoryUp = (): void => {
      if (historyRef.current.length === 0) return
      if (historyIndexRef.current > 0) {
        historyIndexRef.current--
      } else if (historyIndexRef.current === -1) {
        // 第一次按↑：从最后一条开始
        historyIndexRef.current = historyRef.current.length - 1
      }
      const cmd = historyRef.current[historyIndexRef.current] ?? ''
      inputBufferRef.current = cmd
      replaceCurrentLine(cmd)
    }

    /** ↓ 历史下一条 */
    const handleHistoryDown = (): void => {
      const history = historyRef.current
      if (history.length === 0 || historyIndexRef.current === -1) return
      if (historyIndexRef.current < history.length - 1) {
        historyIndexRef.current++
        const cmd = history[historyIndexRef.current] ?? ''
        inputBufferRef.current = cmd
        replaceCurrentLine(cmd)
      } else {
        // 到达最新之后：清空输入
        historyIndexRef.current = -1
        inputBufferRef.current = ''
        replaceCurrentLine('')
      }
    }

    /** 执行命令并输出结果 */
    const executeCommand = async (cmd: string): Promise<void> => {
      if (!webcontainer || !webcontainer.isReady) {
        term.writeln('\x1b[31m沙箱未就绪，无法执行命令\x1b[0m')
        term.write(PROMPT)
        return
      }
      try {
        const result = await webcontainer.runCommand(cmd)
        if (result.stdout) {
          term.write(result.stdout)
        }
        if (result.exitCode !== 0) {
          term.writeln(`\x1b[31m[exit ${result.exitCode}]\x1b[0m`)
        }
      } catch (err) {
        term.writeln(
          `\x1b[31m命令执行失败：${err instanceof Error ? err.message : String(err)}\x1b[0m`,
        )
      }
      term.write(PROMPT)
    }

    // 处理用户输入：xterm.js 的 onData 会把方向键等作为完整转义序列字符串回调
    term.onData((data) => {
      // 处理多字符输入（粘贴 / 转义序列）
      if (data === '\r') {
        // 回车：执行命令
        const cmd = inputBufferRef.current.trim()
        term.write('\r\n')
        inputBufferRef.current = ''
        if (cmd) {
          historyRef.current.push(cmd)
          historyIndexRef.current = -1
          void executeCommand(cmd)
        } else {
          term.write(PROMPT)
        }
        return
      }

      if (data === '\x7f') {
        // Backspace：删除最后一个字符
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1)
          term.write('\b \b')
        }
        return
      }

      if (data === '\x1b[A') {
        // ↑：历史上一条
        handleHistoryUp()
        return
      }

      if (data === '\x1b[B') {
        // ↓：历史下一条
        handleHistoryDown()
        return
      }

      if (data === '\x1b[C') {
        // →：忽略（不支持行内移动）
        return
      }

      if (data === '\x1b[D') {
        // ←：忽略
        return
      }

      if (data === '\x03') {
        // Ctrl+C：中断当前输入
        term.write('^C\r\n')
        inputBufferRef.current = ''
        historyIndexRef.current = -1
        term.write(PROMPT)
        return
      }

      if (data === '\x0c') {
        // Ctrl+L：清屏
        term.clear()
        term.write(PROMPT + inputBufferRef.current)
        return
      }

      // 可打印字符（含粘贴的多行文本）
      // 过滤掉控制字符（除 \t 外）
      const printable = data.replace(/[\x00-\x08\x0e-\x1f]/g, '')
      if (printable) {
        inputBufferRef.current += printable
        term.write(printable)
      }
    })

    // 初始提示符
    term.write(PROMPT)

    return () => {
      resizeObserver.disconnect()
      term.dispose()
      setIsReady(false)
    }
  }, [webcontainer])

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden bg-[#0f172a]',
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
          终端初始化中…
        </div>
      )}
      {isReady && webcontainer && !webcontainer.isReady && (
        <div className="absolute right-2 top-2 rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
          沙箱未就绪
        </div>
      )}
    </div>
  )
}

export default Terminal
