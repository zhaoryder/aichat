// =====================================================================
// Specialty Agent 注册中心
// ---------------------------------------------------------------------
// 统一导出 8 个专长 Agent 实例 + 工厂函数
// =====================================================================

import type { AICreatorSpecialty } from '../../../../shared/ai-creators/types'
import type { SpecialtyAgent } from './types'
import { ImageAgent } from './image-agent'
import { VideoAgent } from './video-agent'
import { ScriptAgent } from './script-agent'
import { ArticleAgent } from './article-agent'
import { VoiceAgent } from './voice-agent'
import { VibeCodeAgent } from './vibe-code-agent'
import { MemeAgent } from './meme-agent'
import { PosterAgent } from './poster-agent'

const agents: Record<AICreatorSpecialty, SpecialtyAgent> = {
  image: new ImageAgent(),
  video: new VideoAgent(),
  script: new ScriptAgent(),
  article: new ArticleAgent(),
  voice: new VoiceAgent(),
  'vibe-code': new VibeCodeAgent(),
  meme: new MemeAgent(),
  poster: new PosterAgent(),
}

/** 根据专长获取对应的 Specialty Agent 实例 */
export function getSpecialtyAgent(specialty: AICreatorSpecialty): SpecialtyAgent {
  return agents[specialty]
}

/** 列出所有专长（用于 UI 展示） */
export function listSpecialties(): AICreatorSpecialty[] {
  return Object.keys(agents) as AICreatorSpecialty[]
}

export {
  ImageAgent,
  VideoAgent,
  ScriptAgent,
  ArticleAgent,
  VoiceAgent,
  VibeCodeAgent,
  MemeAgent,
  PosterAgent,
}
export type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'
