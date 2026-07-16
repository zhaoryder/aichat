// =====================================================================
// Skill 市场 API
// ---------------------------------------------------------------------
// 挂载在 /api 下，提供以下端点：
//   GET    /skills                          列表（支持 category/q/page/limit）
//   GET    /skills/:slug                    详情
//   POST   /skills                          发布新 skill（登录，status='pending'）
//   POST   /skills/:id/install              安装到当前用户
//   DELETE /skills/:id/install              卸载
//   POST   /skills/:id/enable               启用
//   DELETE /skills/:id/enable               禁用
//   GET    /users/me/skills                 我的已安装 skill
//   POST   /admin/skills/:id/publish        管理员审核发布
// =====================================================================

import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { authMiddleware } from '../middleware/auth'
import { adminMiddleware } from '../middleware/admin'
import { supabase } from '../lib/supabase'
import type { Skill, SkillCategory, SkillManifest } from '../../shared/types'

export const skillsRouter = Router()

// ---------------------------------------------------------------------
// 辅助：可选认证（不强制登录，但有 token 时提取 userId）
// ---------------------------------------------------------------------

/** 从 Authorization header 中尝试提取 userId（失败返回 null，不报错） */
async function tryGetUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return null

  try {
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    })
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return null
    return data.user.id
  } catch {
    return null
  }
}

/** 合法的 skill 分类 */
const VALID_CATEGORIES = new Set<SkillCategory>([
  'search',
  'media',
  'code',
  'data',
  'utility',
  'custom',
])

// ---------------------------------------------------------------------
// GET /skills —— 列表（支持 category/q/page/limit）
// ---------------------------------------------------------------------
// 只返回 status='published' 的 skill，含 install_count。
// 若用户登录，附加 installed 字段（是否已安装）。
// ---------------------------------------------------------------------

skillsRouter.get('/skills', async (req: Request, res: Response) => {
  try {
    const category =
      typeof req.query.category === 'string' ? req.query.category : ''
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
    const limitRaw = parseInt(String(req.query.limit ?? '20'), 10) || 20
    const limit = Math.min(50, Math.max(1, limitRaw))
    const offset = (page - 1) * limit

    // 构建查询：只查 published
    let query = supabase
      .from('skills')
      .select('*')
      .eq('status', 'published')
      .order('install_count', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (category && VALID_CATEGORIES.has(category as SkillCategory)) {
      query = query.eq('category', category)
    }

    if (q) {
      // 简单模糊搜索：name 或 description 包含关键词
      query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)
    }

    const { data: skills, error } = await query
    if (error) throw error

    // 查询总数（用于分页）
    let countQuery = supabase
      .from('skills')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
    if (category && VALID_CATEGORIES.has(category as SkillCategory)) {
      countQuery = countQuery.eq('category', category)
    }
    if (q) {
      countQuery = countQuery.or(`name.ilike.%${q}%,description.ilike.%${q}%`)
    }
    const { count, error: countError } = await countQuery
    if (countError) throw countError

    // 若用户登录，查询已安装的 skill_id 集合
    const userId = await tryGetUserId(req)
    let installedSet: Set<string> | null = null
    if (userId && skills && skills.length > 0) {
      const skillIds = skills.map((s) => s.id)
      const { data: userSkills, error: usError } = await supabase
        .from('user_skills')
        .select('skill_id')
        .eq('user_id', userId)
        .in('skill_id', skillIds)
      if (!usError && userSkills) {
        installedSet = new Set(userSkills.map((us) => us.skill_id))
      }
    }

    // 附加 installed 字段
    const result = (skills || []).map((s) => ({
      ...s,
      installed: installedSet ? installedSet.has(s.id) : false,
    }))

    res.json({
      skills: result,
      total: count ?? 0,
      page,
      limit,
      hasMore: offset + limit < (count ?? 0),
    })
  } catch (err) {
    console.error('[GET /skills] error:', err)
    res.status(500).json({ error: '获取 Skill 列表失败' })
  }
})

// ---------------------------------------------------------------------
// GET /skills/:slug —— 详情
// ---------------------------------------------------------------------

skillsRouter.get('/skills/:slug', async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug
    const { data: skill, error } = await supabase
      .from('skills')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (error) throw error
    if (!skill) {
      res.status(404).json({ error: 'Skill 不存在' })
      return
    }

    // 非 published 的 skill 仅作者可看
    if (skill.status !== 'published') {
      const userId = await tryGetUserId(req)
      if (skill.author_id && skill.author_id !== userId) {
        res.status(404).json({ error: 'Skill 不存在' })
        return
      }
    }

    // 若登录，附加 installed + enabled
    const userId = await tryGetUserId(req)
    let installed = false
    let enabled = false
    if (userId) {
      const { data: us } = await supabase
        .from('user_skills')
        .select('enabled')
        .eq('user_id', userId)
        .eq('skill_id', skill.id)
        .maybeSingle()
      if (us) {
        installed = true
        enabled = us.enabled
      }
    }

    res.json({ skill: { ...skill, installed, enabled } })
  } catch (err) {
    console.error('[GET /skills/:slug] error:', err)
    res.status(500).json({ error: '获取 Skill 详情失败' })
  }
})

// ---------------------------------------------------------------------
// POST /skills —— 发布新 skill（登录，status='pending'）
// ---------------------------------------------------------------------

interface CreateSkillBody {
  name?: unknown
  slug?: unknown
  description?: unknown
  category?: unknown
  manifest?: unknown
  version?: unknown
}

skillsRouter.post('/skills', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const body = req.body as CreateSkillBody
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const description =
      typeof body.description === 'string' ? body.description.trim() : ''
    const category =
      typeof body.category === 'string' ? body.category : 'custom'
    const version =
      typeof body.version === 'string' ? body.version : '1.0.0'

    if (!name || name.length > 100) {
      res.status(400).json({ error: 'name 必填且不超过 100 字符' })
      return
    }
    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      res.status(400).json({ error: 'slug 必填，仅允许小写字母、数字、连字符' })
      return
    }
    if (!VALID_CATEGORIES.has(category as SkillCategory)) {
      res.status(400).json({ error: `category 必须为 ${[...VALID_CATEGORIES].join('/')}` })
      return
    }

    // 校验 manifest 结构
    const manifest = body.manifest
    if (typeof manifest !== 'object' || manifest === null) {
      res.status(400).json({ error: 'manifest 必须为对象' })
      return
    }
    const m = manifest as Partial<SkillManifest>
    if (typeof m.name !== 'string' || typeof m.description !== 'string' || !Array.isArray(m.tools)) {
      res.status(400).json({ error: 'manifest 需包含 name, description, tools 字段' })
      return
    }

    // slug 唯一性检查
    const { data: existing } = await supabase
      .from('skills')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (existing) {
      res.status(409).json({ error: 'slug 已存在，请换一个' })
      return
    }

    const { data: skill, error } = await supabase
      .from('skills')
      .insert({
        name,
        slug,
        description,
        category,
        manifest,
        author_id: user.id,
        version,
        status: 'pending',
      })
      .select()
      .single()

    if (error) throw error
    res.json({ skill })
  } catch (err) {
    console.error('[POST /skills] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '发布 Skill 失败',
    })
  }
})

// ---------------------------------------------------------------------
// POST /skills/:id/install —— 安装到当前用户
// ---------------------------------------------------------------------

skillsRouter.post(
  '/skills/:id/install',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const skillId = req.params.id

    try {
      // 确认 skill 存在且 published
      const { data: skill, error: skillError } = await supabase
        .from('skills')
        .select('id, status, install_count')
        .eq('id', skillId)
        .maybeSingle()

      if (skillError) throw skillError
      if (!skill) {
        res.status(404).json({ error: 'Skill 不存在' })
        return
      }
      if (skill.status !== 'published') {
        res.status(400).json({ error: '该 Skill 未发布，无法安装' })
        return
      }

      // upsert 到 user_skills（已安装则更新 enabled=true）
      const { error: upsertError } = await supabase
        .from('user_skills')
        .upsert(
          {
            user_id: user.id,
            skill_id: skillId,
            enabled: true,
            config: {},
          },
          { onConflict: 'user_id,skill_id' },
        )

      if (upsertError) throw upsertError

      // install_count + 1（读-改-写，简单实现）
      const newCount = (skill.install_count || 0) + 1
      await supabase
        .from('skills')
        .update({ install_count: newCount })
        .eq('id', skillId)

      res.json({ success: true, install_count: newCount })
    } catch (err) {
      console.error('[POST /skills/:id/install] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '安装 Skill 失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// DELETE /skills/:id/install —— 卸载
// ---------------------------------------------------------------------

skillsRouter.delete(
  '/skills/:id/install',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const skillId = req.params.id

    try {
      // 删除 user_skills 记录
      const { error: deleteError } = await supabase
        .from('user_skills')
        .delete()
        .eq('user_id', user.id)
        .eq('skill_id', skillId)

      if (deleteError) throw deleteError

      // install_count - 1（最小 0）
      const { data: skill } = await supabase
        .from('skills')
        .select('install_count')
        .eq('id', skillId)
        .maybeSingle()

      if (skill) {
        const newCount = Math.max(0, (skill.install_count || 0) - 1)
        await supabase
          .from('skills')
          .update({ install_count: newCount })
          .eq('id', skillId)
      }

      res.json({ success: true })
    } catch (err) {
      console.error('[DELETE /skills/:id/install] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '卸载 Skill 失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// POST /skills/:id/enable —— 启用
// ---------------------------------------------------------------------

skillsRouter.post(
  '/skills/:id/enable',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const skillId = req.params.id

    try {
      const { error } = await supabase
        .from('user_skills')
        .update({ enabled: true })
        .eq('user_id', user.id)
        .eq('skill_id', skillId)

      if (error) throw error
      res.json({ success: true })
    } catch (err) {
      console.error('[POST /skills/:id/enable] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '启用 Skill 失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// DELETE /skills/:id/enable —— 禁用
// ---------------------------------------------------------------------

skillsRouter.delete(
  '/skills/:id/enable',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    const skillId = req.params.id

    try {
      const { error } = await supabase
        .from('user_skills')
        .update({ enabled: false })
        .eq('user_id', user.id)
        .eq('skill_id', skillId)

      if (error) throw error
      res.json({ success: true })
    } catch (err) {
      console.error('[DELETE /skills/:id/enable] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '禁用 Skill 失败',
      })
    }
  },
)

// ---------------------------------------------------------------------
// GET /users/me/skills —— 我的已安装 skill（JOIN skills）
// ---------------------------------------------------------------------

skillsRouter.get(
  '/users/me/skills',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
    try {
      const { data, error } = await supabase
        .from('user_skills')
        .select(
          'user_id, skill_id, enabled, config, installed_at, skill:skills(*)',
        )
        .eq('user_id', user.id)
        .order('installed_at', { ascending: false })

      if (error) throw error

      // 规范化 skill 字段（supabase JOIN 可能返回数组）
      const userSkills = (data || []).map((row) => {
        const skillRow = (row as { skill: unknown }).skill
        const skill = Array.isArray(skillRow)
          ? (skillRow[0] as Skill)
          : (skillRow as Skill)
        return {
          user_id: (row as { user_id: string }).user_id,
          skill_id: (row as { skill_id: string }).skill_id,
          enabled: (row as { enabled: boolean }).enabled,
          config: (row as { config: Record<string, unknown> }).config ?? {},
          installed_at: (row as { installed_at: string }).installed_at,
          skill,
        }
      })

      res.json({ userSkills })
    } catch (err) {
      console.error('[GET /users/me/skills] error:', err)
      res.status(500).json({ error: '获取已安装 Skill 失败' })
    }
  },
)

// ---------------------------------------------------------------------
// POST /admin/skills/:id/publish —— 管理员审核发布
// ---------------------------------------------------------------------

skillsRouter.post(
  '/admin/skills/:id/publish',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response) => {
    const skillId = req.params.id

    try {
      const { data: skill, error } = await supabase
        .from('skills')
        .update({ status: 'published' })
        .eq('id', skillId)
        .select()
        .single()

      if (error) throw error
      if (!skill) {
        res.status(404).json({ error: 'Skill 不存在' })
        return
      }

      res.json({ skill })
    } catch (err) {
      console.error('[POST /admin/skills/:id/publish] error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : '审核发布失败',
      })
    }
  },
)
