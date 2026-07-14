// =====================================================================
// Supabase 业务查询函数封装
// ---------------------------------------------------------------------
// 从 lib/supabase/queries.ts 迁移，适配 Express 后端。
// 所有函数使用 service_role 客户端（绕过 RLS）。
// 函数命名按任务要求：createForumTopic / createForumPost / listForumTopics /
// listForumPosts 等。新增 createShare /
// getShare / listUsers / listReports / createReport / updateReportStatus /
// getResolvedAgent。
// =====================================================================

import { supabase } from './supabase'
import { getAgentById, type AgentConfig } from '../../shared/agents'
import type {
  Agent,
  AgentFavorite,
  AgentTeam,
  ChatRoom,
  Conversation,
  CreativeWork,
  CustomAgent,
  ForumPost,
  ForumRating,
  ForumTopic,
  GameSave,
  MediaAsset,
  Message,
  MessageRole,
  ModerationKeyword,
  Profile,
  ProjectSnapshot,
  Report,
  ReportStatus,
  ReportTargetType,
  RoomMessage,
  RoomParticipant,
  SharedConversation,
  UserTheme,
} from '../../shared/types'

// ---------------------------------------------------------------------
// 对话相关
// ---------------------------------------------------------------------

/** 创建一条新对话 */
export async function createConversation(
  userId: string,
  agentId: string,
  title?: string
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      agent_id: agentId,
      title: title ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`创建对话失败: ${error?.message ?? '未知错误'}`)
  }
  return data as Conversation
}

/** 根据 id 获取对话 */
export async function getConversationById(
  id: string
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`获取对话失败: ${error.message}`)
  }
  return (data as Conversation) ?? null
}

/** 列出指定用户的所有对话，按更新时间倒序 */
export async function getUserConversations(
  userId: string
): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`列出对话失败: ${error.message}`)
  }
  return (data as Conversation[]) ?? []
}

/** 在对话中追加一条消息 */
export async function addMessage(
  conversationId: string,
  role: MessageRole,
  content: string
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`追加消息失败: ${error?.message ?? '未知错误'}`)
  }
  return data as Message
}

/** 列出指定对话的所有消息，按创建时间正序 */
export async function listMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`列出消息失败: ${error.message}`)
  }
  return (data as Message[]) ?? []
}

// ---------------------------------------------------------------------
// 论坛相关
// ---------------------------------------------------------------------

/** 创建论坛话题 */
export async function createForumTopic(
  authorId: string,
  title: string,
  content: string,
  mentionedAgents: string[],
  projectPayload?: {
    code?: string
    title?: string
    assets?: string[]
  } | null
): Promise<ForumTopic> {
  const { data, error } = await supabase
    .from('forum_topics')
    .insert({
      author_id: authorId,
      title,
      content,
      mentioned_agents: mentionedAgents,
      project_payload: projectPayload ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`创建话题失败: ${error?.message ?? '未知错误'}`)
  }
  return data as ForumTopic
}

/** 分页列出论坛话题，并返回总数 */
export async function listForumTopics(
  page: number,
  pageSize: number
): Promise<{ data: ForumTopic[]; total: number }> {
  const safePage = Math.max(1, page)
  const safePageSize = Math.max(1, pageSize)
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  const { data, count, error } = await supabase
    .from('forum_topics')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(`列出话题失败: ${error.message}`)
  }
  return {
    data: (data as ForumTopic[]) ?? [],
    total: count ?? 0,
  }
}

/** 根据 id 获取话题 */
export async function getTopicById(id: string): Promise<ForumTopic | null> {
  const { data, error } = await supabase
    .from('forum_topics')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`获取话题失败: ${error.message}`)
  }
  return (data as ForumTopic) ?? null
}

/** 在话题下追加一条回帖（支持用户和 AI 两种作者） */
export async function createForumPost(
  topicId: string,
  authorId: string | null,
  authorType: 'user' | 'agent',
  content: string,
  agentId?: string
): Promise<ForumPost> {
  const { data, error } = await supabase
    .from('forum_posts')
    .insert({
      topic_id: topicId,
      author_id: authorType === 'agent' ? null : authorId,
      author_type: authorType,
      agent_id: agentId ?? null,
      content,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`创建回帖失败: ${error?.message ?? '未知错误'}`)
  }
  return data as ForumPost
}

/** 列出指定话题下的所有回帖，按创建时间正序 */
export async function listForumPosts(topicId: string): Promise<ForumPost[]> {
  const { data, error } = await supabase
    .from('forum_posts')
    .select('*')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`列出回帖失败: ${error.message}`)
  }
  return (data as ForumPost[]) ?? []
}

/** 递增话题浏览数（select-then-update，并发下有少量误差可接受） */
export async function incrementTopicViews(id: string): Promise<void> {
  const { data } = await supabase
    .from('forum_topics')
    .select('views')
    .eq('id', id)
    .maybeSingle()

  if (!data) return

  await supabase
    .from('forum_topics')
    .update({ views: (data.views as number) + 1 })
    .eq('id', id)
}

// ---------------------------------------------------------------------
// 智能体相关
// ---------------------------------------------------------------------

/** 从数据库拉取所有智能体 */
export async function listAgents(): Promise<Agent[]> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`列出智能体失败: ${error.message}`)
  }
  return (data as Agent[]) ?? []
}

/** 根据 id 从数据库拉取单个智能体 */
export async function getAgentByIdFromDb(id: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`获取智能体失败: ${error.message}`)
  }
  return (data as Agent) ?? null
}

/**
 * 解析智能体：先查官方 agents 数组，再查 custom_agents 表。
 * 返回统一 AgentConfig 格式，用于对话页等需要支持自定义智能体的场景。
 */
export async function getResolvedAgent(
  agentId: string
): Promise<AgentConfig | null> {
  // 1. 先查官方
  const official = getAgentById(agentId)
  if (official) return official

  // 2. 查自定义智能体
  const custom = await getCustomAgentById(agentId)
  if (!custom) return null

  // 转换为 AgentConfig
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
// 审核相关
// ---------------------------------------------------------------------

/** 列出所有审核关键词 */
export async function listModerationKeywords(): Promise<ModerationKeyword[]> {
  const { data, error } = await supabase
    .from('moderation_keywords')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`列出审核关键词失败: ${error.message}`)
  }
  return (data as ModerationKeyword[]) ?? []
}

// ---------------------------------------------------------------------
// 用户相关
// ---------------------------------------------------------------------

/** 获取指定用户的 profile */
export async function getUserProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`获取用户资料失败: ${error.message}`)
  }
  return (data as Profile) ?? null
}

/** 更新用户资料（仅 nickname 与 avatar_url） */
export async function updateUserProfile(
  userId: string,
  updates: { nickname?: string; avatar_url?: string }
): Promise<void> {
  const patch: Record<string, string> = {}
  if (updates.nickname !== undefined) patch.nickname = updates.nickname
  if (updates.avatar_url !== undefined) patch.avatar_url = updates.avatar_url

  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)

  if (error) {
    throw new Error(`更新用户资料失败: ${error.message}`)
  }
}

/** 判断指定用户是否当前处于封禁状态（banned_until 在未来） */
export async function isUserBanned(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('banned_until')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    return false
  }

  const bannedUntil = data.banned_until as string | null
  if (!bannedUntil) return false

  return new Date(bannedUntil).getTime() > Date.now()
}

/** 封禁用户直至指定时间 */
export async function banUser(userId: string, until: Date): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ banned_until: until.toISOString() })
    .eq('id', userId)

  if (error) {
    throw new Error(`封禁用户失败: ${error.message}`)
  }
}

/** 解封用户（将 banned_until 置为 null） */
export async function unbanUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ banned_until: null })
    .eq('id', userId)

  if (error) {
    throw new Error(`解封用户失败: ${error.message}`)
  }
}

/** 列出所有用户资料（管理员用） */
export async function listUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`列出用户失败: ${error.message}`)
  }
  return (data as Profile[]) ?? []
}

// ---------------------------------------------------------------------
// 自定义智能体相关
// ---------------------------------------------------------------------

/** 创建自定义智能体 */
export async function createCustomAgent(
  creatorId: string,
  data: {
    name: string
    description: string
    personality: string
    systemPrompt: string
    avatarGradient: string
    visibility: 'private' | 'public'
  }
): Promise<CustomAgent> {
  const { data: row, error } = await supabase
    .from('custom_agents')
    .insert({
      creator_id: creatorId,
      name: data.name,
      description: data.description,
      personality: data.personality,
      system_prompt: data.systemPrompt,
      avatar_gradient: data.avatarGradient,
      visibility: data.visibility,
    })
    .select('*')
    .single()
  if (error || !row) {
    throw new Error(`创建智能体失败: ${error?.message}`)
  }
  return row as CustomAgent
}

/** 列出指定用户创建的所有自定义智能体，按创建时间倒序 */
export async function listCustomAgentsByCreator(
  userId: string
): Promise<CustomAgent[]> {
  const { data, error } = await supabase
    .from('custom_agents')
    .select('*')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`查询失败: ${error.message}`)
  return (data as CustomAgent[]) ?? []
}

/** 根据 id 获取自定义智能体 */
export async function getCustomAgentById(
  id: string
): Promise<CustomAgent | null> {
  const { data, error } = await supabase
    .from('custom_agents')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`查询失败: ${error.message}`)
  return (data as CustomAgent) ?? null
}

/** 列出所有公开且 active 的自定义智能体，按创建时间倒序 */
export async function listPublicCustomAgents(): Promise<CustomAgent[]> {
  const { data, error } = await supabase
    .from('custom_agents')
    .select('*')
    .eq('visibility', 'public')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`查询失败: ${error.message}`)
  return (data as CustomAgent[]) ?? []
}

/** 更新自定义智能体 */
export async function updateCustomAgent(
  id: string,
  updates: {
    name?: string
    description?: string
    personality?: string
    system_prompt?: string
    avatar_gradient?: string
    visibility?: 'private' | 'public'
  }
): Promise<void> {
  const { error } = await supabase
    .from('custom_agents')
    .update(updates)
    .eq('id', id)
  if (error) throw new Error(`更新失败: ${error.message}`)
}

/** 删除自定义智能体 */
export async function deleteCustomAgent(id: string): Promise<void> {
  const { error } = await supabase
    .from('custom_agents')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`删除失败: ${error.message}`)
}

// ---------------------------------------------------------------------
// 智能体收藏相关
// ---------------------------------------------------------------------

/** 切换智能体收藏状态：已收藏则取消，未收藏则添加。返回 true 表示已收藏 */
export async function toggleFavorite(
  userId: string,
  agentId: string,
  agentType: 'official' | 'custom'
): Promise<boolean> {
  const { data } = await supabase
    .from('agent_favorites')
    .select('*')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .eq('agent_type', agentType)
    .maybeSingle()
  if (data) {
    await supabase
      .from('agent_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .eq('agent_type', agentType)
    return false
  } else {
    await supabase
      .from('agent_favorites')
      .insert({
        user_id: userId,
        agent_id: agentId,
        agent_type: agentType,
      })
    return true
  }
}

/** 列出指定用户的所有智能体收藏，按创建时间倒序 */
export async function listFavorites(userId: string): Promise<AgentFavorite[]> {
  const { data, error } = await supabase
    .from('agent_favorites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`查询收藏失败: ${error.message}`)
  return (data as AgentFavorite[]) ?? []
}

/** 判断指定智能体是否已被用户收藏 */
export async function isFavorited(
  userId: string,
  agentId: string,
  agentType: 'official' | 'custom'
): Promise<boolean> {
  const { data } = await supabase
    .from('agent_favorites')
    .select('*')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .eq('agent_type', agentType)
    .maybeSingle()
  return !!data
}

// ---------------------------------------------------------------------
// 创意作品相关
// ---------------------------------------------------------------------

/** 创建创意作品记录 */
export async function createCreativeWork(
  creatorId: string,
  type: CreativeWork['type'],
  title: string,
  input: Record<string, unknown>
): Promise<CreativeWork> {
  const { data, error } = await supabase
    .from('creative_works')
    .insert({
      creator_id: creatorId,
      type,
      title,
      input,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`创建作品失败: ${error?.message}`)
  }
  return data as CreativeWork
}

/** 列出指定用户创建的所有创意作品，按创建时间倒序 */
export async function listCreativeWorksByCreator(
  userId: string
): Promise<CreativeWork[]> {
  const { data, error } = await supabase
    .from('creative_works')
    .select('*')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`查询作品失败: ${error.message}`)
  return (data as CreativeWork[]) ?? []
}

/** 根据 id 获取创意作品 */
export async function getCreativeWorkById(
  id: string
): Promise<CreativeWork | null> {
  const { data, error } = await supabase
    .from('creative_works')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`查询作品失败: ${error.message}`)
  return (data as CreativeWork) ?? null
}

/** 更新创意作品（写入结果 / 更新状态 / 追加 input 字段） */
export async function updateCreativeWork(
  id: string,
  updates: {
    result?: Record<string, unknown>
    status?: CreativeWork['status']
    input?: Record<string, unknown>
  }
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (updates.result !== undefined) patch.result = updates.result
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.input !== undefined) patch.input = updates.input
  const { error } = await supabase
    .from('creative_works')
    .update(patch)
    .eq('id', id)
  if (error) throw new Error(`更新作品失败: ${error.message}`)
}

// ---------------------------------------------------------------------
// 游戏存档相关
// ---------------------------------------------------------------------

/** 创建一条游戏存档 */
export async function createGameSave(
  userId: string,
  gameType: string,
  title: string,
  state: Record<string, unknown>
): Promise<GameSave> {
  const { data, error } = await supabase
    .from('game_saves')
    .insert({
      user_id: userId,
      game_type: gameType,
      title,
      state,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`创建存档失败: ${error?.message ?? '未知错误'}`)
  }
  return data as GameSave
}

/** 列出指定用户的所有游戏存档，按更新时间倒序 */
export async function listGameSaves(userId: string): Promise<GameSave[]> {
  const { data, error } = await supabase
    .from('game_saves')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`查询存档失败: ${error.message}`)
  return (data as GameSave[]) ?? []
}

/** 根据 id 获取游戏存档 */
export async function getGameSaveById(id: string): Promise<GameSave | null> {
  const { data, error } = await supabase
    .from('game_saves')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`获取存档失败: ${error.message}`)
  return (data as GameSave) ?? null
}

/** 更新游戏存档状态 */
export async function updateGameSave(
  id: string,
  state: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('game_saves')
    .update({ state, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`更新存档失败: ${error.message}`)
}

/** 删除游戏存档 */
export async function deleteGameSave(id: string): Promise<void> {
  const { error } = await supabase
    .from('game_saves')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`删除存档失败: ${error.message}`)
}

// ---------------------------------------------------------------------
// 对话分享相关
// ---------------------------------------------------------------------

/** 创建对话分享记录，返回含 slug 的记录 */
export async function createShare(
  conversationId: string,
  creatorId: string
): Promise<SharedConversation> {
  const { data, error } = await supabase
    .from('shared_conversations')
    .insert({
      conversation_id: conversationId,
      creator_id: creatorId,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`创建分享失败: ${error?.message ?? '未知错误'}`)
  }
  return data as SharedConversation
}

/** 根据 slug 获取分享记录 */
export async function getShare(slug: string): Promise<SharedConversation | null> {
  const { data, error } = await supabase
    .from('shared_conversations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    throw new Error(`获取分享失败: ${error.message}`)
  }
  return (data as SharedConversation) ?? null
}

// ---------------------------------------------------------------------
// 举报相关
// ---------------------------------------------------------------------

/** 列出所有举报记录（管理员用） */
export async function listReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`列出举报失败: ${error.message}`)
  return (data as Report[]) ?? []
}

/** 创建举报记录 */
export async function createReport(
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string,
  reason?: string
): Promise<Report> {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      reason: reason ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`创建举报失败: ${error?.message ?? '未知错误'}`)
  }
  return data as Report
}

/** 更新举报状态（管理员用） */
export async function updateReportStatus(
  id: string,
  status: ReportStatus
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(`更新举报状态失败: ${error.message}`)
}

// ---------------------------------------------------------------------
// 素材库（media_assets）相关
// ---------------------------------------------------------------------

/** 新增一条素材记录 */
export async function addMediaAsset(input: {
  userId: string
  type: 'image' | 'video' | 'audio'
  url: string
  prompt?: string | null
  title?: string | null
  projectId?: string | null
  metadata?: Record<string, unknown>
}): Promise<MediaAsset> {
  const { data, error } = await supabase
    .from('media_assets')
    .insert({
      user_id: input.userId,
      type: input.type,
      url: input.url,
      prompt: input.prompt ?? null,
      title: input.title ?? null,
      project_id: input.projectId ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`新增素材失败: ${error?.message ?? '未知错误'}`)
  }
  return data as MediaAsset
}

/** 列出当前用户的素材（按类型筛选 + 时间倒序） */
export async function listMediaAssets(
  userId: string,
  options?: {
    type?: 'image' | 'video' | 'audio'
    page?: number
    pageSize?: number
    search?: string
  }
): Promise<{ assets: MediaAsset[]; total: number }> {
  const page = Math.max(1, options?.page ?? 1)
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? 20, 100))
  const from = (page - 1) * pageSize
  const to = page * pageSize - 1

  let query = supabase
    .from('media_assets')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  if (options?.type) {
    query = query.eq('type', options.type)
  }
  if (options?.search) {
    const like = `%${options.search}%`
    query = query.or(`prompt.ilike.${like},title.ilike.${like}`)
  }
  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(`列出素材失败: ${error.message}`)
  return {
    assets: (data as MediaAsset[]) ?? [],
    total: count ?? 0,
  }
}

/** 删除一条素材（必须匹配 userId 防止越权） */
export async function deleteMediaAsset(
  id: string,
  userId: string
): Promise<boolean> {
  const { error, count } = await supabase
    .from('media_assets')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw new Error(`删除素材失败: ${error.message}`)
  return (count ?? 0) > 0
}

// ---------------------------------------------------------------------
// agent_teams（多智能体团队）相关
// ---------------------------------------------------------------------

/** 创建一个智能体团队 */
export async function createAgentTeam(
  userId: string,
  name: string,
  agentIds: string[],
  config: Record<string, unknown> = {},
): Promise<AgentTeam> {
  const { data, error } = await supabase
    .from('agent_teams')
    .insert({
      user_id: userId,
      name,
      agent_ids: agentIds,
      config,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`创建团队失败: ${error?.message ?? '未知错误'}`)
  }
  return data as AgentTeam
}

/** 列出当前用户的智能体团队 */
export async function listAgentTeams(userId: string): Promise<AgentTeam[]> {
  const { data, error } = await supabase
    .from('agent_teams')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`列出团队失败: ${error.message}`)
  return (data as AgentTeam[]) ?? []
}

/** 获取团队详情（含所属校验） */
export async function getAgentTeam(
  id: string,
  userId: string,
): Promise<AgentTeam | null> {
  const { data, error } = await supabase
    .from('agent_teams')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`获取团队失败: ${error.message}`)
  return (data as AgentTeam) ?? null
}

// ---------------------------------------------------------------------
// project_snapshots（Vibe Code 快照）相关
// ---------------------------------------------------------------------

/** 创建快照 */
export async function createSnapshot(input: {
  projectId: string
  userId: string
  code: string
  label?: string | null
  parentId?: string | null
  branch?: string
}): Promise<ProjectSnapshot> {
  const { data, error } = await supabase
    .from('project_snapshots')
    .insert({
      project_id: input.projectId,
      user_id: input.userId,
      code: input.code,
      label: input.label ?? null,
      parent_id: input.parentId ?? null,
      branch: input.branch ?? 'main',
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`创建快照失败: ${error?.message ?? '未知错误'}`)
  }
  return data as ProjectSnapshot
}

/** 列出指定项目 + 分支的快照时间线 */
export async function listSnapshots(
  projectId: string,
  userId: string,
  branch?: string,
): Promise<ProjectSnapshot[]> {
  let query = supabase
    .from('project_snapshots')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
  if (branch) {
    query = query.eq('branch', branch)
  }
  query = query.order('created_at', { ascending: false })
  const { data, error } = await query
  if (error) throw new Error(`列出快照失败: ${error.message}`)
  return (data as ProjectSnapshot[]) ?? []
}

/** 获取单条快照 */
export async function getSnapshot(
  id: string,
  userId: string,
): Promise<ProjectSnapshot | null> {
  const { data, error } = await supabase
    .from('project_snapshots')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`获取快照失败: ${error.message}`)
  return (data as ProjectSnapshot) ?? null
}

/** "回退"到指定快照：基于该快照创建一个新的当前状态快照（不删除历史） */
export async function restoreSnapshot(
  id: string,
  userId: string,
): Promise<ProjectSnapshot> {
  const original = await getSnapshot(id, userId)
  if (!original) {
    throw new Error('快照不存在或无权访问')
  }
  return await createSnapshot({
    projectId: original.project_id,
    userId,
    code: original.code,
    label: `restore-from-${original.id.slice(0, 8)}`,
    parentId: original.id,
    branch: original.branch,
  })
}

// ---------------------------------------------------------------------
// chat_rooms / room_participants / room_messages（联机房间）相关
// ---------------------------------------------------------------------

/** 创建房间 */
export async function createRoom(
  hostId: string,
  name: string,
  agentId: string,
): Promise<ChatRoom> {
  const { data, error } = await supabase
    .from('chat_rooms')
    .insert({ host_id: hostId, name, agent_id: agentId })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`创建房间失败: ${error?.message ?? '未知错误'}`)
  }
  return data as ChatRoom
}

/** 列出活跃房间 */
export async function listActiveRooms(): Promise<ChatRoom[]> {
  const { data, error } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`列出房间失败: ${error.message}`)
  return (data as ChatRoom[]) ?? []
}

/** 获取房间详情 */
export async function getRoom(id: string): Promise<ChatRoom | null> {
  const { data, error } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`获取房间失败: ${error.message}`)
  return (data as ChatRoom) ?? null
}

/** 加入房间（idempotent） */
export async function joinRoom(
  roomId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('room_participants')
    .upsert({ room_id: roomId, user_id: userId })
  if (error) throw new Error(`加入房间失败: ${error.message}`)
}

/** 离开房间 */
export async function leaveRoom(
  roomId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('room_participants')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId)
  if (error) throw new Error(`离开房间失败: ${error.message}`)
}

/** 列出房间参与者 */
export async function listRoomParticipants(
  roomId: string,
): Promise<RoomParticipant[]> {
  const { data, error } = await supabase
    .from('room_participants')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true })
  if (error) throw new Error(`列出参与者失败: ${error.message}`)
  return (data as RoomParticipant[]) ?? []
}

/** 列出房间历史消息 */
export async function listRoomMessages(
  roomId: string,
  limit = 100,
): Promise<RoomMessage[]> {
  const { data, error } = await supabase
    .from('room_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`列出房间消息失败: ${error.message}`)
  return (data as RoomMessage[]) ?? []
}

/** 写入一条房间消息 */
export async function addRoomMessage(input: {
  roomId: string
  userId: string | null
  role: 'user' | 'assistant'
  content: string
  agentId?: string | null
}): Promise<RoomMessage> {
  const { data, error } = await supabase
    .from('room_messages')
    .insert({
      room_id: input.roomId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      agent_id: input.agentId ?? null,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`写入房间消息失败: ${error?.message ?? '未知错误'}`)
  }
  return data as RoomMessage
}

/** 关闭房间（仅房主） */
export async function closeRoom(
  roomId: string,
  hostId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_rooms')
    .update({ status: 'closed' })
    .eq('id', roomId)
    .eq('host_id', hostId)
  if (error) throw new Error(`关闭房间失败: ${error.message}`)
}

/** 房主踢人 */
export async function kickParticipant(
  roomId: string,
  hostId: string,
  userId: string,
): Promise<void> {
  // 先校验是房主
  const { data: room, error: roomErr } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('id', roomId)
    .eq('host_id', hostId)
    .maybeSingle()
  if (roomErr) throw new Error(`校验房主权限失败: ${roomErr.message}`)
  if (!room) throw new Error('无权操作：仅房主可踢人')

  const { error } = await supabase
    .from('room_participants')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId)
  if (error) throw new Error(`踢人失败: ${error.message}`)
}

// ---------------------------------------------------------------------
// user_themes（个性化装扮）相关
// ---------------------------------------------------------------------

/** 获取用户主题 */
export async function getUserTheme(userId: string): Promise<UserTheme | null> {
  const { data, error } = await supabase
    .from('user_themes')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`获取主题失败: ${error.message}`)
  return (data as UserTheme) ?? null
}

/** 更新或插入用户主题 */
export async function upsertUserTheme(input: {
  userId: string
  themeId?: string
  customColors?: Record<string, unknown>
  bubbleStyle?: string
  loadingAnim?: string
}): Promise<UserTheme> {
  const update: Record<string, unknown> = {
    user_id: input.userId,
    updated_at: new Date().toISOString(),
  }
  if (input.themeId !== undefined) update.theme_id = input.themeId
  if (input.customColors !== undefined) update.custom_colors = input.customColors
  if (input.bubbleStyle !== undefined) update.bubble_style = input.bubbleStyle
  if (input.loadingAnim !== undefined) update.loading_anim = input.loadingAnim

  const { data, error } = await supabase
    .from('user_themes')
    .upsert(update)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`保存主题失败: ${error?.message ?? '未知错误'}`)
  }
  return data as UserTheme
}

// ---------------------------------------------------------------------
// forum_ratings（话题评分）相关
// ---------------------------------------------------------------------

/** 创建或更新用户对某话题的评分（topic_id + user_id 唯一） */
export async function createOrUpdateRating(
  topicId: string,
  userId: string,
  rating: number
): Promise<ForumRating> {
  const { data, error } = await supabase
    .from('forum_ratings')
    .upsert(
      {
        topic_id: topicId,
        user_id: userId,
        rating,
      },
      { onConflict: 'topic_id,user_id' }
    )
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`评分失败: ${error?.message ?? '未知错误'}`)
  }
  return data as ForumRating
}

/** 列出某话题的所有评分，并计算平均分与总数 */
export async function listRatingsByTopic(
  topicId: string
): Promise<{ ratings: ForumRating[]; average: number; count: number }> {
  const { data, error } = await supabase
    .from('forum_ratings')
    .select('*')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`列出评分失败: ${error.message}`)
  }

  const ratings = (data as ForumRating[]) ?? []
  const count = ratings.length
  const sum = ratings.reduce((acc, r) => acc + (r.rating ?? 0), 0)
  const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0
  return { ratings, average, count }
}

/** 获取用户对某话题的评分 */
export async function getUserRating(
  topicId: string,
  userId: string
): Promise<ForumRating | null> {
  const { data, error } = await supabase
    .from('forum_ratings')
    .select('*')
    .eq('topic_id', topicId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    throw new Error(`获取用户评分失败: ${error.message}`)
  }
  return (data as ForumRating) ?? null
}
