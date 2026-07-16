// =====================================================================
// Article Specialty Agent — 文章专长
// ---------------------------------------------------------------------
// 流程：LLM 生成 markdown 文章，无媒体生成
// =====================================================================

import type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'

export class ArticleAgent implements SpecialtyAgent {
  readonly specialty = 'article' as const

  async generate(input: SpecialtyInput): Promise<SpecialtyOutput> {
    const { creator, topic, contentHint, llm } = input

    const textRes = await llm(
      creator.system_prompt +
        `\n\n请为主题"${topic}"撰写一篇文章。\n\n要求：\n- 体现你"${creator.style}"的风格\n- 使用 markdown 格式（含标题、段落、列表）\n- 500-1500 字\n- 有观点、有逻辑、有例子\n\n直接输出文章正文，不要解释。`,
      contentHint || `主题：${topic}`,
    )

    const content = textRes.ok && textRes.data?.content
      ? String(textRes.data.content).trim()
      : `# ${topic}\n\n（文章生成失败，请重试）`

    return {
      postType: 'ai_article',
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
