// =====================================================================
// 智能体类型定义（前后端共享）
// ---------------------------------------------------------------------
// 从 shared/agents.ts 抽出，供 10 个分类文件 import。
// =====================================================================

/** 角色卡牌信息 */
export interface AgentCard {
  rarity: '普通' | '稀有' | '史诗' | '传说'
  skills: string[]
  combo: string
}

export interface AgentConfig {
  id: string
  name: string
  era: string
  title: string
  tagline: string
  avatarGradient: string
  systemPrompt: string
  topics: string[]
  card: AgentCard
  /** 分类（10 大类之一，由 index.ts 根据来源文件自动打标签，可选以兼容自定义智能体） */
  category?: AgentCategory
}

/** 智能体分类标识（10 大类） */
export type AgentCategory =
  | 'history'
  | 'literature'
  | 'science'
  | 'art'
  | 'anime-game'
  | 'worklife'
  | 'fun'
  | 'sports'
  | 'music'
  | 'movie-tv'
