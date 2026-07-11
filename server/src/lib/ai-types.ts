// =====================================================================
// AI 客户端公共类型与错误类
// ---------------------------------------------------------------------
// 这里集中放置 chatCompletion 相关的自定义错误类。
// ChatMessage 接口已迁移至 @shared/types，本文件仅保留错误类。
// =====================================================================

/**
 * AI 请求基础错误：所有自定义 AI 错误的父类。
 * 包含可读的 error name，便于 API Route 层 try/catch 时区分。
 */
export class AIRequestError extends Error {
  /** HTTP 状态码（网络错误等无状态时为 undefined） */
  readonly status?: number
  /** 原始错误对象（用于调试） */
  readonly cause?: unknown

  constructor(message: string, opts?: { status?: number; cause?: unknown }) {
    super(message)
    this.name = 'AIRequestError'
    if (opts) {
      this.status = opts.status
      this.cause = opts.cause
    }
  }
}

/**
 * 请求超时错误（默认 30s 触发）
 */
export class AIRequestTimeoutError extends AIRequestError {
  /** 超时阈值（毫秒），便于上层日志记录 */
  readonly timeoutMs: number

  constructor(
    message: string,
    opts?: { timeoutMs?: number; cause?: unknown }
  ) {
    super(message, { cause: opts?.cause })
    this.name = 'AIRequestTimeoutError'
    this.timeoutMs = opts?.timeoutMs ?? 0
  }
}

/**
 * 限流错误（HTTP 429）
 * 携带 retryAfter 提示，单位为秒（来自响应头 Retry-After）。
 */
export class AIRateLimitError extends AIRequestError {
  /** 建议的重试等待时间（秒），可能为 undefined（服务端未返回 Retry-After） */
  readonly retryAfter?: number

  constructor(
    message: string,
    opts?: { retryAfter?: number; cause?: unknown }
  ) {
    super(message, { status: 429, cause: opts?.cause })
    this.name = 'AIRateLimitError'
    if (opts) {
      this.retryAfter = opts.retryAfter
    }
  }
}
