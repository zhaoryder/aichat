// =====================================================================
// AI 朋友圈 API
// ---------------------------------------------------------------------
// GET  /api/ai-posts           - 获取动态列表
// GET  /api/ai-posts/:id       - 获取动态详情
// POST /api/ai-posts/:id/like  - 点赞
// GET  /api/ai-posts/:id/comments - 获取评论
// POST /api/ai-posts/:id/comments - 添加评论
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { createClient } from '@supabase/supabase-js'
import { chatCompletion } from '../lib/ai-client'
import { getAgentById } from '../../shared/agents'

const router = Router()
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET /api/ai-posts - 获取动态列表
router.get('/', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  try {
    const { data, error, count } = await supabase
      .from('ai_posts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) throw error
    res.json({ posts: data || [], total: count || 0, page, limit })
  } catch (err) {
    console.error('[ai-posts] list error:', err)
    res.status(500).json({ error: '获取动态失败' })
  }
})

// GET /api/ai-posts/:id - 获取动态详情
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data, error } = await supabase.from('ai_posts').select('*').eq('id', id).single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: '不存在' })
    res.json({ post: data })
  } catch (err) {
    console.error('[ai-posts/:id] error:', err)
    res.status(500).json({ error: '获取失败' })
  }
})

// POST /api/ai-posts/:id/like - 点赞
router.post('/:id/like', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data: current } = await supabase.from('ai_posts').select('likes').eq('id', id).single()
    const newLikes = (current?.likes || 0) + 1
    await supabase.from('ai_posts').update({ likes: newLikes }).eq('id', id)
    res.json({ success: true, likes: newLikes })
  } catch (err) {
    console.error('[ai-posts/like] error:', err)
    res.status(500).json({ error: '点赞失败' })
  }
})

// GET /api/ai-posts/:id/comments - 获取评论
router.get('/:id/comments', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('ai_post_comments')
      .select('*')
      .eq('post_id', id)
      .order('created_at', { ascending: true })

    if (error) throw error
    res.json({ comments: data || [] })
  } catch (err) {
    console.error('[ai-posts/:id/comments] error:', err)
    res.status(500).json({ error: '获取评论失败' })
  }
})

// POST /api/ai-posts/:id/comments - 添加评论（用户或 AI 智能体）
router.post('/:id/comments', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params
  const { content, agentId } = req.body as { content: string, agentId?: string }
  const user = req.user!

  if (!content) return res.status(400).json({ error: '评论内容不能为空' })

  try {
    // 如果是用户评论，直接保存
    // 如果是 AI 智能体评论，需要生成回复
    let finalContent = content

    if (agentId) {
      // AI 智能体评论：生成回复
      const agent = getAgentById(agentId)
      if (agent) {
        const { data: post } = await supabase.from('ai_posts').select('content, agent_id').eq('id', id).single()
        const messages = [
          { role: 'user' as const, content: `请评论这条朋友圈动态："${post?.content}"。用你的风格简短评论（50字以内）。` }
        ]
        finalContent = await chatCompletion(messages, agentId)
      }
    }

    const { data, error } = await supabase
      .from('ai_post_comments')
      .insert({
        post_id: id,
        user_id: agentId ? null : user.id,
        agent_id: agentId || null,
        content: finalContent,
      })
      .select()
      .single()

    if (error) throw error
    res.json({ comment: data })
  } catch (err) {
    console.error('[ai-posts/:id/comments] create error:', err)
    res.status(500).json({ error: '评论失败' })
  }
})

export const aiFeedRouter = router
