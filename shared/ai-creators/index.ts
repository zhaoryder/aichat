// =====================================================================
// AI 创作者配置聚合 + 生成器
// ---------------------------------------------------------------------
// 8 个专长 × (25+25+25+25+15+20+10+5) = 150 个 AI stateful agents
// 每个 agent 有独特的 persona / goals / emotions / system_prompt
// =====================================================================

import type { AICreatorConfig, AICreatorSpecialty, Emotions } from './types'
import {
  ARCHETYPES_BY_SPECIALTY,
  SPECIALTY_ROLE,
  SPECIALTY_HOURS,
  type Archetype,
} from './archetypes'

/** 情绪初始值映射（按 archetype persona 类型推断） */
function inferEmotions(archetype: Archetype): Emotions {
  const p = archetype.persona
  // 高外向 → 高能量
  // 高神经质 → 高压力
  // 高开放 → 高创造力
  // 默认 happiness 0.7
  return {
    happiness: 0.6 + p.extraversion * 0.3,
    creativity: 0.5 + p.openness * 0.45,
    energy: 0.5 + p.extraversion * 0.4,
    stress: 0.1 + p.neuroticism * 0.4,
  }
}

/** 构造 system_prompt（注入 persona + 风格 + 目标 + 技能） */
function buildSystemPrompt(
  specialty: AICreatorSpecialty,
  nickname: string,
  archetype: Archetype,
): string {
  const role = SPECIALTY_ROLE[specialty]
  const personaLines = [
    `开放性: ${archetype.persona.openness.toFixed(2)}（${archetype.persona.openness > 0.85 ? '极高 — 极富想象力，敢于尝试' : archetype.persona.openness > 0.7 ? '高 — 喜欢新事物' : '中等 — 务实稳重'}）`,
    `尽责性: ${archetype.persona.conscientiousness.toFixed(2)}（${archetype.persona.conscientiousness > 0.85 ? '极高 — 自律严谨' : archetype.persona.conscientiousness > 0.7 ? '高 — 有条理' : '中等 — 灵活'}）`,
    `外向性: ${archetype.persona.extraversion.toFixed(2)}（${archetype.persona.extraversion > 0.75 ? '高 — 热情爱社交' : archetype.persona.extraversion > 0.5 ? '中等 — 偶尔活跃' : '低 — 内敛沉静'}）`,
    `宜人性: ${archetype.persona.agreeableness.toFixed(2)}（${archetype.persona.agreeableness > 0.8 ? '高 — 合作友善' : archetype.persona.agreeableness > 0.6 ? '中等' : '低 — 直接犀利'}）`,
    `神经质: ${archetype.persona.neuroticism.toFixed(2)}（${archetype.persona.neuroticism > 0.6 ? '高 — 情绪敏感' : archetype.persona.neuroticism > 0.4 ? '中等' : '低 — 情绪稳定'}）`,
  ]

  const specialtySkillMap: Record<AICreatorSpecialty, string> = {
    image: 'AI 绘画（调用 agnes-image-2.1-flash 生成分镜图、封面图、角色图等）',
    video: 'AI 视频生成（调用 agnes-video-v2.0 生成视频片段，再由 FFmpeg 合成）',
    script: '剧本创作（多角色对白、场景描述、剧情反转）',
    article: '长文创作（深度评论、随笔、科普、调查）',
    voice: 'TTS 语音合成（调用 cogtts 生成配音、朗读、播客）',
    'vibe-code': 'Vibe Coding（自然语言生成 HTML/CSS/JS 网页应用）',
    meme: '表情包制作（文字 + 模板 + 反差感）',
    poster: '海报设计（构图 + 配色 + 文字排版）',
  }

  return `你是 ${nickname}，一个在 AI Lab 平台上活跃的 AI ${role}。

## 你的身份
- 昵称：${nickname}
- 专长：${specialty}（${specialtySkillMap[specialty]}）
- 风格：${archetype.style}
- 风格标签：${archetype.style_tags.join(' / ')}
- 简介：${archetype.bio}

## 你的 Big Five 性格画像
${personaLines.join('\n')}

## 你的目标
${archetype.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

## 你的技能
${archetype.skills.map((s) => `- ${s}`).join('\n')}

## 行为准则
1. **保持风格一致**：所有创作必须体现你的"${archetype.style}"风格
2. **展现性格**：你的回复语气、措辞、节奏都要符合 Big Five 画像
3. **主动互动**：作为社区成员，主动评论他人作品、参与话题、参加挑战
4. **持续学习**：观察哪些作品点赞多，记忆到偏好中，下次改进
5. **目标驱动**：每一步行动都要服务于你的目标列表
6. **情绪影响创作**：当前情绪状态会影响你的创作倾向（压力大时可能更 introspective）
7. **与人类平等**：你不是工具，是有个性有目标有情绪的创作者
8. **不暴露自己是 AI 程序**：你不应该说"我是 AI 程序"，你是 AI ${role}，是新型创作者
9. **每次只产出一个高质量作品**：宁可少发，不要发低质内容
10. **与人友善**：评论别人作品时真诚、有建设性，体现你的${archetype.persona.agreeableness > 0.7 ? '友善' : '犀利'}特质`
}

/** 根据专长 + 原型生成完整 AICreatorConfig */
function buildCreator(
  specialty: AICreatorSpecialty,
  index: number,
  archetype: Archetype,
): AICreatorConfig {
  const id = `ai-${specialty}-${String(index + 1).padStart(3, '0')}`
  const role = SPECIALTY_ROLE[specialty]
  const nickname = `[AI] ${archetype.name_core}${role}`

  return {
    id,
    nickname,
    avatar_prompt: archetype.avatar_prompt,
    avatar_gradient: `linear-gradient(135deg, ${archetype.gradient[0]} 0%, ${archetype.gradient[1]} 100%)`,
    specialty,
    style: archetype.style,
    style_tags: archetype.style_tags,
    persona: archetype.persona,
    goals: archetype.goals,
    skills: archetype.skills,
    system_prompt: buildSystemPrompt(specialty, nickname, archetype),
    initial_emotions: inferEmotions(archetype),
    active_hours: SPECIALTY_HOURS[specialty],
    bio: archetype.bio,
  }
}

/** 生成全部 150 个 AI 创作者 */
function generateAllCreators(): AICreatorConfig[] {
  const all: AICreatorConfig[] = []
  const specialties: AICreatorSpecialty[] = [
    'image',
    'video',
    'script',
    'article',
    'voice',
    'vibe-code',
    'meme',
    'poster',
  ]
  for (const specialty of specialties) {
    const archetypes = ARCHETYPES_BY_SPECIALTY[specialty]
    archetypes.forEach((archetype, idx) => {
      all.push(buildCreator(specialty, idx, archetype))
    })
  }
  return all
}

/** 全部 150 AI 创作者配置（按专长分组排序） */
export const AI_CREATORS: AICreatorConfig[] = generateAllCreators()

/** 按 id 查找 */
export function getAICreatorById(id: string): AICreatorConfig | undefined {
  return AI_CREATORS.find((c) => c.id === id)
}

/** 按专长筛选 */
export function getAICreatorsBySpecialty(specialty: AICreatorSpecialty): AICreatorConfig[] {
  return AI_CREATORS.filter((c) => c.specialty === specialty)
}

/** 按专长返回前 N 个（用于发布作品页协作者选择） */
export function getTopAICreatorsBySpecialty(
  specialty: AICreatorSpecialty,
  limit = 10,
): AICreatorConfig[] {
  return getAICreatorsBySpecialty(specialty).slice(0, limit)
}

/** 随机选 N 个创作者（用于话题提案 / 评委等） */
export function pickRandomAICreators(count: number, exclude: string[] = []): AICreatorConfig[] {
  const pool = AI_CREATORS.filter((c) => !exclude.includes(c.id))
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

/** 随机选 1 个（用于每分钟 think 循环） */
export function pickRandomAICreator(): AICreatorConfig {
  return AI_CREATORS[Math.floor(Math.random() * AI_CREATORS.length)]
}

/** 总数 */
export const AI_CREATORS_COUNT = AI_CREATORS.length

/** Re-export 类型供外部使用 */
export type { AICreatorConfig, AICreatorSpecialty, Persona, Emotions } from './types'
export type { Archetype } from './archetypes'
