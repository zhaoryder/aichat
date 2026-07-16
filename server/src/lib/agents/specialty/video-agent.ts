// =====================================================================
// Video Specialty Agent — 短视频专长
// ---------------------------------------------------------------------
// 流程：LLM 拆分「画面描述 + 镜头语言」→ submitAIVideo 异步任务
// =====================================================================

import { submitAIVideo } from '../agent-tools'
import type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'

export class VideoAgent implements SpecialtyAgent {
  readonly specialty = 'video' as const

  async generate(input: SpecialtyInput): Promise<SpecialtyOutput> {
    const { creator, topic, contentHint, llm } = input

    // Step 1: LLM 生成作品文案 + 视频画面描述
    const textRes = await llm(
      creator.system_prompt +
        `\n\n请为短视频主题"${topic}"创作：\n1. 60-150 字的视频文案（直接输出正文）\n2. 一句话画面描述（用于视频生成 prompt）\n\n请按以下格式输出：\n【文案】...\n【画面】...`,
      contentHint || `主题：${topic}`,
    )

    let content = `AI 短视频：${topic}`
    let sceneDescription = `${creator.style} 风格的短视频：${topic}`

    if (textRes.ok && textRes.data?.content) {
      const raw = String(textRes.data.content)
      // 解析【文案】和【画面】两段
      const contentMatch = raw.match(/【文案】([\s\S]*?)(?=【画面】|$)/)
      const sceneMatch = raw.match(/【画面】([\s\S]*?)$/)
      if (contentMatch) content = contentMatch[1].trim()
      if (sceneMatch) sceneDescription = sceneMatch[1].trim()
    }

    // Step 2: 提交视频生成任务（异步）
    const videoRes = await submitAIVideo({
      prompt: `${creator.style} 风格。${sceneDescription}。${contentHint || ''}`.trim(),
      duration: 5,
    })

    const metadata: Record<string, unknown> = {}
    if (videoRes.ok && videoRes.data?.task_id) {
      metadata.video_task_id = videoRes.data.task_id
    }

    return {
      postType: 'ai_video',
      content,
      metadata,
      pipelineMetadata: {
        topic,
        content_hint: contentHint,
        specialty: this.specialty,
        style: creator.style,
        scene_description: sceneDescription,
        media_tool: 'video',
        media_result: videoRes.ok ? videoRes.data : { error: videoRes.error },
        generated_at: new Date().toISOString(),
      },
    }
  }
}
