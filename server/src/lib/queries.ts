// =====================================================================
// Supabase 业务查询函数封装
// ---------------------------------------------------------------------
// 从 lib/supabase/queries.ts 迁移，适配 Express 后端。
// 所有函数使用 service_role 客户端（绕过 RLS）。
// 函数命名按任务要求：createForumTopic / createForumPost / listForumTopics /
// listForumPosts 等。新增 checkin / listCheckins / createShare /
// getShare / listUsers / listReports / createReport / updateReportStatus /
// getResolvedAgent。
// =====================================================================

import { supabase } from './supabase'
import { getAgentById, type AgentConfig } from '../../shared/agents'
import type {
  Agent,
  AgentFavorite,
  Conversation,
  CreativeWork,
  CustomAgent,
  ForumPost,
  ForumTopic,
  GameSave,
  Message,
  MessageRole,
  ModerationKeyword,
  Profile,
  Report,
  ReportStatus,
  ReportTargetType,
  SharedConversation,
  Checkin,
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
  mentionedAgents: string[]
): Promise<ForumTopic> {
  const { data, error } = await supabase
    .from('forum_topics')
    .insert({
      author_id: authorId,
      title,
      content,
      mentioned_agents: mentionedAgents,
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
// 签到相关
// ---------------------------------------------------------------------

/**
 * 每日签到。
 *
 * 逻辑：
 *   1. 检查今天是否已签到（check_date = today）
 *   2. 若未签到，查昨天的记录计算连续天数
 *   3. 积分 = 10 基础 + 连续签到加成（每连续 7 天额外 +5）
 *   4. 插入签到记录，递增用户积分
 *
 * @returns 签到结果；若今天已签到则返回已有记录
 */
export async function checkin(
  userId: string
): Promise<{ checkin: Checkin; alreadyCheckedIn: boolean }> {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10) // YYYY-MM-DD

  // 1. 检查今天是否已签到
  const { data: todayRecord } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('check_date', todayStr)
    .maybeSingle()

  if (todayRecord) {
    return { checkin: todayRecord as Checkin, alreadyCheckedIn: true }
  }

  // 2. 查昨天记录，计算连续天数
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  const { data: yesterdayRecord } = await supabase
    .from('checkins')
    .select('streak_days')
    .eq('user_id', userId)
    .eq('check_date', yesterdayStr)
    .maybeSingle()

  const prevStreak = (yesterdayRecord?.streak_days as number) ?? 0
  const streakDays = prevStreak + 1

  // 3. 计算积分：基础 10 + 每 7 天连续额外 5
  const bonus = Math.floor(streakDays / 7) * 5
  const pointsEarned = 10 + bonus

  // 4. 插入签到记录
  const { data, error } = await supabase
    .from('checkins')
    .insert({
      user_id: userId,
      check_date: todayStr,
      streak_days: streakDays,
      points_earned: pointsEarned,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`签到失败: ${error?.message ?? '未知错误'}`)
  }

  // 5. 递增用户积分
  const { data: profile } = await supabase
    .from('profiles')
    .select('points')
    .eq('id', userId)
    .maybeSingle()

  const currentPoints = (profile?.points as number | null) ?? 0
  await supabase
    .from('profiles')
    .update({ points: currentPoints + pointsEarned })
    .eq('id', userId)

  return { checkin: data as Checkin, alreadyCheckedIn: false }
}

/** 列出指定用户的签到记录，按日期倒序 */
export async function listCheckins(userId: string): Promise<Checkin[]> {
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .order('check_date', { ascending: false })
  if (error) throw new Error(`查询签到记录失败: ${error.message}`)
  return (data as Checkin[]) ?? []
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
