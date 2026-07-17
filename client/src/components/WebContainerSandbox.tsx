// =====================================================================
// WebContainer 沙箱：浏览器内 Node.js + npm + git + bash 环境
// ---------------------------------------------------------------------
// 封装 StackBlitz WebContainer API，提供：
//   - boot() 异步初始化（loading 状态 + 错误降级）
//   - 全局单例（保存到 window.__webcontainer）
//   - mountFiles(tree) 挂载文件树
//   - runCommand(cmd) 执行 shell，返回 stdout + exitCode
//   - startDevServer() 启动 dev server，返回 url
//   - writeFile / readFile / listFiles / deleteFile / renameFile
//   - onError(callback) 监听 boot 失败
//   - isSupported() 检测 SharedArrayBuffer + crossOriginIsolated
//
// 降级说明：WebContainer 不可用时（如旧浏览器 / 未配置 COOP/COEP headers），
// 调用方需回退到 srcDoc + Node vm 沙箱方案。
// =====================================================================

import { WebContainer, type FileSystemTree } from '@webcontainer/api'

// ---------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------

/** 沙箱命令执行结果 */
export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** 错误回调类型 */
type ErrorCallback = (error: Error) => void

/** 全局 window 扩展（用于保存单例引用） */
declare global {
  interface Window {
    __webcontainer?: WebContainerSandbox
  }
}

/** 初始项目模板：package.json + index.html + src/index.js */
const INITIAL_PROJECT_TREE: FileSystemTree = {
  'package.json': {
    file: {
      contents: JSON.stringify(
        {
          name: 'vibe-project',
          type: 'module',
          version: '1.0.0',
          scripts: {
            dev: 'vite',
          },
        },
        null,
        2,
      ),
    },
  },
  'index.html': {
    file: {
      contents:
        '<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="/src/index.js"></script></body></html>',
    },
  },
  src: {
    directory: {
      'index.js': {
        file: {
          contents: 'console.log("hello")\n',
        },
      },
    },
  },
}

// ---------------------------------------------------------------------
// WebContainerSandbox 类
// ---------------------------------------------------------------------

export class WebContainerSandbox {
  /** WebContainer 实例（boot 后填充） */
  private instance: WebContainer | null = null
  /** boot 状态：idle / booting / ready / error */
  private bootStatus: 'idle' | 'booting' | 'ready' | 'error' = 'idle'
  /** 错误信息（boot 失败时填充） */
  private bootError: Error | null = null
  /** 错误回调列表 */
  private errorCallbacks: ErrorCallback[] = []
  /** dev server 进程（startDevServer 启动后保存引用，便于后续 kill） */
  private devProcess: { kill: () => void } | null = null
  /** 当前 dev server URL */
  private _devServerUrl: string | null = null
  /** server-ready 事件监听器卸载函数 */
  private unsubscribeServerReady: (() => void) | null = null

  /** 获取当前 dev server URL */
  get devServerUrl(): string | null {
    return this._devServerUrl
  }

  /** 获取 boot 状态 */
  get status(): 'idle' | 'booting' | 'ready' | 'error' {
    return this.bootStatus
  }

  /** 获取 boot 错误信息 */
  get error(): Error | null {
    return this.bootError
  }

  /** 是否已就绪 */
  get isReady(): boolean {
    return this.bootStatus === 'ready' && this.instance !== null
  }

  /** 获取内部 WebContainer 实例（供全局单例复用：另一个 WebContainerSandbox 引用同一实例） */
  getWebContainer(): WebContainer | null {
    return this.instance
  }

  /** boot Promise（用于并发去重：避免同一 sandbox 被并发 boot 多次） */
  private bootPromise: Promise<void> | null = null

  // -------------------------------------------------------------------
  // 静态检测：浏览器是否支持 WebContainer
  // -------------------------------------------------------------------

  /**
   * 检测浏览器是否满足 WebContainer 运行要求：
   *   1. SharedArrayBuffer 可用
   *   2. crossOriginIsolated 为 true（需 COOP/COEP headers）
   */
  static isSupported(): boolean {
    if (typeof window === 'undefined') return false
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined'
    const isCrossOriginIsolated =
      typeof window.crossOriginIsolated === 'boolean'
        ? window.crossOriginIsolated
        : false
    return hasSharedArrayBuffer && isCrossOriginIsolated
  }

  // -------------------------------------------------------------------
  // boot：异步初始化 WebContainer
  // -------------------------------------------------------------------

  /**
   * 启动 WebContainer 实例。重复调用幂等：
   *   - 已 ready：直接返回
   *   - 已 booting：复用同一个 Promise（避免 React StrictMode 双挂载等场景下并发 boot）
   *   - error/idle：尝试重新 boot
   *
   * 关键修复：每个浏览器标签页只允许一个 WebContainer 实例。当 StrictMode 双挂载
   * 或页面来回切换导致 cleanup 提前触发时，新 sandbox 会复用全局单例的 instance，
   * 避免 "Only a single WebContainer instance can be booted" 错误。
   */
  async boot(): Promise<void> {
    if (this.bootStatus === 'ready') return

    // 并发去重：booting 状态下复用同一 Promise，避免并发 boot
    if (this.bootStatus === 'booting' && this.bootPromise) {
      return this.bootPromise
    }

    this.bootPromise = this._doBoot()
    return this.bootPromise
  }

  /**
   * 实际执行 boot 的私有方法。包含全局复用、环境检测、错误恢复逻辑。
   */
  private async _doBoot(): Promise<void> {
    this.bootStatus = 'booting'

    // 全局复用：若 window 上已有 ready 的单例（且不是 this），直接复用其 instance
    // 避免在 StrictMode 双挂载 / 页面来回切换场景下重复 boot
    if (
      typeof window !== 'undefined' &&
      window.__webcontainer &&
      window.__webcontainer !== this &&
      window.__webcontainer.isReady
    ) {
      this.instance = window.__webcontainer.getWebContainer()
      this._devServerUrl = window.__webcontainer.devServerUrl
      this.bootError = null
      this.bootStatus = 'ready'
      return
    }

    // 环境检测：不支持则直接降级
    if (!WebContainerSandbox.isSupported()) {
      const err = new Error(
        '当前浏览器不支持 WebContainer（需 SharedArrayBuffer + crossOriginIsolated）。请确保服务端配置了 COOP/COEP headers。',
      )
      this.bootError = err
      this.bootStatus = 'error'
      this.notifyError(err)
      return
    }

    try {
      // boot WebContainer（使用默认 COEP=require-corp）
      this.instance = await WebContainer.boot()

      // 注册错误监听
      this.instance.on('error', ({ message }) => {
        const err = new Error(message)
        this.notifyError(err)
      })

      // 挂载初始项目模板
      await this.instance.mount(INITIAL_PROJECT_TREE)

      // 监听 server-ready 事件（dev server 启动后填充 URL）
      this.unsubscribeServerReady = this.instance.on(
        'server-ready',
        (_port, url) => {
          this._devServerUrl = url
        },
      )

      this.bootStatus = 'ready'

      // 全局注册：把 this 暴露到 window（首次成功 boot 的实例成为全局单例）
      if (typeof window !== 'undefined' && !window.__webcontainer) {
        window.__webcontainer = this
      }
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err) || 'WebContainer boot 失败')

      // 错误恢复：若错误是 "Only a single WebContainer instance can be booted"
      // 且 window 上有 ready 的单例可复用，则切换到复用模式（不报错）
      if (
        error.message.includes('Only a single WebContainer instance') &&
        typeof window !== 'undefined' &&
        window.__webcontainer &&
        window.__webcontainer !== this &&
        window.__webcontainer.isReady
      ) {
        this.instance = window.__webcontainer.getWebContainer()
        this._devServerUrl = window.__webcontainer.devServerUrl
        this.bootError = null
        this.bootStatus = 'ready'
        return
      }

      this.bootError = error
      this.bootStatus = 'error'
      this.notifyError(error)
    }
  }

  // -------------------------------------------------------------------
  // mountFiles：挂载文件树
  // -------------------------------------------------------------------

  /**
   * 挂载文件树到 WebContainer 根目录。
   * 注意：mount 会合并到现有文件系统（不会清空）。
   */
  async mountFiles(tree: FileSystemTree): Promise<void> {
    if (!this.instance) throw new Error('WebContainer 未初始化')
    await this.instance.mount(tree)
  }

  // -------------------------------------------------------------------
  // runCommand：执行 shell 命令
  // -------------------------------------------------------------------

  /**
   * 执行 shell 命令（通过 bash -c），返回 stdout/stderr/exitCode。
   * 命令输出会被完整收集（适合工具调用，非交互式）。
   */
  async runCommand(cmd: string): Promise<CommandResult> {
    if (!this.instance) throw new Error('WebContainer 未初始化')

    const process = await this.instance.spawn('bash', ['-c', cmd])

    // 收集 stdout/stderr（WebContainer 的 output 流合并了 stdout 和 stderr）
    let stdout = ''
    let stderr = ''

    // 读取 output 流（ReadableStream<string>）
    const reader = process.output.getReader()
    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      if (result.value) {
        stdout += result.value
      }
    }

    // 等待进程退出，获取 exit code
    const exitCode = await process.exit.catch(() => 1)

    return { stdout, stderr, exitCode }
  }

  // -------------------------------------------------------------------
  // startDevServer：启动 npm run dev
  // -------------------------------------------------------------------

  /**
   * 启动 `npm run dev` dev server。
   * 成功后返回 dev server URL（由 server-ready 事件提供）。
   * 注意：dev server 是长驻进程，会持续运行直到 teardown 或 kill。
   */
  async startDevServer(): Promise<string> {
    if (!this.instance) throw new Error('WebContainer 未初始化')

    // 若已有 dev server 在运行，直接返回 URL
    if (this._devServerUrl) return this._devServerUrl

    // 启动 npm run dev（不 await exit，因为它是长驻进程）
    const process = await this.instance.spawn('npm', ['run', 'dev'])

    // 保存引用，便于后续 kill
    this.devProcess = {
      kill: () => {
        try {
          process.kill()
        } catch {
          // ignore：进程可能已退出
        }
      },
    }

    // 等待 server-ready 事件填充 URL（最多等待 30 秒）
    const timeoutMs = 30000
    const start = Date.now()
    while (!this._devServerUrl && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      // 若进程已退出且无 URL，说明启动失败
      try {
        // 检查进程是否仍在运行（不 await exit，避免阻塞）
        // 用 race 检测：若 exit 先 resolve，说明进程已退出
        const exitRace = await Promise.race([
          process.exit.then((code) => code),
          new Promise<'timeout'>((resolve) =>
            setTimeout(() => resolve('timeout'), 200),
          ),
        ])
        if (exitRace !== 'timeout') {
          // 进程已退出，但 URL 可能仍由 server-ready 事件触发
          break
        }
      } catch {
        break
      }
    }

    if (!this._devServerUrl) {
      throw new Error('dev server 启动超时（30s 未收到 server-ready 事件）')
    }

    return this._devServerUrl
  }

  // -------------------------------------------------------------------
  // 文件操作
  // -------------------------------------------------------------------

  /** 写入文件 */
  async writeFile(path: string, content: string): Promise<void> {
    if (!this.instance) throw new Error('WebContainer 未初始化')
    await this.instance.fs.writeFile(path, content)
  }

  /** 读取文件内容（字符串） */
  async readFile(path: string): Promise<string> {
    if (!this.instance) throw new Error('WebContainer 未初始化')
    return await this.instance.fs.readFile(path, 'utf8')
  }

  /** 列出目录下的文件与子目录 */
  async listFiles(path: string = '.'): Promise<string[]> {
    if (!this.instance) throw new Error('WebContainer 未初始化')
    const entries = await this.instance.fs.readdir(path, {
      withFileTypes: true,
    })
    return entries.map((e) => e.name)
  }

  /**
   * 递归读取目录，返回文件路径数组（相对路径）。
   * 用于 FileTree 组件渲染完整文件树。
   */
  async listFilesRecursive(dir: string = '.'): Promise<
    Array<{ path: string; type: 'file' | 'directory' }>
  > {
    if (!this.instance) throw new Error('WebContainer 未初始化')
    const result: Array<{ path: string; type: 'file' | 'directory' }> = []
    await this._walkDir(dir, result)
    return result
  }

  /** 递归遍历目录（内部辅助） */
  private async _walkDir(
    dir: string,
    result: Array<{ path: string; type: 'file' | 'directory' }>,
  ): Promise<void> {
    if (!this.instance) return
    const entries = await this.instance.fs.readdir(dir, {
      withFileTypes: true,
    })
    for (const entry of entries) {
      // 跳过 node_modules / .git 等大目录，避免遍历过深
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const fullPath =
        dir === '.' ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        result.push({ path: fullPath, type: 'directory' })
        await this._walkDir(fullPath, result)
      } else if (entry.isFile()) {
        result.push({ path: fullPath, type: 'file' })
      }
    }
  }

  /** 删除文件或目录 */
  async deleteFile(path: string): Promise<void> {
    if (!this.instance) throw new Error('WebContainer 未初始化')
    await this.instance.fs.rm(path, { force: true, recursive: true })
  }

  /** 重命名 / 移动文件 */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    if (!this.instance) throw new Error('WebContainer 未初始化')
    await this.instance.fs.rename(oldPath, newPath)
  }

  /** 创建目录 */
  async mkdir(path: string): Promise<void> {
    if (!this.instance) throw new Error('WebContainer 未初始化')
    await this.instance.fs.mkdir(path, { recursive: true })
  }

  // -------------------------------------------------------------------
  // onError：注册错误回调
  // -------------------------------------------------------------------

  /**
   * 注册错误回调。当 boot 失败或运行时出错时调用。
   * 返回一个卸载函数，用于取消注册。
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback)
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback)
    }
  }

  /** 通知所有错误回调 */
  private notifyError(error: Error): void {
    for (const cb of this.errorCallbacks) {
      try {
        cb(error)
      } catch {
        // ignore：回调自身报错不影响其他回调
      }
    }
  }

  // -------------------------------------------------------------------
  // teardown：销毁实例
  // -------------------------------------------------------------------

  /** 销毁 WebContainer 实例，释放资源 */
  teardown(): void {
    if (this.unsubscribeServerReady) {
      this.unsubscribeServerReady()
      this.unsubscribeServerReady = null
    }
    if (this.devProcess) {
      this.devProcess.kill()
      this.devProcess = null
    }
    if (this.instance) {
      try {
        this.instance.teardown()
      } catch {
        // ignore
      }
      this.instance = null
    }
    this._devServerUrl = null
    this.bootPromise = null
    this.bootStatus = 'idle'
  }
}

// ---------------------------------------------------------------------
// 全局单例辅助：获取 / 创建全局 WebContainerSandbox 实例
// ---------------------------------------------------------------------

/**
 * 获取全局 WebContainerSandbox 单例。
 * 若不存在则创建（但不自动 boot，boot 由调用方触发）。
 */
export function getGlobalSandbox(): WebContainerSandbox {
  if (typeof window === 'undefined') {
    // SSR 场景：返回临时实例（不会真正 boot）
    return new WebContainerSandbox()
  }
  if (!window.__webcontainer) {
    window.__webcontainer = new WebContainerSandbox()
  }
  return window.__webcontainer
}

export default WebContainerSandbox
