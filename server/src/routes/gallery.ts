// =====================================================================
// AI 绘画广场 API
// ---------------------------------------------------------------------
// GET  /api/gallery/images          - 分页获取公开图片
// POST /api/gallery/images/:id/like - 点赞
// POST /api/gallery/images/:id/unlike - 取消点赞
// POST /api/gallery/images          - 发布图片到广场
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { createClient } from '@supabase/supabase-js'

const router = Router()
const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// GET /api/gallery/images - 分页获取公开图片
router.get('/images', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  const sort = (req.query.sort as string) || 'latest' // latest | popular

  try {
    const { data, error, count } = await supabase
      .from('image_gallery')
      .select('*', { count: 'exact' })
      .eq('is_public', true)
      .order(sort === 'popular' ? 'likes' : 'created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) throw error
    res.json({
      images: data || [],
      total: count || 0,
      page,
      limit,
    })
  } catch (err) {
    console.error('[gallery/images] error:', err)
    res.status(500).json({ error: '获取图片失败' })
  }
})

// POST /api/gallery/images - 发布图片到广场
router.post('/images', authMiddleware, async (req: Request, res: Response) => {
  const { prompt, url, title } = req.body as {
    prompt: string
    url: string
    title?: string
  }
  const user = req.user!

  if (!prompt || !url) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  try {
    const { data, error } = await supabase
      .from('image_gallery')
      .insert({
        user_id: user.id,
        prompt,
        url,
        title: title || '',
        is_public: true,
      })
      .select()
      .single()

    if (error) throw error
    res.json({ image: data })
  } catch (err) {
    console.error('[gallery/images] create error:', err)
    res.status(500).json({ error: '发布失败' })
  }
})

// POST /api/gallery/images/:id/like - 点赞
router.post('/images/:id/like', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params
  const user = req.user!

  try {
    // 简单实现：直接 +1（后续可加 likes 表防重复）
    const { data, error } = await supabase.rpc('increment_likes', { row_id: id, table_name: 'image_gallery' })

    // 如果 RPC 不存在，用简单方式
    if (error) {
      const { data: current } = await supabase.from('image_gallery').select('likes').eq('id', id).single()
      const newLikes = (current?.likes || 0) + 1
      await supabase.from('image_gallery').update({ likes: newLikes }).eq('id', id)
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[gallery/like] error:', err)
    res.status(500).json({ error: '点赞失败' })
  }
})

// POST /api/gallery/images/:id/unlike - 取消点赞
router.post('/images/:id/unlike', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data: current } = await supabase.from('image_gallery').select('likes').eq('id', id).single()
    const newLikes = Math.max(0, (current?.likes || 0) - 1)
    await supabase.from('image_gallery').update({ likes: newLikes }).eq('id', id)
    res.json({ success: true })
  } catch (err) {
    console.error('[gallery/unlike] error:', err)
    res.status(500).json({ error: '取消点赞失败' })
  }
})

export const galleryRouter = router
