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
//   step_done     { step, url?, content?, taskId? }
//   pipeline_done { assets: Array<{ type, url?, content?, taskId? }> }
//   error         { error }
//
// 说明：真实接入 Agnes AI：
//   - image:  调用 generateImage 生成图片
//   - video:  调用 submitVideoTask 提交视频任务，返回 taskId（不阻塞等待）
//   - article: 调用 callAgnesChat 生成 Markdown 文章
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import {
  callAgnesChat,
  generateImage,
  submitVideoTask,
} from '../lib/ai-client'
import { addMediaAsset } from '../lib/media-asset'

export const pipelineRouter = Router()

interface PipelineBody {
  prompt?: unknown
  steps?: unknown
}

type StepName = 'image' | 'video' | 'article'

interface AssetResult {
  type: string
  url?: string
  content?: string
  taskId?: string
}

/**
 * 单步执行：先发 step_start，启动一个"伪进度"计时器（最多到 95%），
 * 真实 AI 调用完成后立即推 100% 并 step_done。
 */
function runStep(
  step: StepName,
  prompt: string,
  userId: string,
  safeSend: (event: string, data: unknown) => void,
  isAborted: () => boolean,
): Promise<AssetResult> {
  return new Promise(async (resolve) => {
    if (isAborted()) {
      resolve({ type: step })
      return
    }

    const taskId = `${step}-${Date.now()}`
    safeSend('step_start', { step, taskId })

    // 伪进度计时器：每秒推一次进度，最多到 95%
    let progress = 0
    const progressTimer = setInterval(() => {
      if (isAborted()) return
      // 渐近曲线：进度越接近 95，增长越慢
      progress = Math.min(95, progress + (95 - progress) * 0.15)
      safeSend('step_progress', { step, progress: Math.round(progress) })
    }, 1000)

    const stopProgress = () => {
      clearInterval(progressTimer)
      safeSend('step_progress', { step, progress: 100 })
    }

    try {
      let asset: AssetResult

      switch (step) {
        case 'image': {
          const url = await generateImage(prompt, { size: '1024x1024' })
          asset = { type: 'image', url }
          // 同步入库到素材库
          try {
            await addMediaAsset({
              userId,
              type: 'image',
              url,
              prompt,
              title: prompt.slice(0, 50),
              metadata: { source: 'pipeline/image' },
            })
          } catch {
            // 入库失败不影响流水线
          }
          break
        }

        case 'video': {
          // 视频任务提交后立即返回 taskId，前端可去视频工坊查看进度
          const videoTaskId = await submitVideoTask(prompt, { duration: 5 })
          asset = { type: 'video', taskId: videoTaskId }
          // 视频生成是异步的，前端需要轮询；这里只返回 taskId
          break
        }

        case 'article': {
          const systemPrompt = `你是创意写作大师。根据用户给定的主题，生成一篇短小精悍的 Markdown 文章。
要求：
1. 字数 300-600 字
2. 必须包含搞笑、反转或意外元素
3. 使用 Markdown 格式（含标题、段落、引用等）
4. 不引用网络流行语
5. 严格按 Markdown 语法输出，不要外层代码块`
          const userPrompt = `请围绕以下主题创作一篇短文：${prompt}`
          const content = await callAgnesChat(systemPrompt, userPrompt)
          asset = { type: 'article', content }
          break
        }

        default:
          asset = { type: step }
      }

      if (isAborted()) {
        resolve({ type: step })
        return
      }

      stopProgress()
      safeSend('step_done', {
        step,
        url: asset.url,
        content: asset.content,
        taskId: asset.taskId,
      })
      resolve(asset)
    } catch (err) {
      clearInterval(progressTimer)
      const errMsg = err instanceof Error ? err.message : `${step} 步骤失败`
      safeSend('step_done', { step, error: errMsg })
      resolve({ type: step })
    }
  })
}

// POST /api/pipeline/run —— 启动多媒体流水线
pipelineRouter.post(
  '/run',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!
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
      (s): s is StepName => s === 'image' || s === 'video' || s === 'article',
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
    const isAborted = () => aborted

    try {
      const assets: AssetResult[] = []
      // 顺序执行每个步骤（流水线式）
      for (const step of validSteps) {
        if (aborted) break
        const asset = await runStep(step, prompt, user.id, safeSend, isAborted)
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
