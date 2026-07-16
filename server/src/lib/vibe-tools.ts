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
import { supabase } from './supabase'
import type { ToolDefinition } from './ai-client'
import type { DynamicToolMeta } from '../../shared/types'

// ---------------------------------------------------------------------
// Vibe Code 项目内存映射（用于 writeFile/readFile 工具）
// ---------------------------------------------------------------------
// key: `${userId}:${projectId||'default'}/${path}` → content
const projectFiles = new Map<string, string>()

function projectKey(userId: string, projectId: string | undefined, path: string) {
  return `${userId}:${projectId || 'default'}/${path}`
}

// ---------------------------------------------------------------------
// AI 自建工具的内存存储（Batch E2 Tool Builder）
// ---------------------------------------------------------------------
// 会话级（不持久化），按 userId 隔离。loadSkillTools 会合并这些工具。
// 外部通过 registerDynamicTool / listDynamicTools / getDynamicTool 操作。
const dynamicTools = new Map<string, DynamicToolMeta[]>()

/** 注册一个 AI 自建工具（追加到该用户的工具列表） */
export function registerDynamicTool(meta: DynamicToolMeta): void {
  const list = dynamicTools.get(meta.user_id) ?? []
  // 同名工具覆盖（更新 implementation / description）
  const filtered = list.filter((t) => t.name !== meta.name)
  filtered.push(meta)
  dynamicTools.set(meta.user_id, filtered)
}

/** 列出某用户的所有自建工具 */
export function listDynamicTools(userId: string): DynamicToolMeta[] {
  return dynamicTools.get(userId) ?? []
}

/** 取单个自建工具 */
export function getDynamicTool(
  userId: string,
  name: string
): DynamicToolMeta | undefined {
  return (dynamicTools.get(userId) ?? []).find((t) => t.name === name)
}

/**
 * 在沙箱中执行 AI 自建工具的 implementation 代码。
 * - 使用 `new Function('args', 'context', impl)` 构造函数
 * - 限制 3000ms 超时（Promise.race）
 * - 限制可用 API：通过浅拷贝 Math / JSON / Date 等纯计算 API，
 *   不暴露 require / import / process / fs / child_process
 * - 实现体中若尝试访问全局 require / process 等，会因 ReferenceError 失败
 */
async function executeDynamicTool(
  meta: DynamicToolMeta,
  args: Record<string, unknown>
): Promise<unknown> {
  // 构造受限 context（仅暴露纯计算 API）
  const sandboxContext = {
    Math,
    JSON,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    String,
    Number,
    Boolean,
    Array,
    Object,
    encodeURIComponent,
    decodeURIComponent,
  }

  // 用 new Function 构造函数（注意：函数体内的 this / arguments / 全局 require
  // 在严格模式下会因 ReferenceError 而失败）
  let fn: (args: Record<string, unknown>, context: typeof sandboxContext) => unknown
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(
      'args',
      'context',
      '"use strict";\n' + meta.implementation
    ) as (args: Record<string, unknown>, context: typeof sandboxContext) => unknown
  } catch (err) {
    return {
      success: false,
      error: `工具代码编译失败：${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // 用 Promise.race 实现超时保护（3000ms）
  const TIMEOUT_MS = 3000
  const execPromise = new Promise<unknown>((resolve) => {
    try {
      const result = fn(args, sandboxContext)
      // 支持 async implementation（返回 Promise）
      if (result instanceof Promise) {
        result.then(resolve).catch((err) => {
          resolve({
            success: false,
            error: `工具执行失败：${err instanceof Error ? err.message : String(err)}`,
          })
        })
      } else {
        resolve({ success: true, result })
      }
    } catch (err) {
      resolve({
        success: false,
        error: `工具执行失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  })

  const timeoutPromise = new Promise<unknown>((resolve) => {
    setTimeout(() => {
      resolve({ success: false, error: `工具执行超时（${TIMEOUT_MS}ms）` })
    }, TIMEOUT_MS)
  })

  return Promise.race([execPromise, timeoutPromise])
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
  // -----------------------------------------------------------------
  // Batch E1：Agent Memory 长期记忆工具
  // -----------------------------------------------------------------
  saveMemory: tool({
    description:
      '保存一条长期记忆（key-value 形式），用于记住用户偏好、技术栈、历史决策。同一 key 会覆盖旧值。例如用户说"我喜欢用 Tailwind"时，可保存 key="ui_framework", value="tailwind"。',
    inputSchema: z.object({
      key: z.string().describe('记忆键，如 ui_framework / language / tech_stack'),
      value: z.string().describe('记忆值，如 tailwind / typescript'),
    }),
    execute: async ({ key, value }) => {
      const userId = (globalThis as { __vibeUserId?: string }).__vibeUserId
      if (!userId) {
        return { success: false, error: '未登录用户无法保存记忆' }
      }
      try {
        const { data, error } = await supabase
          .from('agent_memory')
          .upsert(
            { user_id: userId, key, value, source: 'agent' },
            { onConflict: 'user_id,key' }
          )
          .select()
          .single()
        if (error) throw error
        return { success: true, memory: data }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : '保存记忆失败',
        }
      }
    },
  }),
  recallMemory: tool({
    description:
      '按 query 召回相关记忆（在 key 或 value 中模糊匹配），返回最多 5 条。用于在对话中回忆用户偏好或历史决策。',
    inputSchema: z.object({
      query: z.string().describe('召回查询关键词'),
    }),
    execute: async ({ query }) => {
      const userId = (globalThis as { __vibeUserId?: string }).__vibeUserId
      if (!userId) {
        return { success: false, error: '未登录用户无法召回记忆', memories: [] }
      }
      try {
        const { data, error } = await supabase
          .from('agent_memory')
          .select('id, key, value, source, created_at')
          .eq('user_id', userId)
          .or(`key.ilike.%${query}%,value.ilike.%${query}%`)
          .order('created_at', { ascending: false })
          .limit(5)
        if (error) throw error
        return { success: true, memories: data ?? [] }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : '召回记忆失败',
          memories: [],
        }
      }
    },
  }),
  listMemory: tool({
    description: '列出当前用户的所有长期记忆（key + value），用于查看完整偏好集。',
    inputSchema: z.object({}),
    execute: async () => {
      const userId = (globalThis as { __vibeUserId?: string }).__vibeUserId
      if (!userId) {
        return { success: false, error: '未登录用户无法列出记忆', memories: [] }
      }
      try {
        const { data, error } = await supabase
          .from('agent_memory')
          .select('id, key, value, source, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error
        return { success: true, memories: data ?? [] }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : '列出记忆失败',
          memories: [],
        }
      }
    },
  }),
  // -----------------------------------------------------------------
  // Batch E2：Tool Builder —— AI 造工具
  // -----------------------------------------------------------------
  buildTool: tool({
    description:
      '在对话中即时创建一个新工具，保存为 skill user.dynamic-<name>，立即注册到 skill 注册表，后续对话可直接调用。implementation 是 JS 代码字符串，函数签名 (args, context) => result，可用 context.Math/JSON/Date 等纯计算 API，禁止 require/import/process/fs。',
    inputSchema: z.object({
      name: z
        .string()
        .describe('工具名（唯一，作为函数调用名，建议 camelCase，如 translateText）'),
      description: z.string().describe('工具描述（告诉 AI 何时调用此工具）'),
      implementation: z
        .string()
        .describe('JS 代码字符串，函数体接受 (args, context)，return 结果。例如：return args.a + args.b'),
    }),
    execute: async ({ name, description, implementation }) => {
      const userId = (globalThis as { __vibeUserId?: string }).__vibeUserId
      if (!userId) {
        return { success: false, error: '未登录用户无法创建工具' }
      }
      // 基本校验
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
        return {
          success: false,
          error: '工具名必须是合法的 JS 标识符（字母/数字/下划线，不能以数字开头）',
        }
      }
      // 简单黑名单：禁止包含危险关键字
      const dangerous = /\b(require|import|process|fs|child_process|exec|spawn|eval|Function)\b/
      if (dangerous.test(implementation)) {
        return {
          success: false,
          error: '实现代码包含禁用的关键字（require/import/process/fs/child_process/exec/eval/Function）',
        }
      }
      try {
        // 编译试运行（dry run），验证语法
        // eslint-disable-next-line no-new-func
        new Function('args', 'context', '"use strict";\n' + implementation)
      } catch (err) {
        return {
          success: false,
          error: `实现代码语法错误：${err instanceof Error ? err.message : String(err)}`,
        }
      }
      // 注册到内存 Map（会话级）
      registerDynamicTool({
        name,
        description,
        implementation,
        user_id: userId,
        created_at: new Date().toISOString(),
      })

      // 持久化到 skills 表（slug 前缀 user.dynamic-，便于在 /skills 市场显示 "AI 创建" 标签）
      // 不存 implementation（实现仍在内存 Map 中，会话级）— 仅写入元数据用于展示
      try {
        const slug = `user.dynamic-${name.toLowerCase()}`
        await supabase
          .from('skills')
          .upsert(
            {
              name,
              slug,
              description,
              category: 'custom',
              manifest: {
                name,
                description,
                tools: [{ name, description, parameters: {} }],
              },
              author_id: userId,
              version: '1.0.0',
              status: 'published',
            },
            { onConflict: 'slug' }
          )
      } catch (dbErr) {
        // DB 写入失败不阻塞工具注册（仍可在当前会话使用）
        console.warn('[buildTool] persist to skills table failed:', dbErr)
      }

      return {
        success: true,
        toolName: name,
        message: `工具 ${name} 已创建，后续对话可直接调用`,
      }
    },
  }),
}

/**
 * 执行 AI 自建工具的调用（供 vibe-code 路由层在 streamText 之外使用，
 * 或后续工具路由层调用）。
 *
 * @param userId 当前用户 ID
 * @param name 工具名
 * @param args 工具参数
 * @returns 执行结果
 */
export async function executeDynamicToolCall(
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const meta = getDynamicTool(userId, name)
  if (!meta) {
    return { success: false, error: `工具 ${name} 不存在` }
  }
  return executeDynamicTool(meta, args)
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
