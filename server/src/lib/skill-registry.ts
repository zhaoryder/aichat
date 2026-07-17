// =====================================================================
// Skill 注册表
// ---------------------------------------------------------------------
// 聚合用户已安装且启用的 skill，提供：
//   - listInstalledSkills(userId)：查询已安装 skill 列表
//   - loadSkillTools(userId)：聚合所有 enabled skill 的工具，返回 Vercel AI SDK tool() 格式
//   - loadSkillSystemPrompt(userId)：拼接所有 enabled skill 的 systemPrompt 片段
//
// 内置 skill 的工具实现：
//   - webSearch / generateImage / generateVideo / executeCode → 复用 vibe-tools.ts
//   - bash / file-io (writeFile, readFile) / memory (saveMemory, recallMemory)
//     → 仅返回 schema（不返回 execute），实际执行由前端 WebContainer 桥接（Batch D）
// =====================================================================

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { supabase } from './supabase'
import { createVibeTools, listDynamicTools } from './vibe-tools'
import type { Skill, UserSkill, SkillManifest } from '../../shared/types'

// ---------------------------------------------------------------------
// 内置工具名 → Vercel AI SDK tool 实现的映射
// ---------------------------------------------------------------------
// 所有内置工具都复用 vibe-tools.ts 的真实实现（带 execute）：
// - webSearch / generateImage / generateVideo / executeCode：联网/生成类
// - writeFile / readFile：写入/读取 Vibe 项目文件（内存映射 + 持久化）
//   即使前端 WebContainer 桥接可用，后端也必须能兜底执行，
//   避免前端未拦截 tool_call 时 AI 流中断（"html 写入失败"根因）
// - saveMemory / recallMemory / listMemory：长期记忆
// - bash：仍为 stub（前端 WebContainer 桥接，后端无法执行 shell）

/**
 * bash 工具 stub：schema + 占位 execute（前端 WebContainer 桥接）。
 * 实际由前端 WebContainer 沙箱执行并通过 tool_result 事件回传结果；
 * 后端无法执行 shell，此处 execute 仅返回占位提示，避免 Vercel AI SDK
 * 报"工具无 execute"错误（P1-8 修复）。前端拦截时会用真实结果覆盖。
 */
const bashToolStub = tool({
  description: '在浏览器内 WebContainer 沙箱中执行 bash 命令（ls / cd / mkdir / npm / git / node 等）',
  inputSchema: z.object({
    command: z.string().describe('要执行的 shell 命令'),
  }),
  execute: async () => ({
    output: 'bash 命令由前端 WebContainer 沙箱执行，后端无需重复执行',
    note: '前端已拦截此工具调用并真实执行',
  }),
})

/** saveMemory 工具：Batch E1 实现，复用 vibe-tools.ts 的真实实现（带 execute） */

/** recallMemory 工具：Batch E1 实现，复用 vibe-tools.ts 的真实实现（带 execute） */

/**
 * 构造绑定到指定用户/项目上下文的内置工具映射。
 * 使用 createVibeTools(userId, projectId) 创建闭包捕获上下文的工具实例，
 * 避免 globalThis 污染（P0-2 修复）。
 *
 * 使用 ToolSet 类型（Record<string, Tool<any, any, any>>）以兼容异构 tool 输入 schema。
 */
function createBuiltinTools(userId: string, projectId?: string): ToolSet {
  const vibeTools = createVibeTools(userId, projectId)
  return {
    webSearch: vibeTools.webSearch,
    generateImage: vibeTools.generateImage,
    generateVideo: vibeTools.generateVideo,
    executeCode: vibeTools.executeCode,
    bash: bashToolStub,
    // writeFile / readFile 复用 vibe-tools.ts 真实实现（带 execute）
    // 即使前端 WebContainer 未启用或浏览器不支持，后端也能兜底执行写入
    writeFile: vibeTools.writeFile,
    readFile: vibeTools.readFile,
    saveMemory: vibeTools.saveMemory,
    recallMemory: vibeTools.recallMemory,
    listMemory: vibeTools.listMemory,
    buildTool: vibeTools.buildTool,
  }
}

// ---------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------

/**
 * 将 manifest 中的 parameters（JSON Schema 风格）转换为 zod schema。
 * 用于自定义 skill 的工具（内置 skill 直接用预定义实现，不走此函数）。
 *
 * parameters 形如：{ query: { type: 'string', description: '...' }, ... }
 * 所有字段默认设为可选（manifest 中无 required 数组）。
 *
 * 注意：zod v4 中 ZodRawShape 的索引签名为 readonly，因此使用可变的
 * Record<string, z.ZodTypeAny> 构造 shape，再传入 z.object()。
 */
function parametersToZod(parameters: Record<string, unknown>) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, spec] of Object.entries(parameters)) {
    if (typeof spec !== 'object' || spec === null) continue
    const s = spec as { type?: string; description?: string }
    let fieldSchema: z.ZodTypeAny
    switch (s.type) {
      case 'number':
        fieldSchema = z.number()
        break
      case 'boolean':
        fieldSchema = z.boolean()
        break
      case 'string':
      default:
        fieldSchema = z.string()
        break
    }
    if (s.description) {
      fieldSchema = fieldSchema.describe(s.description)
    }
    // 自定义 skill 字段默认可选
    shape[key] = fieldSchema.optional()
  }
  return z.object(shape)
}

/**
 * 为自定义 skill 的单个工具创建 schema-only stub（无 execute）。
 * 自定义 skill 的工具实现无法在服务端安全执行，仅返回 schema。
 *
 * 返回类型为 ToolSet 的成员类型（Tool<any, any, any>）以兼容异构工具集合。
 */
function createCustomToolStub(toolDef: SkillManifest['tools'][number]): ToolSet[string] {
  return tool({
    description: toolDef.description || toolDef.name,
    inputSchema: parametersToZod(toolDef.parameters || {}),
    // 无 execute：自定义 skill 工具由前端桥接或后续版本支持
  })
}

// ---------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------

/**
 * 查询用户已安装且启用的 skill 列表（JOIN skills 表）。
 * @param userId 用户 ID
 * @returns UserSkill 数组（含 skill 详情）
 */
export async function listInstalledSkills(userId: string): Promise<UserSkill[]> {
  const { data, error } = await supabase
    .from('user_skills')
    .select(
      'user_id, skill_id, enabled, config, installed_at, skill:skills(*)',
    )
    .eq('user_id', userId)
    .eq('enabled', true)

  if (error) {
    console.error('[skill-registry] listInstalledSkills error:', error)
    return []
  }

  if (!data || data.length === 0) return []

  // 将 supabase JOIN 返回的 skill（可能是数组或对象）规范化
  return (data as Array<Record<string, unknown>>).map((row) => {
    const skillRow = row.skill
    const skill = Array.isArray(skillRow) ? (skillRow[0] as Skill) : (skillRow as Skill)
    return {
      user_id: row.user_id as string,
      skill_id: row.skill_id as string,
      enabled: row.enabled as boolean,
      config: (row.config as Record<string, unknown>) ?? {},
      installed_at: row.installed_at as string,
      skill,
    } as UserSkill
  })
}

/**
 * 聚合用户所有 enabled skill 的工具，返回 Vercel AI SDK tool() 格式。
 *
 * - 内置 skill 的工具（webSearch/generateImage/generateVideo/executeCode/saveMemory/recallMemory/listMemory）复用 vibe-tools.ts 实现（带 execute）
 * - bash/file-io 的工具为 stub（仅 schema，无 execute，前端 WebContainer 桥接）
 * - 自定义 skill 的工具为 schema-only stub
 * - 始终注入 buildTool 工具（Batch E2，AI 造工具能力）
 * - 合并 dynamicTools 中该用户自建的工具（带 execute，调用 executeDynamicToolCall）
 *
 * @param userId 用户 ID
 * @returns 工具名 → tool 实现的映射（ToolSet 格式）；若用户未安装任何 skill 则返回空对象
 */
export async function loadSkillTools(
  userId: string,
  projectId?: string,
): Promise<ToolSet> {
  const installedSkills = await listInstalledSkills(userId)
  const dynamicToolMetas = listDynamicTools(userId)

  // 若用户既未安装 skill 也未自建工具，返回空对象让路由层 fallback 到
  // createVibeTools(userId, projectId)（已包含 writeFile/readFile/webSearch/
  // generateImage/generateVideo/executeCode/saveMemory/recallMemory/listMemory/buildTool）
  if (installedSkills.length === 0 && dynamicToolMetas.length === 0) {
    return {}
  }

  const tools: ToolSet = {}
  const builtinTools = createBuiltinTools(userId, projectId)

  for (const userSkill of installedSkills) {
    const skill = userSkill.skill
    if (!skill || !skill.manifest || !Array.isArray(skill.manifest.tools)) continue

    for (const toolDef of skill.manifest.tools) {
      // 内置工具名直接使用预定义实现
      if (builtinTools[toolDef.name]) {
        tools[toolDef.name] = builtinTools[toolDef.name]
      } else {
        // 自定义 skill 工具：创建 schema-only stub
        tools[toolDef.name] = createCustomToolStub(toolDef)
      }
    }
  }

  // 始终注入 buildTool（Batch E2，AI 造工具能力）
  tools.buildTool = builtinTools.buildTool

  // 合并用户自建的动态工具（Batch E2，从内存 Map 加载，带 execute）
  for (const meta of dynamicToolMetas) {
    // 用闭包捕获 meta，创建带 execute 的工具
    tools[meta.name] = tool({
      description: meta.description,
      inputSchema: z.object({}).passthrough(),
      execute: async (args) => {
        // 动态工具的实际执行由 vibe-tools 的 executeDynamicToolCall 处理
        const { executeDynamicToolCall } = await import('./vibe-tools')
        return executeDynamicToolCall(userId, meta.name, args as Record<string, unknown>)
      },
    })
  }

  return tools
}

/**
 * 拼接用户所有 enabled skill 的 systemPrompt 片段。
 *
 * 末尾追加：
 * - 用户长期记忆摘要（Batch E1，从 agent_memory 表加载）
 * - 用户已自建工具列表（Batch E2，从 dynamicTools 内存 Map 加载）
 *
 * @param userId 用户 ID
 * @returns 拼接后的 systemPrompt 片段字符串（若无则返回空字符串）
 */
export async function loadSkillSystemPrompt(userId: string): Promise<string> {
  const installedSkills = await listInstalledSkills(userId)

  const fragments: string[] = []
  for (const userSkill of installedSkills) {
    const skill = userSkill.skill
    if (!skill) continue
    const prompt = skill.manifest?.systemPrompt
    if (prompt && typeof prompt === 'string' && prompt.trim()) {
      fragments.push(`【Skill：${skill.name}】\n${prompt.trim()}`)
    }
  }

  // 追加用户偏好记忆摘要（Batch E1）
  try {
    const { data: memories } = await supabase
      .from('agent_memory')
      .select('key, value')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (memories && memories.length > 0) {
      const memoryLines = memories
        .map((m) => `- ${(m as { key: string }).key}: ${(m as { value: string }).value}`)
        .join('\n')
      fragments.push(`## 用户偏好记忆\n${memoryLines}`)
    }
  } catch (err) {
    // agent_memory 表可能尚未创建，忽略错误
    console.warn('[skill-registry] load memory failed:', err)
  }

  // 追加用户已自建工具说明（Batch E2）
  const dynamicToolMetas = listDynamicTools(userId)
  if (dynamicToolMetas.length > 0) {
    const toolList = dynamicToolMetas
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n')
    fragments.push(`## 用户已自建工具\n${toolList}\n\n（可直接调用上述工具，工具实现已注册到 skill 注册表）`)
  }

  if (fragments.length === 0) return ''
  return '\n\n--- 已安装 Skill 能力说明 ---\n' + fragments.join('\n\n')
}
