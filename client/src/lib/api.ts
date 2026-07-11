import { supabase } from '@/lib/supabase'

// API 基础地址：优先用环境变量，否则用相对路径走 vite 代理
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

/** 从当前 Supabase 会话获取 access_token */
async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** 拼接完整 API 地址 */
function buildUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${normalized}`
}

/**
 * 统一 API 请求封装。
 * - 自动注入 Authorization: Bearer <access_token>
 * - 默认 Content-Type: application/json
 * - 统一错误处理：非 2xx 状态码时抛出带后端 message 的 Error
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(buildUrl(path), { ...options, headers })

  // 204 No Content 等无内容响应
  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' &&
        (('error' in data && typeof data.error === 'string' && data.error) ||
         ('message' in data && typeof data.message === 'string' && data.message))
      ) ||
      `请求失败 (${res.status})`
    throw new Error(message)
  }

  return data as T
}

/**
 * SSE 流式请求：返回原始 Response，由调用方自行读取 reader。
 * - POST application/json
 * - 自动注入 Authorization
 */
export async function apiStream(
  path: string,
  body: unknown,
  /** 可选 AbortSignal，用于取消流式请求；旧调用方不传也兼容 */
  init?: { signal?: AbortSignal },
): Promise<Response> {
  const token = await getAccessToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: init?.signal,
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    const message =
      (errData && typeof errData === 'object' &&
        (('error' in errData && typeof errData.error === 'string' && errData.error) ||
         ('message' in errData && typeof errData.message === 'string' && errData.message))
      ) ||
      `流式请求失败 (${res.status})`
    throw new Error(message)
  }

  return res
}
