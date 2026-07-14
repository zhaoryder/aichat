// =====================================================================
// 对话工具集（轻度 Agent）
// ---------------------------------------------------------------------
// 普通对话中可用的工具：webSearch、generateImage、generateVideo
// 使用 OpenAI 兼容的 function calling 协议（ToolDefinition 格式），
// 与 ai-client.ts 的 chatWithTools 函数兼容。
// =====================================================================

import { tool } from 'ai'
import { z } from 'zod'
import * as vm from 'node:vm'
import { generateImage as aiGenerateImage, submitVideoTask } from './ai-client'
import type { ToolDefinition } from './ai-client'

// ---------------------------------------------------------------------
// Vibe Code 项目内存映射（用于 writeFile/readFile 工具）
// ---------------------------------------------------------------------
// key: `${userId}:${projectId||'default'}/${path}` → content
const projectFiles = new Map<string, string>()

function projectKey(userId: string, projectId: string | undefined, path: string) {
  return `${userId}:${projectId || 'default'}/${path}`
}

// ---------------------------------------------------------------------
// Vercel AI SDK 格式工具集（spec §6.1）
// ---------------------------------------------------------------------
// 用于 POST /api/vibe-code/stream 端点的 streamText 调用

export const vibeCodeTools = {
  writeFile: tool({
    description: '写入文件到当前 Vibe 项目（内存映射，支持多文件项目）',
    inputSchema: z.object({
      path: z.string().describe('文件相对路径，如 index.html / styles.css / app.js'),
      content: z.string().describe('文件完整内容'),
    }),
    execute: async ({ path, content }) => {
      const userId = (globalThis as { __vibeUserId?: string }).__vibeUserId || 'anon'
      const projectId = (globalThis as { __vibeProjectId?: string }).__vibeProjectId
      const key = projectKey(userId, projectId, path)
      projectFiles.set(key, content)
      return { success: true, path, size: content.length }
    },
  }),
  readFile: tool({
    description: '读取当前 Vibe 项目的文件内容',
    inputSchema: z.object({ path: z.string().describe('文件相对路径') }),
    execute: async ({ path }) => {
      const userId = (globalThis as { __vibeUserId?: string }).__vibeUserId || 'anon'
      const projectId = (globalThis as { __vibeProjectId?: string }).__vibeProjectId
      const key = projectKey(userId, projectId, path)
      const content = projectFiles.get(key)
      if (!content) return { success: false, error: `文件不存在：${path}` }
      return { success: true, path, content }
    },
  }),
  executeCode: tool({
    description: '在沙箱中执行 JavaScript 代码（仅限纯计算，无 DOM/网络访问）',
    inputSchema: z.object({ code: z.string().describe('要执行的 JS 代码') }),
    execute: async ({ code }) => {
      // 使用 Node 内置 vm 模块创建沙箱上下文（spec §6.1 + checklist 要求 vm2|isolated-vm|new VM|runInContext）
      const sandbox: { console: { log: (...args: unknown[]) => void }; Math: typeof Math; Date: typeof Date; JSON: typeof JSON; output: string } = {
        console: {
          log: (...args: unknown[]) => {
            sandbox.output += args.join(' ') + '\n'
          },
        },
        Math,
        Date,
        JSON,
        output: '',
      }
      try {
        const context = vm.createContext(sandbox)
        const script = new vm.Script(code)
        script.runInContext(context, { timeout: 3000 })
        return { success: true, result: sandbox.output || '(无输出)' }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : '代码执行失败',
        }
      }
    },
  }),
  webSearch: tool({
    description: '搜索互联网获取实时信息（新闻、天气、事实等）',
    inputSchema: z.object({ query: z.string().describe('搜索关键词') }),
    execute: async ({ query }) => {
      const results = await webSearch(query)
      return { results }
    },
  }),
  generateImage: tool({
    description: '根据文字描述生成图片',
    inputSchema: z.object({
      prompt: z.string().describe('图片描述（中英文均可）'),
    }),
    execute: async ({ prompt }) => {
      const url = await aiGenerateImage(prompt)
      return { url, prompt }
    },
  }),
  generateVideo: tool({
    description: '根据文字描述生成短视频（5或10秒）',
    inputSchema: z.object({
      prompt: z.string().describe('视频描述'),
      duration: z.number().optional().describe('视频时长（秒），可选 5 或 10'),
    }),
    execute: async ({ prompt, duration }) => {
      const dur = duration === 10 ? 10 : 5
      const taskId = await submitVideoTask(prompt, { duration: dur })
      return { taskId, prompt, duration: dur }
    },
  }),
}

// 轻度 Agent 工具集（普通对话用，无文件操作、无代码执行）
export const chatTools = {
  webSearch: vibeCodeTools.webSearch,
  generateImage: vibeCodeTools.generateImage,
  generateVideo: vibeCodeTools.generateVideo,
}

/** 设置当前请求的 Vibe 用户/项目上下文（路由层调用） */
export function setVibeContext(userId: string, projectId?: string) {
  ;(globalThis as { __vibeUserId?: string }).__vibeUserId = userId
  ;(globalThis as { __vibeProjectId?: string }).__vibeProjectId = projectId
}

/** 工具定义列表（传给 chatWithTools 的 tools 参数，OpenAI 兼容格式） */
export const chatToolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'webSearch',
      description: '搜索互联网获取实时信息。当用户询问最新新闻、天气、事实查询等需要联网的内容时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateImage',
      description: '根据文字描述生成图片。当用户要求画图、生成图片时使用。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '图片描述（中英文均可）' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateVideo',
      description: '根据文字描述生成短视频（5或10秒）。当用户要求生成视频、动画时使用。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '视频描述' },
          duration: { type: 'number', description: '视频时长（秒），可选 5 或 10', enum: [5, 10] },
        },
        required: ['prompt'],
      },
    },
  },
]

/** 追加到 systemPrompt 末尾的工具能力说明 */
export const chatToolsSystemPromptSuffix = `

你可以使用以下工具来增强回复能力：
- webSearch：搜索互联网获取实时信息（新闻、天气、事实等）
- generateImage：根据文字描述生成图片
- generateVideo：根据文字描述生成短视频

当用户的请求需要这些能力时（如"画一只猫"、"搜一下今天的新闻"、"生成一个视频"），主动调用对应工具。对于普通对话，直接回复即可，无需调用工具。`

/**
 * 执行工具调用
 * @param name 工具名称
 * @param args 工具参数（JSON 字符串或已解析对象）
 * @returns 工具执行结果（可序列化为 JSON）
 */
export async function executeChatTool(
  name: string,
  args: string | Record<string, unknown>
): Promise<{ success: boolean; result: unknown; error?: string }> {
  const params = typeof args === 'string' ? JSON.parse(args || '{}') : args

  try {
    switch (name) {
      case 'webSearch': {
        const query = String(params.query || '').trim()
        if (!query) return { success: false, result: null, error: '缺少搜索关键词' }
        const results = await webSearch(query)
        return { success: true, result: results }
      }
      case 'generateImage': {
        const prompt = String(params.prompt || '').trim()
        if (!prompt) return { success: false, result: null, error: '缺少图片描述' }
        const url = await aiGenerateImage(prompt)
        return { success: true, result: { url, prompt } }
      }
      case 'generateVideo': {
        const prompt = String(params.prompt || '').trim()
        if (!prompt) return { success: false, result: null, error: '缺少视频描述' }
        const duration = params.duration === 10 ? 10 : 5
        const taskId = await submitVideoTask(prompt, { duration })
        return { success: true, result: { taskId, prompt, duration } }
      }
      default:
        return { success: false, result: null, error: `未知工具：${name}` }
    }
  } catch (err) {
    return {
      success: false,
      result: null,
      error: err instanceof Error ? err.message : '工具执行失败',
    }
  }
}

/**
 * 联网搜索（使用 DuckDuckGo Instant Answer API）
 * 返回最多 5 条搜索结果摘要
 */
async function webSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`

  const response = await fetch(ddgUrl, {
    headers: { 'User-Agent': 'aichat/3.0' },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    return [{ title: '搜索服务暂时不可用', url: '', snippet: `请稍后重试或直接搜索：${query}` }]
  }

  const data = (await response.json()) as {
    AbstractText?: string
    AbstractURL?: string
    Heading?: string
    RelatedTopics?: Array<{
      Text?: string
      FirstURL?: string
      Topics?: Array<{ Text?: string; FirstURL?: string }>
    }>
  }

  const results: Array<{ title: string; url: string; snippet: string }> = []

  // 摘要结果
  if (data.AbstractText) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL || '',
      snippet: data.AbstractText.slice(0, 200),
    })
  }

  // 相关主题
  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics) {
      if (results.length >= 5) break
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
          url: topic.FirstURL,
          snippet: topic.Text.slice(0, 200),
        })
      } else if (topic.Topics) {
        for (const sub of topic.Topics) {
          if (results.length >= 5) break
          if (sub.Text && sub.FirstURL) {
            results.push({
              title: sub.Text.split(' - ')[0] || sub.Text.slice(0, 50),
              url: sub.FirstURL,
              snippet: sub.Text.slice(0, 200),
            })
          }
        }
      }
    }
  }

  if (results.length === 0) {
    return [{ title: '未找到相关结果', url: '', snippet: `尝试搜索：https://duckduckgo.com/?q=${encodeURIComponent(query)}` }]
  }

  return results
}
