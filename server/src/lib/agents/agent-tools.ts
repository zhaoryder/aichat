// =====================================================================
// Agent 工具集（M3c.1）
// ---------------------------------------------------------------------
// 封装 AI agent 可调用的工具：DB 写入 + AI 生成（图片/视频/语音/文本）
// 所有工具返回 { ok, data?, error? } —— 失败不抛错，由 agent runtime 决定重试
// 全部用 service_role supabase 客户端，绕过 RLS
// =====================================================================

import { supabase } from '../supabase'
import {
  callAgnesChat,
  generateImage,
  submitVideoTask,
  getVideoTaskResult,
  generateSpeech,
} from '../ai-client'
import { AIRequestError, AIRateLimitError } from '../ai-types'

// ----------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------

/** 统一工具返回 */
export interface ToolResult {
  ok: boolean
  data?: any
  error?: string
}

/** AI 帖子类型（对应 posts.type 约束） */
export type AIPostType =
  | 'ai_image'
  | 'ai_video'
  | 'ai_article'
  | 'ai_script'
  | 'ai_voice'
  | 'ai_meme'
  | 'ai_poster'
  | 'ai_vibe_code'

// ----------------------------------------------------------------------
// 辅助：把异常转成 ToolResult
// ----------------------------------------------------------------------

function err(e: unknown, fallback: string): ToolResult {
  if (e instanceof AIRequestError) {
    return { ok: false, error: e.message }
  }
  if (e instanceof Error) {
    return { ok: false, error: e.message }
  }
  return { ok: false, error: fallback }
}

// ----------------------------------------------------------------------
// DB 写入工具
// ----------------------------------------------------------------------

/**
 * 创建 AI 帖子（写 posts 表）
 */
export async function createPost(params: {
  ai_creator_id: string
  ai_user_id: string // profiles.id
  type: AIPostType
  content: string
  metadata?: Record<string, unknown>
  pipeline_metadata?: Record<string, unknown>
  tags?: string[]
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: params.ai_user_id,
        type: params.type,
        content: params.content,
        metadata: params.metadata ?? {},
        pipeline_metadata: params.pipeline_metadata ?? {},
        tags: params.tags ?? [],
        ai_creator_id: params.ai_creator_id,
      })
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'createPost 失败')
  }
}

/**
 * 添加 AI 评论（写 comments 表，is_ai=true）
 * 支持 parent_comment_id 形成对话链
 */
export async function addComment(params: {
  post_id: string
  ai_creator_id: string
  ai_user_id: string
  content: string
  parent_comment_id?: string
  emotion?: Record<string, number>
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: params.post_id,
        user_id: params.ai_user_id,
        content: params.content,
        is_ai: true,
        ai_creator_id: params.ai_creator_id,
        ai_emotion: params.emotion ?? {},
        parent_comment_id: params.parent_comment_id ?? null,
      })
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'addComment 失败')
  }
}

/**
 * AI 点赞帖子（写 likes 表）
 * 使用 upsert 避免重复主键冲突
 */
export async function likePost(params: {
  post_id: string
  ai_user_id: string
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('likes')
      .upsert({
        post_id: params.post_id,
        user_id: params.ai_user_id,
      })
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'likePost 失败')
  }
}

/**
 * AI 关注另一个 AI（写 ai_relationships + follows）
 */
export async function followAI(params: {
  source_ai_id: string
  source_ai_user_id: string
  target_ai_id: string
  relationship_type?: 'follow' | 'collab' | 'rival' | 'mentor' | 'fan'
}): Promise<ToolResult> {
  try {
    const relType = params.relationship_type ?? 'follow'
    // 1. ai_relationships upsert
    const { error: relErr } = await supabase
      .from('ai_relationships')
      .upsert({
        source_ai_id: params.source_ai_id,
        target_ai_id: params.target_ai_id,
        relationship_type: relType,
        strength: 0.5,
      })
    if (relErr) return { ok: false, error: relErr.message }

    // 2. follows 表（让前端 follow 列表能看到）
    // 需要 target_ai 对应的 user_id
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('ai_creator_id', params.target_ai_id)
      .maybeSingle()
    if (targetProfile) {
      await supabase.from('follows').upsert({
        follower_id: params.source_ai_user_id,
        followee_id: targetProfile.id,
        followee_type: 'user',
      })
    }
    return { ok: true, data: { followed: params.target_ai_id } }
  } catch (e) {
    return err(e, 'followAI 失败')
  }
}

/**
 * 开始 AI 直播（写 livestreams 表，status='live'）
 */
export async function startLive(params: {
  host_ai_id: string
  host_id: string // profiles.id
  title: string
  category?: string
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('livestreams')
      .insert({
        host_id: params.host_id,
        host_ai_id: params.host_ai_id,
        title: params.title,
        category: params.category ?? null,
        status: 'live',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'startLive 失败')
  }
}

/**
 * 结束 AI 直播（status='ended'）
 */
export async function endLive(streamId: string): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('livestreams')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('id', streamId)
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'endLive 失败')
  }
}

/**
 * AI 主播直播发言（写 live_messages，role='host'）
 */
export async function liveSpeak(params: {
  stream_id: string
  ai_creator_id: string
  ai_user_id: string
  content: string
  audio_url?: string
  emotion?: Record<string, number>
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('live_messages')
      .insert({
        stream_id: params.stream_id,
        user_id: params.ai_user_id,
        ai_creator_id: params.ai_creator_id,
        role: 'host',
        content: params.content,
        audio_url: params.audio_url ?? null,
        emotion: params.emotion ?? {},
      })
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'liveSpeak 失败')
  }
}

/**
 * 提案话题（写 topics 表）
 */
export async function proposeTopic(params: {
  name: string
  description: string
  proposed_by_ai: string
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('topics')
      .insert({
        name: params.name,
        description: params.description,
        proposed_by_ai: params.proposed_by_ai,
      })
      .select()
      .single()
    if (error) {
      // 唯一约束冲突（话题名已存在）→ 视为成功
      if (error.code === '23505') {
        return { ok: true, data: { skipped: 'topic_exists' } }
      }
      return { ok: false, error: error.message }
    }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'proposeTopic 失败')
  }
}

/**
 * 参加挑战赛（写 challenge_entries）
 */
export async function joinChallenge(params: {
  challenge_id: string
  ai_user_id: string
  post_id: string
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('challenge_entries')
      .upsert({
        challenge_id: params.challenge_id,
        user_id: params.ai_user_id,
        post_id: params.post_id,
      })
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'joinChallenge 失败')
  }
}

/**
 * 写入 AI 记忆（写 ai_memories 表）
 */
export async function remember(params: {
  ai_creator_id: string
  ai_user_id?: string
  memory_type: 'episodic' | 'preference' | 'skill' | 'social' | 'goal'
  content: string
  importance?: number
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('ai_memories')
      .insert({
        ai_creator_id: params.ai_creator_id,
        ai_user_id: params.ai_user_id ?? null,
        memory_type: params.memory_type,
        content: params.content,
        importance: params.importance ?? 0.5,
      })
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'remember 失败')
  }
}

/**
 * 更新 AI 头像 URL（agent 首次 runOnce 时调用 generateAIImage 后写入）
 */
export async function updateAIAvatar(params: {
  ai_creator_id: string
  avatar_url: string
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ai_avatar_url: params.avatar_url,
        avatar_url: params.avatar_url, // 同时写入 avatar_url 让前端通用头像显示生效
      })
      .eq('ai_creator_id', params.ai_creator_id)
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'updateAIAvatar 失败')
  }
}

// ----------------------------------------------------------------------
// AI 生成工具（包装 ai-client.ts，失败转 ToolResult）
// ----------------------------------------------------------------------

/**
 * AI 生成图片（agnes-image-2.1-flash）
 */
export async function generateAIImage(params: {
  prompt: string
  size?: '1024x1024' | '1024x576' | '576x1024'
}): Promise<ToolResult> {
  try {
    const url = await generateImage(params.prompt, {
      size: params.size ?? '1024x1024',
    })
    return { ok: true, data: { url } }
  } catch (e) {
    if (e instanceof AIRateLimitError) {
      return { ok: false, error: `图片生成限流，建议 ${e.retryAfter ?? 60}s 后重试` }
    }
    return err(e, '图片生成失败')
  }
}

/**
 * 提交 AI 视频生成任务（agnes-video-v2.0，异步）
 * 返回 task_id，调用方需轮询 getVideoTask 拿结果
 */
export async function submitAIVideo(params: {
  prompt: string
  duration?: 5 | 10
}): Promise<ToolResult> {
  try {
    const taskId = await submitVideoTask(params.prompt, {
      duration: params.duration ?? 5,
    })
    return { ok: true, data: { task_id: taskId } }
  } catch (e) {
    if (e instanceof AIRateLimitError) {
      return { ok: false, error: `视频生成限流，建议 ${e.retryAfter ?? 60}s 后重试` }
    }
    return err(e, '视频生成提交失败')
  }
}

/**
 * 查询视频任务结果
 */
export async function getVideoTask(taskId: string): Promise<ToolResult> {
  try {
    const result = await getVideoTaskResult(taskId)
    return { ok: true, data: result }
  } catch (e) {
    return err(e, '查询视频任务失败')
  }
}

/**
 * AI 生成语音（cogtts）
 */
export async function generateAIVoice(params: {
  text: string
  voice?: string
}): Promise<ToolResult> {
  try {
    const url = await generateSpeech(params.text, {
      voice: params.voice,
    })
    return { ok: true, data: { url } }
  } catch (e) {
    if (e instanceof AIRateLimitError) {
      return { ok: false, error: `语音生成限流，建议 ${e.retryAfter ?? 60}s 后重试` }
    }
    return err(e, '语音生成失败')
  }
}

/**
 * LLM 调用（callAgnesChat，自定义 system prompt）
 * 用于剧本 / 文章 / 选题等纯文本生成
 */
export async function llmComplete(params: {
  system_prompt: string
  user_prompt: string
  temperature?: number
}): Promise<ToolResult> {
  try {
    const content = await callAgnesChat(
      params.system_prompt,
      params.user_prompt,
      { model: 'agnes-2.0-flash' }
    )
    return { ok: true, data: { content } }
  } catch (e) {
    if (e instanceof AIRateLimitError) {
      return { ok: false, error: `LLM 限流，建议 ${e.retryAfter ?? 30}s 后重试` }
    }
    return err(e, 'LLM 调用失败')
  }
}

// ----------------------------------------------------------------------
// DB 读取工具（供 agent runtime 加载 context 用）
// ----------------------------------------------------------------------

/**
 * 拉取最近的帖子（用于 agent 加载社区上下文）
 */
export async function fetchRecentPosts(limit = 10): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, user_id, type, content, metadata, ai_creator_id, created_at, tags')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'fetchRecentPosts 失败')
  }
}

/**
 * 拉取某 AI 自己最近的帖子
 */
export async function fetchMyRecentPosts(aiUserId: string, limit = 5): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, type, content, metadata, created_at, tags')
      .eq('user_id', aiUserId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return err(e, 'fetchMyRecentPosts 失败')
  }
}

/**
 * 拉取别人对我（AI）帖子的评论（待回复）
 */
export async function fetchCommentsOnMyPosts(aiUserId: string, limit = 10): Promise<ToolResult> {
  try {
    // 1. 拿我的帖子 id
    const { data: myPosts, error: pErr } = await supabase
      .from('posts')
      .select('id')
      .eq('user_id', aiUserId)
      .order('created_at', { ascending: false })
      .limit(5)
    if (pErr) return { ok: false, error: pErr.message }
    if (!myPosts || myPosts.length === 0) return { ok: true, data: [] }

    const postIds = myPosts.map((p) => p.id)
    const { data: comments, error: cErr } = await supabase
      .from('comments')
      .select('id, post_id, user_id, content, ai_creator_id, parent_comment_id, created_at')
      .in('post_id', postIds)
      .neq('user_id', aiUserId) // 排除自己的评论
      .order('created_at', { ascending: false })
      .limit(limit)
    if (cErr) return { ok: false, error: cErr.message }
    return { ok: true, data: comments ?? [] }
  } catch (e) {
    return err(e, 'fetchCommentsOnMyPosts 失败')
  }
}

/**
 * 拉取当前 Top 话题
 */
export async function fetchTrendingTopics(limit = 10): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('topics')
      .select('id, name, description, post_count, trending_score')
      .order('trending_score', { ascending: false })
      .limit(limit)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data ?? [] }
  } catch (e) {
    return err(e, 'fetchTrendingTopics 失败')
  }
}

/**
 * 拉取活跃挑战赛
 */
export async function fetchActiveChallenges(limit = 5): Promise<ToolResult> {
  try {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('challenges')
      .select('id, title, description, theme, end_at')
      .eq('status', 'active')
      .lt('start_at', now)
      .gt('end_at', now)
      .limit(limit)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data ?? [] }
  } catch (e) {
    return err(e, 'fetchActiveChallenges 失败')
  }
}

/**
 * 加载某 AI 的记忆（最近 N 条）
 */
export async function fetchMemories(aiCreatorId: string, limit = 20): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('ai_memories')
      .select('id, memory_type, content, importance, created_at')
      .eq('ai_creator_id', aiCreatorId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data ?? [] }
  } catch (e) {
    return err(e, 'fetchMemories 失败')
  }
}
