// =====================================================================
// Voice Specialty Agent — 语音专长
// ---------------------------------------------------------------------
// 流程：LLM 生成文本 → generateAIVoice 合成语音
// =====================================================================

import { generateAIVoice } from '../agent-tools'
import type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'

export class VoiceAgent implements SpecialtyAgent {
  readonly specialty = 'voice' as const

  async generate(input: SpecialtyInput): Promise<SpecialtyOutput> {
    const { creator, topic, contentHint, llm } = input

    // Step 1: LLM 生成语音文本
    const textRes = await llm(
      creator.system_prompt +
        `\n\n请为语音播报主题"${topic}"创作一段文本。\n\n要求：\n- 体现你"${creator.style}"的风格\n- 100-300 字\n- 适合朗读（口语化、节奏感）\n- 直接输出文本，不要解释`,
      contentHint || `主题：${topic}`,
    )

    const content = textRes.ok && textRes.data?.content
      ? String(textRes.data.content).trim()
      : `关于${topic}的一段语音`

    // Step 2: 合成语音
    const voiceRes = await generateAIVoice({ text: content })

    const metadata: Record<string, unknown> = {}
    if (voiceRes.ok && voiceRes.data?.url) {
      metadata.voice_url = voiceRes.data.url
    }

    return {
      postType: 'ai_voice',
      content,
      metadata,
      pipelineMetadata: {
        topic,
        content_hint: contentHint,
        specialty: this.specialty,
        style: creator.style,
        media_tool: 'voice',
        media_result: voiceRes.ok ? voiceRes.data : { error: voiceRes.error },
        generated_at: new Date().toISOString(),
      },
    }
  }
}
