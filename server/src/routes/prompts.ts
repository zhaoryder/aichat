// =====================================================================
// 提示词市场 API
// ---------------------------------------------------------------------
// GET    /api/prompts           - 列表（分页+分类筛选+搜索）
// GET    /api/prompts/:id       - 详情
// POST   /api/prompts            - 创建
// PUT    /api/prompts/:id        - 更新
// DELETE /api/prompts/:id        - 删除
// POST   /api/prompts/:id/like   - 点赞
// POST   /api/prompts/:id/use    - 使用（uses++）
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { createClient } from '@supabase/supabase-js'

const router = Router()
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET /api/prompts - 列表
router.get('/', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  const category = req.query.category as string
  const search = req.query.search as string

  try {
    let query = supabase
      .from('prompt_market')
      .select('*', { count: 'exact' })

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
    }

    const { data, error, count } = await query
      .order('likes', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) throw error
    res.json({ prompts: data || [], total: count || 0, page, limit })
  } catch (err) {
    console.error('[prompts] list error:', err)
    res.status(500).json({ error: '获取提示词失败' })
  }
})

// GET /api/prompts/:id - 详情
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data, error } = await supabase.from('prompt_market').select('*').eq('id', id).single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: '不存在' })
    res.json({ prompt: data })
  } catch (err) {
    console.error('[prompts/:id] error:', err)
    res.status(500).json({ error: '获取失败' })
  }
})

// POST /api/prompts - 创建
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const { title, content, category } = req.body as {
    title: string
    content: string
    category?: string
  }
  const user = req.user!

  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' })
  }

  try {
    const { data, error } = await supabase
      .from('prompt_market')
      .insert({
        user_id: user.id,
        title,
        content,
        category: category || '通用',
      })
      .select()
      .single()

    if (error) throw error
    res.json({ prompt: data })
  } catch (err) {
    console.error('[prompts] create error:', err)
    res.status(500).json({ error: '创建失败' })
  }
})

// PUT /api/prompts/:id - 更新
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params
  const { title, content, category } = req.body
  const user = req.user!

  try {
    const { data, error } = await supabase
      .from('prompt_market')
      .update({ title, content, category })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error
    res.json({ prompt: data })
  } catch (err) {
    console.error('[prompts/:id] update error:', err)
    res.status(500).json({ error: '更新失败' })
  }
})

// DELETE /api/prompts/:id - 删除
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params
  const user = req.user!

  try {
    const { error } = await supabase
      .from('prompt_market')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[prompts/:id] delete error:', err)
    res.status(500).json({ error: '删除失败' })
  }
})

// POST /api/prompts/:id/like - 点赞
router.post('/:id/like', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data: current } = await supabase.from('prompt_market').select('likes').eq('id', id).single()
    const newLikes = (current?.likes || 0) + 1
    await supabase.from('prompt_market').update({ likes: newLikes }).eq('id', id)
    res.json({ success: true, likes: newLikes })
  } catch (err) {
    console.error('[prompts/like] error:', err)
    res.status(500).json({ error: '点赞失败' })
  }
})

// POST /api/prompts/:id/use - 使用
router.post('/:id/use', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data: current } = await supabase.from('prompt_market').select('uses').eq('id', id).single()
    const newUses = (current?.uses || 0) + 1
    await supabase.from('prompt_market').update({ uses: newUses }).eq('id', id)
    res.json({ success: true, uses: newUses })
  } catch (err) {
    console.error('[prompts/use] error:', err)
    res.status(500).json({ error: '使用失败' })
  }
})

export const promptsRouter = router
