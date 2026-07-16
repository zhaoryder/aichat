// =====================================================================
// 深夜emo墙 API
// ---------------------------------------------------------------------
// GET  /api/emo-wall          - 获取列表
// POST /api/emo-wall          - 匿名发布
// POST /api/emo-wall/:id/like - 点赞
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { chatCompletion } from '../lib/ai-client'
import { getAgentById } from '../../shared/agents'
import { supabase } from '../lib/supabase'

const router = Router()

// 随机昵称生成
const ADJECTIVES = ['深夜', '凌晨', 'emo', '失眠', '做梦', '清醒', '迷茫', '空虚', '孤独', '寂寞']
const NOUNS = ['诗人', '哲学家', '观察者', '路人', '灵魂', '影子', '梦游者', '思考者', '夜猫子', 'emo侠']

function generateAnonymousName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj}${noun}${Math.floor(Math.random() * 1000)}`
}

// GET /api/emo-wall - 获取列表
router.get('/', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  try {
    const { data, error, count } = await supabase
      .from('emo_wall')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) throw error
    res.json({ posts: data || [], total: count || 0, page, limit })
  } catch (err) {
    console.error('[emo-wall] list error:', err)
    res.status(500).json({ error: '获取失败' })
  }
})

// POST /api/emo-wall - 匿名发布
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const { content } = req.body as { content: string }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: '内容不能为空' })
  }

  const anonymousName = generateAnonymousName()

  try {
    // 1. 保存发布内容
    const { data, error } = await supabase
      .from('emo_wall')
      .insert({
        anonymous_name: anonymousName,
        content: content.trim(),
      })
      .select()
      .single()

    if (error) throw error

    // 2. 生成 AI 评论（异步，不阻塞响应）
    const aiAgents = ['confucius', 'luxun', 'libai', 'lindaiyu']
    const randomAgent = aiAgents[Math.floor(Math.random() * aiAgents.length)]
    const agent = getAgentById(randomAgent)

    if (agent) {
      try {
        const messages = [
          { role: 'user' as const, content: `请用你的风格评论这条匿名emo内容（50字以内，要搞笑）：\n\n${content}` }
        ]
        const aiComment = await chatCompletion(messages, randomAgent)

        // 更新 ai_comment 字段
        await supabase
          .from('emo_wall')
          .update({ ai_comment: aiComment })
          .eq('id', data.id)

        data.ai_comment = aiComment
      } catch (aiErr) {
        console.error('[emo-wall] AI comment error:', aiErr)
      }
    }

    res.json({ post: data })
  } catch (err) {
    console.error('[emo-wall] create error:', err)
    res.status(500).json({ error: '发布失败' })
  }
})

// POST /api/emo-wall/:id/like - 点赞
router.post('/:id/like', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data: current } = await supabase.from('emo_wall').select('likes').eq('id', id).single()
    const newLikes = (current?.likes || 0) + 1
    await supabase.from('emo_wall').update({ likes: newLikes }).eq('id', id)
    res.json({ success: true, likes: newLikes })
  } catch (err) {
    console.error('[emo-wall/like] error:', err)
    res.status(500).json({ error: '点赞失败' })
  }
})

export const emoWallRouter = router
