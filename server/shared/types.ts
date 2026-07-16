// =====================================================================
// 前后端共享类型定义
// ---------------------------------------------------------------------
// 从 lib/supabase/types.ts 迁移，供 Vite 前端与 Express 后端共同使用。
// 时间戳字段统一用 string（ISO），UUID 字段统一用 string。
// =====================================================================

/** 用户角色：普通用户 / 管理员 */
export type UserRole = 'user' | 'admin'

/** profiles 表：用户资料，扩展自 Supabase auth.users */
export interface Profile {
  id: string
  nickname: string
  avatar_url: string | null
  role: UserRole
  banned_until: string | null
  /** 积分（由签到等行为累计，可能为 null —— 旧数据未迁移时） */
  points?: number | null
  created_at: string
  updated_at: string
}

/**
 * 用户认证信息（前端 Auth Context 使用）。
 * banned 为布尔值（由 banned_until > now 计算得出）。
 */
export interface UserProfile {
  id: string
  email: string
  role: UserRole
  nickname: string
  avatar_url: string | null
  banned: boolean
  points: number
}

/** agents 表：AI 智能体配置 */
export interface Agent {
  id: string
  name: string
  era: string | null
  title: string | null
  tagline: string | null
  avatar_gradient: string | null
  system_prompt: string
  topics: string[]
  created_at: string
}

/** conversations 表：1v1 对话 */
export interface Conversation {
  id: string
  user_id: string
  agent_id: string
  title: string | null
  created_at: string
  updated_at: string
}

/** messages 表：对话消息中的角色 */
export type MessageRole = 'user' | 'assistant'

/** messages 表：对话消息 */
export interface Message {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  created_at: string
}

/**
 * 对话消息（仅支持 user / assistant 两种角色，system 由 ai-client 内部注入）。
 * 供 AI 客户端使用的精简结构。
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** forum_topics 表：论坛话题 */
export interface ForumTopic {
  id: string
  author_id: string
  title: string
  content: string
  mentioned_agents: string[]
  views: number
  /** 项目包（用于 Vibe Code 一键复刻）：code + assets 引用 */
  project_payload?: {
    code?: string
    title?: string
    assets?: string[]
  } | null
  created_at: string
}

/** forum_posts 表：论坛回帖的作者类型 */
export type ForumPostAuthorType = 'user' | 'agent'

/** forum_posts 表：论坛回帖 */
export interface ForumPost {
  id: string
  topic_id: string
  author_id: string
  author_type: ForumPostAuthorType
  agent_id: string | null
  content: string
  created_at: string
}

/** reports 表：举报目标类型 */
export type ReportTargetType = 'message' | 'topic' | 'post' | 'user'

/** reports 表：举报状态 */
export type ReportStatus = 'pending' | 'resolved' | 'ignored'

/** reports 表：举报记录 */
export interface Report {
  id: string
  reporter_id: string
  target_type: ReportTargetType
  target_id: string
  reason: string | null
  status: ReportStatus
  created_at: string
}

/** moderation_keywords 表：审核关键词 */
export interface ModerationKeyword {
  id: string
  keyword: string
  pattern: string | null
  created_at: string
}

/** custom_agents 表：用户创建的自定义智能体 */
export interface CustomAgent {
  id: string
  creator_id: string
  name: string
  description: string | null
  personality: string | null
  system_prompt: string
  avatar_gradient: string
  visibility: 'private' | 'public'
  status: 'active' | 'pending' | 'banned'
  created_at: string
  updated_at: string
}

/** agent_favorites 表：智能体收藏 */
export interface AgentFavorite {
  user_id: string
  agent_id: string
  agent_type: 'official' | 'custom'
  created_at: string
}

/** creative_works 表：创意工坊作品 */
export interface CreativeWork {
  id: string
  creator_id: string
  type: 'script' | 'video' | 'image' | 'article' | 'game' | 'voice'
  title: string
  input: Record<string, unknown>
  result: Record<string, unknown> | null
  status: 'pending' | 'processing' | 'done' | 'failed'
  created_at: string
}

/** game_saves 表：游戏存档 */
export interface GameSave {
  id: string
  user_id: string
  game_type: string
  title: string | null
  state: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** checkins 表：每日签到记录 */
export interface Checkin {
  user_id: string
  /** 签到日期（YYYY-MM-DD，DATE 类型转 string） */
  check_date: string
  /** 连续签到天数 */
  streak_days: number
  /** 本次签到获得的积分 */
  points_earned: number
  created_at: string
}

/** shared_conversations 表：对话分享记录 */
export interface SharedConversation {
  id: string
  conversation_id: string
  creator_id: string
  /** 分享短链接标识 */
  slug: string
  created_at: string
}

/** media_assets 表：用户私有素材库（图片/视频/音频） */
export interface MediaAsset {
  id: string
  user_id: string
  type: 'image' | 'video' | 'audio'
  url: string
  prompt: string | null
  title: string | null
  project_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

/** agent_teams 表：多智能体并行协作团队 */
export interface AgentTeam {
  id: string
  user_id: string
  name: string
  /** 团队包含的智能体 ID 数组 */
  agent_ids: string[]
  /** 团队配置（工具权限等） */
  config: {
    /** 每个 agent 的工具权限：{ [agentId]: { search, imageGen, videoGen, fileOp } } */
    toolPermissions?: Record<string, {
      search?: boolean
      imageGen?: boolean
      videoGen?: boolean
      fileOp?: boolean
    }>
    [k: string]: unknown
  }
  created_at: string
}

/** project_snapshots 表：Vibe Code 项目快照 */
export interface ProjectSnapshot {
  id: string
  project_id: string
  user_id: string
  code: string
  label: string | null
  /** 父快照 ID（用于 diff 和分支） */
  parent_id: string | null
  /** 分支名（main / remix） */
  branch: string
  created_at: string
}

/** chat_rooms 表：联机共聊房间 */
export interface ChatRoom {
  id: string
  host_id: string
  name: string
  agent_id: string
  /** 房间状态：active / closed */
  status: 'active' | 'closed'
  created_at: string
}

/** room_participants 表：房间参与者 */
export interface RoomParticipant {
  room_id: string
  user_id: string
  joined_at: string
}

/** room_messages 表：房间消息 */
export interface RoomMessage {
  id: string
  room_id: string
  user_id: string | null
  role: 'user' | 'assistant'
  content: string
  agent_id: string | null
  created_at: string
}

/** user_themes 表：个性化装扮 */
export interface UserTheme {
  user_id: string
  /** 内置主题 ID：default / doubao / sunset / ocean / forest / sakura */
  theme_id: string
  /** 自定义颜色覆盖 */
  custom_colors: {
    primary?: string
    background?: string
    [k: string]: unknown
  }
  /** 气泡样式：default / rounded / sharp / bubble */
  bubble_style: string
  /** 加载动画：default / pulse / bounce / spin */
  loading_anim: string
  updated_at: string
}

/** forum_ratings 表：论坛话题评分 */
export interface ForumRating {
  id: string
  topic_id: string
  user_id: string
  /** 1-5 星 */
  rating: number
  created_at: string
}

// ---------------------------------------------------------------------
// Skill 市场（Batch A）
// ---------------------------------------------------------------------

export type SkillCategory = 'search' | 'media' | 'code' | 'data' | 'utility' | 'custom'

export interface SkillManifest {
  name: string
  description: string
  tools: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  systemPrompt?: string
}

export interface Skill {
  id: string
  name: string
  slug: string
  description: string
  category: SkillCategory
  manifest: SkillManifest
  author_id: string | null
  version: string
  status: 'pending' | 'published' | 'rejected'
  install_count: number
  created_at: string
  updated_at: string
}

export interface UserSkill {
  user_id: string
  skill_id: string
  enabled: boolean
  config: Record<string, unknown>
  installed_at: string
  skill?: Skill
}

// ---------------------------------------------------------------------
// Plan Mode（Batch B）
// ---------------------------------------------------------------------

/**
 * 团队角色类型（forward declaration，Batch C 团队协作使用）。
 * 在 Batch B 中仅作为 PlanStep.agent_role 的可选类型出现，
 * Batch C 会基于此类型扩展多角色协作。
 */
export type TeamRole = 'leader' | 'planner' | 'coder' | 'executor' | 'reviewer' | 'reporter'

/** Plan Step 类型：标识该步骤的工作性质 */
export type PlanStepType = 'code' | 'design' | 'test' | 'research' | 'deploy'

/** Plan Step 状态机：pending → in_progress → completed/skipped/failed */
export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed'

/** Plan 单个步骤 */
export interface PlanStep {
  /** step 序号（从 1 开始） */
  id: number
  title: string
  type: PlanStepType
  status: PlanStepStatus
  /** 可选：由 Batch C 团队模式时指定执行该 step 的角色 */
  agent_role?: TeamRole
  /** 该步骤执行结果（step_done 时填充） */
  result?: string
  started_at?: string
  completed_at?: string
}

/** plans 表：Plan Mode 规划执行 */
export interface Plan {
  id: string
  user_id: string
  project_id: string | null
  goal: string
  steps: PlanStep[]
  /** 当前执行到的 step 索引（从 0 开始） */
  current_step: number
  status: 'draft' | 'planning' | 'ready' | 'executing' | 'paused' | 'completed' | 'failed'
  mode: 'single' | 'plan' | 'team'
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// AI Teamwork（Batch C）
// ---------------------------------------------------------------------

/** team_sessions 表中的消息记录（transcript JSONB 数组元素） */
export interface TeamMessage {
  id: string
  role: 'user' | 'assistant'
  /** assistant 消息才有：标识由哪个角色产出 */
  agent_role?: TeamRole
  content: string
  timestamp: string
  /** 该消息中触发的工具调用（若有） */
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>
}

/** team_sessions 表：AI Teamwork 多角色协作会话 */
export interface TeamSession {
  id: string
  user_id: string
  /** 关联的 plan ID（若团队围绕 plan 协作则填） */
  plan_id: string | null
  /** 用户描述的目标 */
  goal: string
  /** 启用的角色列表 */
  roles: TeamRole[]
  /** 当前正在执行的角色 */
  current_role: TeamRole | null
  /** 会话状态：active / paused / completed / failed */
  status: 'active' | 'paused' | 'completed' | 'failed'
  /** 完整对话历史 */
  transcript: TeamMessage[]
  created_at: string
  updated_at: string
}

/** 团队配置：用户在 TeamToggle 中选择的角色与模型 */
export interface TeamConfig {
  roles: TeamRole[]
  /** 可选：Leader 使用的模型（默认 agnes-2.0-flash） */
  leader_model?: string
  /** 可选：其他成员使用的模型 */
  member_model?: string
}

/** Reviewer 角色产出的结构化代码审查结果 */
export interface CodeReviewResult {
  /** 安全性评分 0-100 */
  security: number
  /** 可维护性评分 0-100 */
  maintainability: number
  /** 性能评分 0-100 */
  performance: number
  /** 发现的问题列表 */
  issues: Array<{
    severity: 'critical' | 'warning' | 'info'
    message: string
    /** 可选：问题所在行号 */
    line?: number
  }>
  /** 总体评语 */
  summary: string
}

// ---------------------------------------------------------------------
// Agent Memory 长期记忆（Batch E1）
// ---------------------------------------------------------------------

/** agent_memory 表：跨会话的长期记忆（key-value 形式） */
export interface AgentMemory {
  id: string
  user_id: string
  /** 记忆键，如 'ui_framework' / 'language' / 'tech_stack' */
  key: string
  /** 记忆值，如 'tailwind' / 'typescript' */
  value: string
  /** 来源：'agent'（AI 自动保存）/ 'user'（用户手动添加）/ 'system'（系统默认） */
  source: 'agent' | 'user' | 'system'
  created_at: string
}

/**
 * AI 自建工具的元数据（Batch E2 Tool Builder）。
 * 保存在内存 Map 中（不持久化，会话级）。
 */
export interface DynamicToolMeta {
  /** 工具名（唯一，作为工具调用名） */
  name: string
  /** 工具描述 */
  description: string
  /** JS 代码字符串：function body，接受 (args, context) */
  implementation: string
  /** 创建者用户 ID */
  user_id: string
  /** 创建时间戳 */
  created_at: string
}
