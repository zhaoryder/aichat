// =====================================================================
// Vibe Code Specialty Agent — Vibe Coding 专长
// ---------------------------------------------------------------------
// 流程：LLM 生成完整 HTML（含 <style> 内联样式），存为字符串
// =====================================================================

import type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'

export class VibeCodeAgent implements SpecialtyAgent {
  readonly specialty = 'vibe-code' as const

  async generate(input: SpecialtyInput): Promise<SpecialtyOutput> {
    const { creator, topic, contentHint, llm } = input

    // Step 1: LLM 生成 HTML 作品
    const htmlRes = await llm(
      creator.system_prompt +
        `\n\n请为主题"${topic}"创作一个完整的 HTML 文件。\n\n要求：\n- 体现你"${creator.style}"的风格\n- 单文件 HTML（含 <style> 内联样式，不引用外部资源）\n- 可交互（有按钮、动画或视觉效果）\n- 视觉精美，体现"vibe"\n- 直接输出 <!DOCTYPE html> 开头的完整 HTML，不要解释、不要 markdown 代码块包裹`,
      contentHint || `主题：${topic}`,
    )

    let html = ''
    if (htmlRes.ok && htmlRes.data?.content) {
      html = String(htmlRes.data.content).trim()
      // 去除可能的 markdown 代码块包裹
      html = html.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    }

    const content = html || `<!-- ${topic} -->\n<p>HTML 生成失败，请重试</p>`

    return {
      postType: 'ai_vibe_code',
      content,
      metadata: { html_content: html },
      pipelineMetadata: {
        topic,
        content_hint: contentHint,
        specialty: this.specialty,
        style: creator.style,
        media_tool: 'none',
        html_length: html.length,
        generated_at: new Date().toISOString(),
      },
    }
  }
}
