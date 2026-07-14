// Cloudflare Pages Function 中间件：代理所有 /api/* 请求到 Railway 后端
// 解决 GFW 对 *.up.railway.app 的 DNS 污染问题
// Cloudflare Pages 在海外执行，可直连 Railway 后端
//
// 关键点：
// 1. 支持 SSE 流式响应（text/event-stream）—— 直接传递 ReadableStream
// 2. 支持 CORS 预检（OPTIONS）
// 3. 先读取请求体再转发（避免 ReadableStream 传递问题）
// 4. 过滤掉 host/origin 等 host 相关 headers（避免后端拒绝）

const BACKEND_URL = 'https://aichat-production-0db9.up.railway.app'

interface Env {}

// 不应转发给后端的 headers（与 host/连接/CDN 相关）
const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'origin',
  'referer',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'cf-worker',
  'x-forwarded-proto',
  'x-forwarded-for',
  'x-real-ip',
  'cdn-loop',
  'true-client-ip',
])

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context
  const url = new URL(request.url)

  // CORS 预检直接放行
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // 保持完整路径（含 /api/ 前缀）转发到后端
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`

  // 构造转发 headers：过滤掉 hop-by-hop 和 host 相关 headers
  const forwardHeaders = new Headers()
  for (const [key, value] of request.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value)
    }
  }

  // 对于有 body 的请求，先读取为字符串再传递（避免 ReadableStream 传递问题）
  let body: string | undefined
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await request.text()
  }

  // 构造转发请求
  const proxyReq = new Request(backendUrl, {
    method: request.method,
    headers: forwardHeaders,
    body,
  })

  try {
    const response = await fetch(proxyReq, {
      // 对 SSE 流式响应禁用缓存，避免缓冲
      cf: { cacheTtl: 0, cacheEverything: false },
    })

    // 直接传递 response.body（ReadableStream），保持流式
    const newHeaders = new Headers(response.headers)
    newHeaders.set('Access-Control-Allow-Origin', '*')
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    // 对 SSE 响应确保不缓冲
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      newHeaders.set('Cache-Control', 'no-cache, no-transform')
      newHeaders.set('X-Accel-Buffering', 'no')
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: '后端连接失败：' + (err instanceof Error ? err.message : 'unknown'),
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
}
