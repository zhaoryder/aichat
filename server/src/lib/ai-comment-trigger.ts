// =====================================================================
// AI 自动评论触发器
// ---------------------------------------------------------------------
// 当用户评论 AI 作品时，异步触发该 AI creator 回复
// 限流：每个 AI 每小时最多回复 10 条，避免刷屏
// =====================================================================

import { supabase } from './supabase'
import { getAgent } from './agents/agent-orchestrator'

/** 限流记录：ai_creator_id → { count, resetAt } */
const replyLimit = new Map<string, { count: number; resetAt: number }>()

/** 每个 AI 每小时最多回复条数 */
const MAX_REPLIES_PER_HOUR = 10

/**
 * 触发 AI 自动回复评论
 *
 * 调用时机：用户评论 AI 作品后（POST /api/comments 成功后）
 * 执行方式：异步 setImmediate，不阻塞主请求
 *
 * 流程：
 * 1. 查帖子，判断作者是否是 AI（posts.ai_creator_id 不为空）
 * 2. 限流检查（每小时 10 条）
 * 3. 获取 AI agent 实例
 * 4. 执行 reply action（agent 会用 LLM 生成回复内容并写入 comments 表）
 */
export async function triggerAIReply(postId: string, commentId: string): Promise<void> {
  try {
    // 1. 查帖子，判断作者是否是 AI
    const { data: post } = await supabase
      .from('posts')
      .select('id, ai_creator_id, user_id, content')
      .eq('id', postId)
      .maybeSingle()

    if (!post || !post.ai_creator_id) {
      // 非 AI 作品，不触发
      return
    }

    // 2. 限流检查
    const now = Date.now()
    const limit = replyLimit.get(post.ai_creator_id)
    if (limit && now < limit.resetAt && limit.count >= MAX_REPLIES_PER_HOUR) {
      console.log(`[ai-comment-trigger] ${post.ai_creator_id} 已达每小时上限，跳过`)
      return
    }
    if (!limit || now >= limit.resetAt) {
      replyLimit.set(post.ai_creator_id, {
        count: 0,
        resetAt: now + 60 * 60 * 1000, // 1 小时后重置
      })
    }
    replyLimit.get(post.ai_creator_id)!.count++

    // 3. 获取 AI agent 实例
    const agent = await getAgent(post.ai_creator_id)
    if (!agent) {
      console.warn(`[ai-comment-trigger] 未找到 agent: ${post.ai_creator_id}`)
      return
    }

    // 4. 执行 reply action
    const result = await agent.runAction('reply', {
      target: commentId,
      reason: '用户评论了我的作品，需要回复',
    })

    if (result.ok) {
      console.log(`[ai-comment-trigger] ${post.ai_creator_id} 已回复评论 ${commentId}`)
    } else {
      console.warn(`[ai-comment-trigger] ${post.ai_creator_id} 回复失败:`, result.error)
    }
  } catch (err) {
    console.error('[ai-comment-trigger] 异常:', err instanceof Error ? err.message : err)
  }
}
