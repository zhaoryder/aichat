// =====================================================================
// 自定义智能体 API
// ---------------------------------------------------------------------
// GET    /api/agents          列出官方 + 公开自定义智能体（公开可读）
// GET    /api/agents/:id      获取单个智能体详情
// POST   /api/agents/create   创建自定义智能体
// PUT    /api/agents/:id      更新自定义智能体（仅创建者）
// DELETE /api/agents/:id      删除自定义智能体（仅创建者）
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { agents, getAgentById, type AgentConfig } from '../../shared/agents'
import type { CustomAgent } from '../../shared/types'
import {
  createCustomAgent,
  deleteCustomAgent,
  getCustomAgentById,
  listPublicCustomAgents,
  updateCustomAgent,
} from '../lib/queries'
import { polishAgentPrompt } from '../lib/ai-client'

export const agentsRouter = Router()

// ---------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------

/** 将 CustomAgent 转换为统一的 AgentConfig 格式 */
function customAgentToConfig(custom: CustomAgent): AgentConfig {
  return {
    id: custom.id,
    name: custom.name,
    era: '自定义',
    title: custom.personality || '自定义智能体',
    tagline: custom.description || '用户创建的智能体',
    avatarGradient: custom.avatar_gradient,
    systemPrompt: custom.system_prompt,
    topics: [],
    card: {
      rarity: '普通',
      skills: [],
      combo: '自定义智能体无组合效果',
    },
  }
}

// ---------------------------------------------------------------------
// GET /api/agents —— 列出官方 + 公开自定义智能体（公开可读）
// ---------------------------------------------------------------------
// 支持参数（spec §5.4）：
//   filter=official|custom|all     按来源筛选
//   category=history|literature|…  按 10 大类筛选（仅官方智能体有 category）
//   tag=教育                         按 topics 标签筛选（包含匹配）
//   search=孔子                      模糊搜索 name/tagline/title
//   page=1&pageSize=20               分页（pageSize 默认 20，最大 50）
// 返回格式：{ agents, total, page, pageSize }
// ---------------------------------------------------------------------

const VALID_CATEGORIES = new Set([
  'history',
  'literature',
  'science',
  'art',
  'anime-game',
  'worklife',
  'fun',
  'sports',
  'music',
  'movie-tv',
])

agentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const filter =
      typeof req.query.filter === 'string' ? req.query.filter : 'all'
    const category =
      typeof req.query.category === 'string' ? req.query.category : ''
    const tag =
      typeof req.query.tag === 'string' ? req.query.tag.trim() : ''

    // 分页参数（默认 1 / 20，最大 50）
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
    const pageSizeRaw =
      parseInt(String(req.query.pageSize ?? '20'), 10) || 20
    const pageSize = Math.min(50, Math.max(1, pageSizeRaw))

    // filter: official → 仅官方；custom → 仅自定义；all → 全部
    const officialList: AgentConfig[] = filter === 'custom' ? [] : agents
    const customList: CustomAgent[] =
      filter === 'official' ? [] : await listPublicCustomAgents()
    const customConfigs = customList.map(customAgentToConfig)

    // 合并列表
    let allAgents = [...officialList, ...customConfigs]

    // 分类筛选（仅对带 category 的官方智能体生效；自定义智能体 era='自定义'，不参与分类）
    if (category && VALID_CATEGORIES.has(category)) {
      allAgents = allAgents.filter((a) => a.category === category)
    }

    // 标签筛选（topics 数组包含匹配）
    if (tag.length > 0) {
      allAgents = allAgents.filter((a) =>
        a.topics.some((t) => t.toLowerCase().includes(tag.toLowerCase())),
      )
    }

    // 简单内存搜索
    if (search.length > 0) {
      const lower = search.toLowerCase()
      allAgents = allAgents.filter(
        (a) =>
          a.name.toLowerCase().includes(lower) ||
          a.tagline.toLowerCase().includes(lower) ||
          a.title.toLowerCase().includes(lower),
      )
    }

    // 分页切片
    const total = allAgents.length
    const start = (page - 1) * pageSize
    const paged = allAgents.slice(start, start + pageSize)

    res.json({ agents: paged, total, page, pageSize })
  } catch (err) {
    console.error('[api/agents] 异常：', err)
    res.status(500).json({ error: '服务器开小差了' })
  }
})

// ---------------------------------------------------------------------
// POST /api/agents/polish —— 一键润色智能体提示词
// ---------------------------------------------------------------------
// 注意：必须放在 GET /:id 之前，否则 'polish' 会被当作 id 匹配。
agentsRouter.post(
  '/polish',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const draft =
        typeof req.body?.draft === 'string' ? req.body.draft.trim() : ''
      if (draft.length < 2) {
        res.status(400).json({ error: '草稿至少 2 个字符' })
        return
      }
      if (draft.length > 5000) {
        res.status(400).json({ error: '草稿最多 5000 个字符' })
        return
      }

      const polished = await polishAgentPrompt(draft)
      res.json({ polished })
    } catch (err) {
      console.error('[api/agents/polish] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '润色失败',
      })
    }
  }
)

// ---------------------------------------------------------------------
// GET /api/agents/:id —— 获取单个智能体详情
// ---------------------------------------------------------------------

agentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string

    // 先查官方
    const official = getAgentById(id)
    if (official) {
      res.json({ agent: official })
      return
    }

    // 再查自定义
    const custom = await getCustomAgentById(id)
    if (!custom) {
      res.status(404).json({ error: '智能体不存在' })
      return
    }

    res.json({ agent: customAgentToConfig(custom) })
  } catch (err) {
    console.error('[api/agents/:id] 异常：', err)
    res.status(500).json({ error: '服务器开小差了' })
  }
})

// ---------------------------------------------------------------------
// POST /api/agents/create —— 创建自定义智能体
// ---------------------------------------------------------------------

interface CreateAgentBody {
  name?: unknown
  description?: unknown
  personality?: unknown
  systemPrompt?: unknown
  avatarGradient?: unknown
  visibility?: unknown
}

agentsRouter.post(
  '/create',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    try {
      const body = req.body as CreateAgentBody
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const description =
        typeof body.description === 'string' ? body.description.trim() : ''
      const personality =
        typeof body.personality === 'string' ? body.personality.trim() : ''
      const systemPrompt =
        typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : ''
      const avatarGradient =
        typeof body.avatarGradient === 'string' ? body.avatarGradient : ''
      const visibility =
        body.visibility === 'public' || body.visibility === 'private'
          ? body.visibility
          : 'private'

      if (name.length < 1 || name.length > 50) {
        res.status(400).json({ error: '名字需 1-50 个字符' })
        return
      }
      if (systemPrompt.length < 10 || systemPrompt.length > 5000) {
        res.status(400).json({ error: '系统提示词需 10-5000 个字符' })
        return
      }
      if (!avatarGradient) {
        res.status(400).json({ error: '请选择头像配色' })
        return
      }

      const agent = await createCustomAgent(user.id, {
        name,
        description,
        personality,
        systemPrompt,
        avatarGradient,
        visibility,
      })

      res.json({ agent })
    } catch (err) {
      console.error('[api/agents/create] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)

// ---------------------------------------------------------------------
// PUT /api/agents/:id —— 更新自定义智能体（仅创建者）
// ---------------------------------------------------------------------

interface UpdateAgentBody {
  name?: unknown
  description?: unknown
  personality?: unknown
  systemPrompt?: unknown
  avatarGradient?: unknown
  visibility?: unknown
}

agentsRouter.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const id = req.params.id as string

    // 先查确认存在且为创建者
    const existing = await getCustomAgentById(id)
    if (!existing) {
      res.status(404).json({ error: '智能体不存在' })
      return
    }
    if (existing.creator_id !== user.id) {
      res.status(403).json({ error: '无权修改他人创建的智能体' })
      return
    }

    // 构建更新字段
    const body = req.body as UpdateAgentBody
    const updates: {
      name?: string
      description?: string
      personality?: string
      system_prompt?: string
      avatar_gradient?: string
      visibility?: 'private' | 'public'
    } = {}

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (name.length < 1 || name.length > 50) {
        res.status(400).json({ error: '名字需 1-50 个字符' })
        return
      }
      updates.name = name
    }
    if (typeof body.description === 'string') {
      updates.description = body.description.trim()
    }
    if (typeof body.personality === 'string') {
      updates.personality = body.personality.trim()
    }
    if (typeof body.systemPrompt === 'string') {
      const sp = body.systemPrompt.trim()
      if (sp.length < 10 || sp.length > 5000) {
        res.status(400).json({ error: '系统提示词需 10-5000 个字符' })
        return
      }
      updates.system_prompt = sp
    }
    if (typeof body.avatarGradient === 'string') {
      updates.avatar_gradient = body.avatarGradient
    }
    if (body.visibility === 'public' || body.visibility === 'private') {
      updates.visibility = body.visibility
    }

    await updateCustomAgent(id, updates)

    // 返回更新后的智能体
    const updated = await getCustomAgentById(id)
    res.json({ agent: updated })
  } catch (err) {
    console.error('[api/agents PUT] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// DELETE /api/agents/:id —— 删除自定义智能体（仅创建者）
// ---------------------------------------------------------------------

agentsRouter.delete(
  '/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    try {
      const id = req.params.id as string

      // 先查确认存在且为创建者
      const existing = await getCustomAgentById(id)
      if (!existing) {
        res.status(404).json({ error: '智能体不存在' })
        return
      }
      if (existing.creator_id !== user.id) {
        res.status(403).json({ error: '无权删除他人创建的智能体' })
        return
      }

      await deleteCustomAgent(id)
      res.json({ success: true })
    } catch (err) {
      console.error('[api/agents DELETE] 异常：', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '服务器开小差了',
      })
    }
  }
)
