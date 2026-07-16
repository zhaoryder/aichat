// =====================================================================
// Poster Specialty Agent — 海报专长
// ---------------------------------------------------------------------
// 流程：LLM 生成「海报标题 + 副标题」→ generateAIImage 生成 576x1024 海报
// =====================================================================

import { generateAIImage } from '../agent-tools'
import type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'

export class PosterAgent implements SpecialtyAgent {
  readonly specialty = 'poster' as const

  async generate(input: SpecialtyInput): Promise<SpecialtyOutput> {
    const { creator, topic, contentHint, llm } = input

    // Step 1: LLM 生成海报标题 + 视觉描述
    const textRes = await llm(
      creator.system_prompt +
        `\n\n请为海报主题"${topic}"创作：\n1. 主标题（10 字以内，吸引眼球）\n2. 副标题（20 字以内，补充信息）\n3. 一句话视觉描述（用于图片生成 prompt，描述海报的画面、色彩、构图）\n\n格式：\n【主标题】...\n【副标题】...\n【视觉】...`,
      contentHint || `主题：${topic}`,
    )

    let mainTitle = topic
    let subTitle = ''
    let visualDescription = `${creator.style} 风格的海报：${topic}`

    if (textRes.ok && textRes.data?.content) {
      const raw = String(textRes.data.content)
      const mainMatch = raw.match(/【主标题】([\s\S]*?)(?=【副标题】|【视觉】|$)/)
      const subMatch = raw.match(/【副标题】([\s\S]*?)(?=【视觉】|$)/)
      const visMatch = raw.match(/【视觉】([\s\S]*?)$/)
      if (mainMatch) mainTitle = mainMatch[1].trim()
      if (subMatch) subTitle = subMatch[1].trim()
      if (visMatch) visualDescription = visMatch[1].trim()
    }

    // Step 2: 生成海报图（576x1024 竖图）
    const imgRes = await generateAIImage({
      prompt: `海报设计：${creator.style} 风格。${visualDescription}。主标题：${mainTitle}。高质量，构图精美。${contentHint || ''}`.trim(),
      size: '576x1024',
    })

    const metadata: Record<string, unknown> = {
      main_title: mainTitle,
      sub_title: subTitle,
    }
    if (imgRes.ok && imgRes.data?.url) {
      metadata.image_url = imgRes.data.url
    }

    const content = subTitle ? `${mainTitle} — ${subTitle}` : mainTitle

    return {
      postType: 'ai_poster',
      content,
      metadata,
      pipelineMetadata: {
        topic,
        content_hint: contentHint,
        specialty: this.specialty,
        style: creator.style,
        main_title: mainTitle,
        sub_title: subTitle,
        visual_description: visualDescription,
        media_tool: 'image',
        media_result: imgRes.ok ? imgRes.data : { error: imgRes.error },
        generated_at: new Date().toISOString(),
      },
    }
  }
}
