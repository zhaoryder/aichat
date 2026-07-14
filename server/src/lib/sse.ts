// =====================================================================
// SSE（Server-Sent Events）工具函数
// ---------------------------------------------------------------------
// 提供 Express 场景下的 SSE 流式推送能力：
//   - setSSEHeaders: 设置 SSE 必需的响应头
//   - sendEvent: 发送一个标准 SSE 事件
//   - sseStream: 将 AsyncGenerator 的每个 chunk 作为 token 事件流式推送
// =====================================================================

import { Response } from 'express'

/** 设置 SSE 必需的响应头 */
export function setSSEHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
}

/** 发送一个 SSE 事件（event: xxx\ndata: JSON\n\n） */
export function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  // 确保 SSE 数据立即 flush，避免反向代理/压缩中间件缓冲导致延迟
  const r = res as Response & { flush?: () => void }
  if (typeof r.flush === 'function') {
    r.flush()
  } else {
    res.flushHeaders()
  }
}

/**
 * 将 AsyncGenerator 的每个 chunk 作为 token 事件流式推送。
 *
 * - 每个 chunk 通过 'token' 事件发送（data: { c: chunk }）
 * - 流结束后发送 'done' 事件
 * - 出错时发送 'error' 事件
 * - 无论成功或失败，最终关闭响应
 *
 * @param res Express Response 对象
 * @param gen 产出文本增量的异步生成器
 * @param options.onStart 流开始前的回调
 * @param options.onDone 流结束后的回调（可异步），传入完整文本
 */
export async function sseStream(
  res: Response,
  gen: AsyncGenerator<string>,
  options?: {
    onStart?: () => void
    onDone?: (fullText: string) => Promise<void> | void
  }
): Promise<void> {
  setSSEHeaders(res)
  options?.onStart?.()

  let fullText = ''
  try {
    for await (const chunk of gen) {
      fullText += chunk
      sendEvent(res, 'token', { c: chunk })
    }
    await options?.onDone?.(fullText)
    sendEvent(res, 'done', {})
  } catch (err) {
    sendEvent(res, 'error', {
      message: err instanceof Error ? err.message : 'AI 回复失败',
    })
  } finally {
    res.end()
  }
}
