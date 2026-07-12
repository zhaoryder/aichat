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

// =====================================================================
// Vibe Code API
// =====================================================================

/** vibe_projects 表：用户用自然语言生成的可运行 HTML 项目 */
export interface VibeProject {
  id: string
  user_id: string
  title: string
  code: string
  description: string
  prompt: string
  is_public: boolean
  likes: number | null
  created_at: string
}

/** 保存 vibe 项目 */
export async function saveVibeProject(data: {
  title: string
  code: string
  description?: string
  prompt?: string
  is_public?: boolean
}): Promise<{ project: VibeProject }> {
  return apiFetch<{ project: VibeProject }>('/vibe-code/save', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** 列出当前用户的 vibe 项目 */
export async function listVibeProjects(): Promise<{ projects: VibeProject[] }> {
  return apiFetch<{ projects: VibeProject[] }>('/vibe-code/projects')
}

/** 获取单个 vibe 项目详情 */
export async function getVibeProject(id: string): Promise<{ project: VibeProject }> {
  return apiFetch<{ project: VibeProject }>(`/vibe-code/projects/${id}`)
}

/** 获取公开广场的 vibe 项目 */
export async function exploreVibeProjects(): Promise<{ projects: VibeProject[] }> {
  return apiFetch<{ projects: VibeProject[] }>('/vibe-code/explore')
}

/** SSE 流式回调（generate 与 fix 共用） */
export interface VibeStreamCallbacks {
  onToken: (token: string) => void
  onDone: (code: string) => void
  onError: (err: string) => void
  signal?: AbortSignal
}

/**
 * 通用 vibe SSE 消费：POST 到指定端点，解析 token/done/error 事件。
 * - token 事件：{ token: string }
 * - done 事件：{ code: string }
 * - error 事件：{ error: string }
 */
async function consumeVibeSSE(
  path: string,
  body: unknown,
  callbacks: VibeStreamCallbacks,
): Promise<void> {
  const response = await apiStream(path, body, { signal: callbacks.signal })
  if (!response.body) {
    callbacks.onError('未收到响应流')
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  try {
    while (true) {
      if (callbacks.signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          let data: { token?: string; code?: string; error?: string }
          try {
            data = JSON.parse(line.slice(6))
          } catch {
            continue
          }
          if (currentEvent === 'token' && data.token) {
            callbacks.onToken(data.token)
          } else if (currentEvent === 'done' && typeof data.code === 'string') {
            callbacks.onDone(data.code)
            return
          } else if (currentEvent === 'error') {
            callbacks.onError(data.error || '生成失败')
            return
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return
    }
    callbacks.onError(err instanceof Error ? err.message : '流式请求失败')
  }
}

/** SSE 流式生成代码（POST /vibe-code/generate） */
export async function streamVibeCode(
  prompt: string,
  callbacks: VibeStreamCallbacks,
): Promise<void> {
  return consumeVibeSSE('/vibe-code/generate', { prompt }, callbacks)
}

/** SSE 流式修复代码（POST /vibe-code/fix） */
export async function streamVibeFix(
  code: string,
  error: string,
  callbacks: VibeStreamCallbacks,
): Promise<void> {
  return consumeVibeSSE('/vibe-code/fix', { code, error }, callbacks)
}
