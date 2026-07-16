// =====================================================================
// Embedding 生成 + 向量推荐
// ---------------------------------------------------------------------
// 为帖子生成 embedding 写入 posts.embedding
// 调用 match_posts_by_embedding RPC 获取个性化推荐
// =====================================================================

import { callAgnesChat } from './ai-client'
import { supabase } from './supabase'

/**
 * 为帖子生成 embedding 并写入 posts.embedding
 * 调用时机：用户发布作品后 / AI 发布作品后
 *
 * 容错策略：embedding 失败不影响发帖，只记录日志
 */
export async function generateAndSaveEmbedding(
  postId: string,
  content: string,
  tags: string[] = [],
): Promise<void> {
  try {
    // Step 1: 用 LLM 把内容压缩为「语义摘要」（避免直接 embedding 长文本）
    const summary = await callAgnesChat(
      '请用一句话总结以下内容的主题和风格，用于语义检索。直接输出总结，不要解释。',
      `内容：${content.slice(0, 500)}\n标签：${tags.join(', ')}`,
    )

    // Step 2: 调用 embedding API（Agnes 兼容 OpenAI embeddings 接口）
    const apiKey = process.env.AGNES_API_KEY
    const apiBase = process.env.AGNES_API_BASE || process.env.AGNES_BASE_URL
    if (!apiKey || !apiBase) {
      console.warn('[embeddings] 缺少 AGNES_API_KEY 或 AGNES_API_BASE')
      return
    }

    const embRes = await fetch(`${apiBase}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: summary || content.slice(0, 200),
      }),
    })

    if (!embRes.ok) {
      const text = await embRes.text().catch(() => '')
      throw new Error(`embedding API ${embRes.status}: ${text.slice(0, 200)}`)
    }

    const embData = (await embRes.json()) as { data?: Array<{ embedding?: number[] }> }
    const embedding = embData.data?.[0]?.embedding
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('embedding 为空或格式错误')
    }

    // Step 3: 写入数据库
    const { error } = await supabase
      .from('posts')
      .update({ embedding })
      .eq('id', postId)

    if (error) {
      console.error('[embeddings] 写入失败:', error.message)
    } else {
      console.log(`[embeddings] 已为帖子 ${postId} 生成 embedding (dim=${embedding.length})`)
    }
  } catch (err) {
    console.error('[embeddings] 生成失败:', err instanceof Error ? err.message : err)
    // 不抛错，embedding 失败不影响发帖
  }
}

/**
 * 调用 match_posts_by_embedding RPC 获取相似帖子
 *
 * 推荐策略：
 * 1. 取用户最近 5 条点赞/评论过的帖子，作为兴趣向量源
 * 2. 用第一条有 embedding 的帖子作为查询向量
 * 3. 调用 RPC 获取相似帖子
 *
 * 冷启动：无交互记录或无 embedding 时返回空数组，由上层兜底
 */
export async function getRecommendedPosts(
  userId: string,
  limit: number = 10,
  excludePostIds: string[] = [],
): Promise<any[]> {
  try {
    // 1. 获取用户最近点赞过的帖子（作为兴趣向量源）
    const { data: likedPosts } = await supabase
      .from('likes')
      .select('post_id, posts!inner(id, embedding)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    // 也查评论过的帖子
    const { data: commentedPosts } = await supabase
      .from('comments')
      .select('post_id, posts!inner(id, embedding)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    const interactions = [
      ...(likedPosts || []).map((l: any) => l.posts),
      ...(commentedPosts || []).map((c: any) => c.posts),
    ].filter((p) => p?.embedding)

    if (interactions.length === 0) {
      // 冷启动：返回空，让 feed 兜底用时间倒序
      return []
    }

    // 2. 取第一条有 embedding 的帖子作为查询向量（简化版）
    const queryPost = interactions[0]
    if (!queryPost?.embedding) return []

    // 3. 调用 RPC
    const { data, error } = await supabase.rpc('match_posts_by_embedding', {
      query_embedding: queryPost.embedding,
      match_count: limit + excludePostIds.length,
      exclude_user_id: userId,
    })

    if (error) {
      console.error('[embeddings] RPC 失败:', error.message)
      return []
    }

    // 4. 过滤掉已排除的帖子
    const result = (data || []).filter((p: any) => !excludePostIds.includes(p.id))
    return result.slice(0, limit)
  } catch (err) {
    console.error('[embeddings] getRecommendedPosts 失败:', err instanceof Error ? err.message : err)
    return []
  }
}
