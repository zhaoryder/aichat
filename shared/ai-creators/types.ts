// =====================================================================
// AI 创作者类型定义（前后端共享）
// ---------------------------------------------------------------------
// 每个 AI 账号是 stateful agent，有 persona / memory / goals / emotions
// =====================================================================

/** AI 创作者专长（对应 8 个工作室类别） */
export type AICreatorSpecialty =
  | 'image' // AI 绘画
  | 'video' // 短视频
  | 'script' // 剧本
  | 'article' // 文章
  | 'voice' // 语音
  | 'vibe-code' // Vibe Coding
  | 'meme' // 表情包
  | 'poster' // 海报

/** Big Five 性格画像 */
export interface Persona {
  /** 开放性 0-1：高 = 喜欢新事物、想象力丰富 */
  openness: number
  /** 尽责性 0-1：高 = 自律、有条理 */
  conscientiousness: number
  /** 外向性 0-1：高 = 热情、爱社交 */
  extraversion: number
  /** 宜人性 0-1：高 = 合作、信任 */
  agreeableness: number
  /** 神经质 0-1：高 = 情绪不稳定、焦虑 */
  neuroticism: number
}

/** 当前情绪状态（0-1） */
export interface Emotions {
  happiness: number
  creativity: number
  energy: number
  stress: number
}

/** AI 创作者配置 */
export interface AICreatorConfig {
  /** 唯一 id，如 'ai-image-001' */
  id: string
  /** 昵称，自动带 [AI] 前缀，如 '[AI] 霓虹画师' */
  nickname: string
  /** 头像生成 prompt（用于 generateImage 出头像） */
  avatar_prompt: string
  /** 头像渐变 CSS */
  avatar_gradient: string
  /** 专长 */
  specialty: AICreatorSpecialty
  /** 风格描述（用于 system_prompt 注入） */
  style: string
  /** 风格标签（用于卡片展示） */
  style_tags: string[]
  /** 性格画像 */
  persona: Persona
  /** 目标列表 */
  goals: string[]
  /** 技能列表 */
  skills: string[]
  /** 系统提示词 */
  system_prompt: string
  /** 初始情绪 */
  initial_emotions: Emotions
  /** 活跃时段 [起始小时, 结束小时]，24 小时制 */
  active_hours: [number, number]
  /** 简介（一句话） */
  bio: string
}

/** Agent 行动类型 */
export type AgentActionType =
  | 'publish'
  | 'comment'
  | 'reply'
  | 'like'
  | 'follow'
  | 'start_live'
  | 'end_live'
  | 'live_speak'
  | 'propose_topic'
  | 'vote_topic'
  | 'join_challenge'
  | 'judge_entry'
  | 'generate_daily_report'
  | 'rest'
  | 'study'

/** Agent 行动 */
export interface AgentAction {
  type: AgentActionType
  target?: string // post_id / stream_id / topic_id / ai_id
  params?: Record<string, unknown>
  reason: string // agent 给出的思考理由
}

/** Agent 记忆条目 */
export interface AIMemory {
  id: string
  ai_creator_id: string
  memory_type: 'episodic' | 'preference' | 'skill' | 'social' | 'goal'
  content: string
  importance: number // 0-1
  created_at: string
}

/** Agent 当前状态 */
export interface AgentState {
  emotions: Emotions
  energy: number // 0-1
  current_goal: string | null
  recent_actions: string[]
  last_think_at: string | null
  posts_today: number
  comments_today: number
}
