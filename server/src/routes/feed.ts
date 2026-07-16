// =====================================================================
// 社媒信息流 API（Feed + Posts + Likes + Comments）
// ---------------------------------------------------------------------
// GET  /api/feed              — 首页信息流（关注 + 推荐）
// GET  /api/feed/explore      — 探索页热门内容
// POST /api/posts             — 发布动态
// GET  /api/posts/:id         — 动态详情
// DELETE /api/posts/:id       — 删除动态
// GET  /api/posts/user/:userId — 用户主页动态列表
// POST /api/likes/:postId     — 点赞 / 取消点赞
// POST /api/comments          — 发表评论
// GET  /api/comments/:postId  — 评论列表
// POST /api/posts/:id/repost  — 转发
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import { getAgentById, agents as allAgentsList } from '../../shared/agents'
import { generateAndSaveEmbedding, getRecommendedPosts } from '../lib/embeddings'
import { triggerAIReply } from '../lib/ai-comment-trigger'
import { generateAIImage } from '../lib/agents/agent-tools'

export const feedRouter = Router()

const PAGE_SIZE = 20

/** 查询帖子并 join 作者信息 + 点赞数 + 评论数 */
async function fetchPostsWithMetaSimple(posts: any[], userId?: string) {
  if (!posts || posts.length === 0) return []

  const userIds = [...new Set(posts.map((p) => p.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url')
    .in('id', userIds)
  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])

  const postIds = posts.map((p) => p.id)

  // 查询点赞数
  const { data: likes } = await supabase
    .from('likes')
    .select('post_id')
    .in('post_id', postIds)
  const likeCountMap = new Map<string, number>()
  likes?.forEach((l) => {
    const pid = l.post_id as string
    likeCountMap.set(pid, (likeCountMap.get(pid) ?? 0) + 1)
  })

  // 查询评论数
  const { data: comments } = await supabase
    .from('comments')
    .select('post_id')
    .in('post_id', postIds)
  const commentCountMap = new Map<string, number>()
  comments?.forEach((c) => {
    const pid = c.post_id as string
    commentCountMap.set(pid, (commentCountMap.get(pid) ?? 0) + 1)
  })

  // 当前用户点赞状态
  let likedSet = new Set<string>()
  if (userId && postIds.length > 0) {
    const { data: liked } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds)
    likedSet = new Set(liked?.map((l) => l.post_id as string) ?? [])
  }

  return posts.map((p) => {
    const profile = profileMap.get(p.user_id)
    const postId = p.id as string
    return {
      ...p,
      author: profile ?? { id: p.user_id, nickname: '未知用户', avatar_url: null },
      like_count: likeCountMap.get(postId) ?? 0,
      comment_count: commentCountMap.get(postId) ?? 0,
      liked: likedSet.has(postId),
    }
  })
}

// GET /api/feed — 首页信息流
feedRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const offset = (page - 1) * PAGE_SIZE

    // 尝试从 token 获取用户 ID
    const authHeader = req.headers.authorization
    let userId: string | undefined

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (supabaseUrl && anonKey) {
        const { createClient } = await import('@supabase/supabase-js')
        const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
        const { data } = await client.auth.getUser(token)
        userId = data.user?.id
      }
    }

    let posts: any[] = []

    // 1. 置顶帖（is_pinned = true）始终在最前（仅第 1 页加载）
    if (page === 1) {
      const { data: pinnedPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('is_pinned', true)
        .order('created_at', { ascending: false })
        .limit(5)
      posts.push(...(pinnedPosts || []))
    }

    // 2. 推流帖（is_promoted = true AND promoted_until > now）紧随其后（仅第 1 页）
    if (page === 1) {
      const { data: promotedPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('is_promoted', true)
        .gt('promoted_until', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10)
      // 去重：避免与置顶帖重复
      const existingIds = new Set(posts.map((p) => p.id))
      posts.push(...(promotedPosts || []).filter((p) => !existingIds.has(p.id)))
    }

    if (userId) {
      // 登录用户：关注的人的动态 + 推荐内容（混合）
      // 先查关注的用户
      const { data: following } = await supabase
        .from('follows')
        .select('followee_id')
        .eq('follower_id', userId)
        .eq('followee_type', 'user')

      const followingIds = following?.map((f) => f.followee_id as string) ?? []
      const existingIds = new Set(posts.map((p) => p.id))

      if (followingIds.length > 0) {
        // 有关注的人：查关注用户的动态
        const { data: followingPosts } = await supabase
          .from('posts')
          .select('*')
          .in('user_id', followingIds)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)

        // 去重后追加
        posts.push(...(followingPosts || []).filter((p) => !existingIds.has(p.id)))
      }

      // 不够一页时，用向量推荐补足
      if (posts.length < PAGE_SIZE) {
        const need = PAGE_SIZE - posts.length
        const excludeIds = posts.map((p) => p.id)
        const recommended = await getRecommendedPosts(userId, need, excludeIds)
        posts.push(...recommended)
      }

      // 仍不够，用时间倒序兜底
      if (posts.length < PAGE_SIZE) {
        const need = PAGE_SIZE - posts.length
        const excludeIds = posts.map((p) => p.id)
        const { data: restPosts } = await supabase
          .from('posts')
          .select('*')
          .order('created_at', { ascending: false })
          .range(0, need - 1)
        if (restPosts) {
          posts.push(...restPosts.filter((p) => !excludeIds.includes(p.id)))
        }
      }
    } else {
      // 未登录用户：查全部公开动态（按时间倒序）
      const existingIds = new Set(posts.map((p) => p.id))
      const { data: allPosts } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
      posts.push(...(allPosts || []).filter((p) => !existingIds.has(p.id)))
    }

    const enrichedPosts = await fetchPostsWithMetaSimple(posts, userId)
    res.json({ posts: enrichedPosts, page, hasMore: enrichedPosts.length === PAGE_SIZE })
  } catch (err) {
    console.error('[api/feed] error:', err)
    res.status(500).json({ error: '获取信息流失败' })
  }
})

// GET /api/feed/explore — 探索页热门内容
feedRouter.get('/explore', async (req: Request, res: Response) => {
  try {
    // 热门动态（最近 7 天，按点赞数排序）
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: hotPosts } = await supabase
      .from('posts')
      .select('*')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .range(0, 19)

    const enrichedPosts = await fetchPostsWithMetaSimple(hotPosts ?? [])

    // 热门智能体（取前 10 个）
    const hotAgents = allAgentsList.slice(0, 10).map((a) => ({
      id: a.id,
      name: a.name,
      era: a.era,
      title: a.title,
      tagline: a.tagline,
      avatarGradient: a.avatarGradient,
      category: a.category,
    }))

    res.json({ posts: enrichedPosts, agents: hotAgents })
  } catch (err) {
    console.error('[api/feed/explore] error:', err)
    res.status(500).json({ error: '获取探索内容失败' })
  }
})

// POST /api/posts — 发布动态
feedRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, content, metadata, repost_of } = req.body
    const userId = req.user!.id

    if (!type || !['text', 'conversation_share', 'project_share', 'image_share', 'repost'].includes(type)) {
      res.status(400).json({ error: '无效的动态类型' })
      return
    }
    if (type === 'text' && (!content || !content.trim())) {
      res.status(400).json({ error: '内容不能为空' })
      return
    }

    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        type,
        content: content || '',
        metadata: metadata || {},
        repost_of: repost_of || null,
      })
      .select('*')
      .single()

    if (error) throw error

    // 异步生成 embedding（不阻塞响应）
    const postTags = Array.isArray((metadata as any)?.tags) ? (metadata as any).tags : []
    setImmediate(() => generateAndSaveEmbedding(post.id, content || '', postTags))

    // 强制配图：若帖子没有图片，异步生成一张
    const hasImage =
      type === 'image_share' ||
      !!(metadata as any)?.image_url ||
      !!(metadata as any)?.cover_url
    if (!hasImage && type !== 'repost') {
      setImmediate(async () => {
        try {
          // 从内容提取配图提示词
          const promptText = (content || '精美配图')
            .slice(0, 80)
            .replace(/[#*`\[\]]/g, ' ')
            .trim()
          const imgRes = await generateAIImage({
            prompt: `为以下内容生成一张精美配图，要求：高质量、有艺术感、与内容相关。内容：${promptText}`,
            size: '1024x576',
          })
          if (imgRes.ok && imgRes.data?.url) {
            await supabase
              .from('posts')
              .update({
                metadata: { ...(metadata || {}), cover_url: imgRes.data.url },
              })
              .eq('id', post.id)
            console.log(`[feed] 帖子 ${post.id} 自动配图成功`)
          } else {
            console.warn(`[feed] 帖子 ${post.id} 自动配图失败：`, imgRes.error)
          }
        } catch (e) {
          console.warn(`[feed] 帖子 ${post.id} 自动配图异常：`, e)
        }
      })
    }

    // 查作者信息
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .eq('id', userId)
      .single()

    res.json({
      post: {
        ...post,
        author: profile ?? { id: userId, nickname: '未知用户', avatar_url: null },
        like_count: 0,
        comment_count: 0,
        liked: false,
      },
    })
  } catch (err) {
    console.error('[api/posts] create error:', err)
    res.status(500).json({ error: '发布动态失败' })
  }
})

// GET /api/posts/:id — 动态详情
feedRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { data: post, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !post) {
      res.status(404).json({ error: '动态不存在' })
      return
    }

    const enriched = await fetchPostsWithMetaSimple([post])
    res.json({ post: enriched[0] ?? post })
  } catch (err) {
    console.error('[api/posts/:id] error:', err)
    res.status(500).json({ error: '获取动态失败' })
  }
})

// DELETE /api/posts/:id — 删除动态
feedRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const userId = req.user!.id

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[api/posts] delete error:', err)
    res.status(500).json({ error: '删除动态失败' })
  }
})

// GET /api/posts/user/:userId — 用户主页动态列表
feedRouter.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const offset = (page - 1) * PAGE_SIZE

    const { data: posts, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw error

    // 获取当前用户 ID（用于判断点赞状态）
    const authHeader = req.headers.authorization
    let currentUserId: string | undefined
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (supabaseUrl && anonKey) {
        const { createClient } = await import('@supabase/supabase-js')
        const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
        const { data } = await client.auth.getUser(token)
        currentUserId = data.user?.id
      }
    }

    const enrichedPosts = await fetchPostsWithMetaSimple(posts ?? [], currentUserId)
    res.json({ posts: enrichedPosts, page, hasMore: enrichedPosts.length === PAGE_SIZE })
  } catch (err) {
    console.error('[api/posts/user] error:', err)
    res.status(500).json({ error: '获取用户动态失败' })
  }
})

// POST /api/likes/:postId — 点赞 / 取消点赞
feedRouter.post('/likes/:postId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { postId } = req.params
    const userId = req.user!.id

    // 检查是否已点赞
    const { data: existing } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .single()

    if (existing) {
      // 取消点赞
      await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId)
      res.json({ liked: false })
    } else {
      // 点赞
      await supabase.from('likes').insert({ user_id: userId, post_id: postId })

      // 创建通知
      const { data: post } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single()

      if (post && post.user_id !== userId) {
        await supabase.from('notifications').insert({
          user_id: post.user_id,
          type: 'like',
          actor_id: userId,
          target_id: postId,
          target_type: 'post',
        })
      }

      res.json({ liked: true })
    }
  } catch (err) {
    console.error('[api/likes] error:', err)
    res.status(500).json({ error: '操作失败' })
  }
})

// POST /api/comments — 发表评论
feedRouter.post('/comments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { postId, content } = req.body
    const userId = req.user!.id

    if (!postId || !content?.trim()) {
      res.status(400).json({ error: '缺少参数' })
      return
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: userId, content: content.trim() })
      .select('*')
      .single()

    if (error) throw error

    // 查作者信息
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .eq('id', userId)
      .single()

    // 创建通知
    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single()

    if (post && post.user_id !== userId) {
      await supabase.from('notifications').insert({
        user_id: post.user_id,
        type: 'comment',
        actor_id: userId,
        target_id: postId,
        target_type: 'post',
      })

      // 异步触发 AI 自动回复（不阻塞响应）
      setImmediate(() => triggerAIReply(postId, comment.id))
    }

    res.json({
      comment: {
        ...comment,
        author: profile ?? { id: userId, nickname: '未知用户', avatar_url: null },
      },
    })
  } catch (err) {
    console.error('[api/comments] create error:', err)
    res.status(500).json({ error: '评论失败' })
  }
})

// GET /api/comments/:postId — 评论列表
feedRouter.get('/comments/:postId', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params
    const { data: comments, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (error) throw error

    // 批量查作者信息
    const userIds = [...new Set(comments?.map((c) => c.user_id) ?? [])]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .in('id', userIds)
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])

    const enriched = (comments ?? []).map((c) => ({
      ...c,
      author: profileMap.get(c.user_id) ?? { id: c.user_id, nickname: '未知用户', avatar_url: null },
    }))

    res.json({ comments: enriched })
  } catch (err) {
    console.error('[api/comments] list error:', err)
    res.status(500).json({ error: '获取评论失败' })
  }
})

// POST /api/posts/:id/repost — 转发
feedRouter.post('/:id/repost', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const userId = req.user!.id
    const { content } = req.body

    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        type: 'repost',
        content: content || '',
        metadata: {},
        repost_of: id,
      })
      .select('*')
      .single()

    if (error) throw error

    // 创建通知
    const { data: originalPost } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', id)
      .single()

    if (originalPost && originalPost.user_id !== userId) {
      await supabase.from('notifications').insert({
        user_id: originalPost.user_id,
        type: 'repost',
        actor_id: userId,
        target_id: id,
        target_type: 'post',
      })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .eq('id', userId)
      .single()

    res.json({
      post: {
        ...post,
        author: profile ?? { id: userId, nickname: '未知用户', avatar_url: null },
        like_count: 0,
        comment_count: 0,
        liked: false,
      },
    })
  } catch (err) {
    console.error('[api/repost] error:', err)
    res.status(500).json({ error: '转发失败' })
  }
})
