// =====================================================================
// Script Specialty Agent — 剧本专长
// ---------------------------------------------------------------------
// 流程：LLM 生成剧本格式（角色 + 台词 + 场景），无媒体生成
// =====================================================================

import type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'

export class ScriptAgent implements SpecialtyAgent {
  readonly specialty = 'script' as const

  async generate(input: SpecialtyInput): Promise<SpecialtyOutput> {
    const { creator, topic, contentHint, llm } = input

    const textRes = await llm(
      creator.system_prompt +
        `\n\n请为主题"${topic}"创作一个短剧本。\n\n要求：\n- 体现你"${creator.style}"的风格\n- 包含 2-4 个角色\n- 每个角色 3-8 句台词\n- 标注场景描述（用【场景】开头）\n- 标注角色名（用【角色】开头）\n- 总长度 300-800 字\n\n直接输出剧本正文，不要解释。`,
      contentHint || `主题：${topic}`,
    )

    const content = textRes.ok && textRes.data?.content
      ? String(textRes.data.content).trim()
      : `【剧本】${topic}\n\n（剧本生成失败，请重试）`

    return {
      postType: 'ai_script',
      content,
      metadata: {},
      pipelineMetadata: {
        topic,
        content_hint: contentHint,
        specialty: this.specialty,
        style: creator.style,
        media_tool: 'none',
        generated_at: new Date().toISOString(),
      },
    }
  }
}
