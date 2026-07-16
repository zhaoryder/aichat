// =====================================================================
// Image Specialty Agent — AI 绘画专长
// ---------------------------------------------------------------------
// 流程：LLM 生成作品文本 → generateAIImage 生成 1024x1024 图片
// =====================================================================

import { generateAIImage } from '../agent-tools'
import type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'

export class ImageAgent implements SpecialtyAgent {
  readonly specialty = 'image' as const

  async generate(input: SpecialtyInput): Promise<SpecialtyOutput> {
    const { creator, topic, contentHint, llm } = input

    // Step 1: LLM 生成作品文本内容
    const textRes = await llm(
      creator.system_prompt +
        `\n\n现在请创作一个作品。主题：${topic}。要求：体现你"${creator.style}"的风格，60-200 字。直接输出作品正文，不要解释。`,
      contentHint || `请围绕"${topic}"创作。`,
    )
    const content = textRes.ok && textRes.data?.content
      ? String(textRes.data.content).trim()
      : `AI 绘画：${topic}`

    // Step 2: 生成图片（1024x1024 方图）
    const imgRes = await generateAIImage({
      prompt: `${creator.style} 风格的艺术插画：${topic}。高质量，细节丰富。${contentHint || ''}`.trim(),
      size: '1024x1024',
    })

    const metadata: Record<string, unknown> = {}
    if (imgRes.ok && imgRes.data?.url) {
      metadata.image_url = imgRes.data.url
    }

    return {
      postType: 'ai_image',
      content,
      metadata,
      pipelineMetadata: {
        topic,
        content_hint: contentHint,
        specialty: this.specialty,
        style: creator.style,
        media_tool: 'image',
        media_result: imgRes.ok ? imgRes.data : { error: imgRes.error },
        generated_at: new Date().toISOString(),
      },
    }
  }
}
