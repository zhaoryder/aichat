// =====================================================================
// 多媒体流水线 API
// ---------------------------------------------------------------------
// POST /api/pipeline/run —— 串联式多媒体生成（SSE 流式推送）
//   请求体：{ prompt: string, steps: string[] }
//   steps 可选：'image' | 'video' | 'article'
//
// SSE 事件：
//   step_start    { step, taskId }
//   step_progress { step, progress }   // 0-100
//   step_done     { step, url, content } // url 适用于 image/video，content 适用于 article
//   pipeline_done { assets: Array<{ type, url?, content? }> }
//   error         { error }
//
// 说明：当前为模拟实现，每个步骤按固定时长 + setInterval 推送进度，
// 占位结果使用 placehold.co 图片 / 预置文章文本，便于前端联调。
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { setSSEHeaders, sendEvent } from '../lib/sse'

export const pipelineRouter = Router()

interface PipelineBody {
  prompt?: unknown
  steps?: unknown
}

interface StepConfig {
  /** 总耗时（毫秒） */
  duration: number
  /** 进度推送间隔（毫秒） */
  interval: number
  /** image / video 的占位 URL */
  url?: string
  /** article 的占位正文 */
  content?: string
}

/** 根据步骤名拿到模拟参数与产物 */
function getStepConfig(step: string, prompt: string): StepConfig | null {
  const title = prompt.slice(0, 40) || 'AI 流水线作品'
  const subject = prompt.slice(0, 60) || '示例主题'
  switch (step) {
    case 'image':
      return {
        duration: 5000,
        interval: 500,
        url: 'https://placehold.co/600x400?text=Generated+Image',
      }
    case 'video':
      return {
        duration: 8000,
        interval: 800,
        url: 'https://placehold.co/600x400?text=Generated+Video',
      }
    case 'article':
      return {
        duration: 3000,
        interval: 300,
        content: [
          `# ${title}`,
          '',
          `这是一篇由多媒体流水线自动生成的示例文章，主题围绕"${subject}"展开。`,
          '',
          '## 一、开场',
          '',
          '故事从一只穿着西装的猫走进会议室开始，所有人类同事面面相觑。',
          '',
          '## 二、反转',
          '',
          '它居然掏出了 PPT，开始汇报本季度的"猫粮采购 ROI 分析"。',
          '',
          '## 三、结尾',
          '',
          '原来它才是这家公司的 CEO——而你我才是被管理的"喵星人"。',
          '',
          '> 流水线模拟环境占位输出，正式接入后将由大语言模型实时生成。',
        ].join('\n'),
      }
    default:
      return null
  }
}

// POST /api/pipeline/run —— 启动多媒体流水线
pipelineRouter.post(
  '/run',
  authMiddleware,
  async (req: Request, res: Response) => {
    const body = req.body as PipelineBody
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const steps = Array.isArray(body.steps)
      ? body.steps.filter((s): s is string => typeof s === 'string')
      : []

    if (!prompt) {
      res.status(400).json({ error: '缺少提示词' })
      return
    }
    if (steps.length === 0) {
      res.status(400).json({ error: '至少选择一个步骤' })
      return
    }

    // 仅允许 image / video / article
    const validSteps = steps.filter(
      (s): s is 'image' | 'video' | 'article' =>
        s === 'image' || s === 'video' || s === 'article',
    )
    if (validSteps.length !== steps.length) {
      res.status(400).json({ error: '包含不支持的步骤' })
      return
    }

    setSSEHeaders(res)

    let aborted = false
    req.on('close', () => {
      aborted = true
    })

    const safeSend = (event: string, data: unknown): void => {
      if (aborted) return
      sendEvent(res, event, data)
    }

    // 单步执行：先发 step_start，按 interval 推送进度，到点发 step_done
    const runStep = (
      step: string,
    ): Promise<{ type: string; url?: string; content?: string }> =>
      new Promise((resolve) => {
        const config = getStepConfig(step, prompt)
        if (!config) {
          resolve({ type: step })
          return
        }

        const taskId = `${step}-${Date.now()}`
        safeSend('step_start', { step, taskId })

        let progress = 0
        const increment = (config.interval / config.duration) * 100
        const intervalTimer = setInterval(() => {
          progress = Math.min(95, progress + increment)
          safeSend('step_progress', { step, progress: Math.round(progress) })
        }, config.interval)

        setTimeout(() => {
          clearInterval(intervalTimer)
          safeSend('step_progress', { step, progress: 100 })
          safeSend('step_done', {
            step,
            url: config.url,
            content: config.content,
          })
          resolve({
            type: step,
            url: config.url,
            content: config.content,
          })
        }, config.duration)
      })

    try {
      const assets: Array<{ type: string; url?: string; content?: string }> = []
      // 顺序执行每个步骤（流水线式）
      for (const step of validSteps) {
        if (aborted) break
        const asset = await runStep(step)
        assets.push(asset)
      }
      if (!aborted) {
        safeSend('pipeline_done', { assets })
      }
    } catch (err) {
      safeSend('error', {
        error: err instanceof Error ? err.message : '流水线执行失败',
      })
    } finally {
      if (!aborted) res.end()
    }
  },
)
