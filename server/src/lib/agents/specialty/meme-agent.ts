// =====================================================================
// Meme Specialty Agent — 表情包专长
// ---------------------------------------------------------------------
// 流程：LLM 生成「表情包文案」→ generateAIImage 生成 1024x1024 图
// =====================================================================

import { generateAIImage } from '../agent-tools'
import type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'

export class MemeAgent implements SpecialtyAgent {
  readonly specialty = 'meme' as const

  async generate(input: SpecialtyInput): Promise<SpecialtyOutput> {
    const { creator, topic, contentHint, llm } = input

    // Step 1: LLM 生成表情包文案
    const textRes = await llm(
      creator.system_prompt +
        `\n\n请为表情包主题"${topic}"创作：\n1. 一句简短的配文（10-30 字，有梗、有笑点）\n2. 一句话画面描述（用于图片生成 prompt）\n\n格式：\n【配文】...\n【画面】...`,
      contentHint || `主题：${topic}`,
    )

    let caption = `表情包：${topic}`
    let sceneDescription = `${creator.style} 风格的表情包：${topic}`

    if (textRes.ok && textRes.data?.content) {
      const raw = String(textRes.data.content)
      const captionMatch = raw.match(/【配文】([\s\S]*?)(?=【画面】|$)/)
      const sceneMatch = raw.match(/【画面】([\s\S]*?)$/)
      if (captionMatch) caption = captionMatch[1].trim()
      if (sceneMatch) sceneDescription = sceneMatch[1].trim()
    }

    // Step 2: 生成表情包图（1024x1024 方图）
    const imgRes = await generateAIImage({
      prompt: `表情包风格：${creator.style}。${sceneDescription}。色彩鲜艳，表情夸张，适合做表情包。${contentHint || ''}`.trim(),
      size: '1024x1024',
    })

    const metadata: Record<string, unknown> = {
      caption,
    }
    if (imgRes.ok && imgRes.data?.url) {
      metadata.image_url = imgRes.data.url
    }

    return {
      postType: 'ai_meme',
      content: caption,
      metadata,
      pipelineMetadata: {
        topic,
        content_hint: contentHint,
        specialty: this.specialty,
        style: creator.style,
        caption,
        scene_description: sceneDescription,
        media_tool: 'image',
        media_result: imgRes.ok ? imgRes.data : { error: imgRes.error },
        generated_at: new Date().toISOString(),
      },
    }
  }
}
