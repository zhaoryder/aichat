// =====================================================================
// 论坛 API（Express SSE）
// ---------------------------------------------------------------------
// GET  /api/forum/topics            分页列出话题
// GET  /api/forum/topic/:id         获取话题详情 + 帖子列表
// POST /api/forum/create            创建话题 + AI 串行流式首条回复（SSE）
// POST /api/forum/reply-stream      用户回帖 + AI 流式回复（SSE）
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { chatCompletionStream } from '../lib/ai-client'
import { moderateContent } from '../lib/moderation'
import { setSSEHeaders, sendEvent } from '../lib/sse'
import {
  createForumPost,
  createForumTopic,
  getTopicById,
  incrementTopicViews,
  isUserBanned,
  listForumPosts,
  listForumTopics,
} from '../lib/queries'
import type { ChatMessage, ForumPost, ForumTopic } from '../../shared/types'

export const forumRouter = Router()

// ---------------------------------------------------------------------
// GET /api/forum/topics —— 分页列出话题
// ---------------------------------------------------------------------

forumRouter.get('/topics', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.max(1, Math.min(50, Number(req.query.pageSize) || 20))
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

    const { data: topics, total } = await listForumTopics(page, pageSize)

    // 简单内存过滤（listForumTopics 不支持 search 参数）
    const filtered =
      search.length > 0
        ? topics.filter(
            (t) => t.title.includes(search) || t.content.includes(search)
          )
        : topics

    res.json({ topics: filtered, total })
  } catch (err) {
    console.error('[api/forum/topics] 异常：', err)
    res.status(500).json({ error: '服务器开小差了' })
  }
})

// ---------------------------------------------------------------------
// GET /api/forum/topic/:id —— 获取话题详情 + 帖子列表
// ---------------------------------------------------------------------

forumRouter.get('/topic/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const topic = await getTopicById(id)
    if (!topic) {
      res.status(404).json({ error: '话题不存在' })
      return
    }

    // 递增浏览数（不阻塞主流程）
    incrementTopicViews(id).catch(() => {
      // 浏览数更新失败不影响读取
    })

    const posts = await listForumPosts(id)
    res.json({ topic, posts })
  } catch (err) {
    console.error('[api/forum/topic] 异常：', err)
    res.status(500).json({ error: '服务器开小差了' })
  }
})

// ---------------------------------------------------------------------
// POST /api/forum/create —— 创建话题 + AI 串行流式首条回复（SSE）
// ---------------------------------------------------------------------

interface CreateTopicBody {
  title?: unknown
  content?: unknown
  agentIds?: unknown
}

forumRouter.post('/create', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    // 封禁检查
    const banned = await isUserBanned(user.id)
    if (banned) {
      res.status(403).json({ error: '账号已被封禁，暂时不能发言' })
      return
    }

    // 解析并校验请求体
    const body = req.body as CreateTopicBody
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const agentIds = Array.isArray(body.agentIds)
      ? body.agentIds.filter((a): a is string => typeof a === 'string')
      : []

    if (title.length < 5 || title.length > 100) {
      res.status(400).json({ error: '标题需 5-100 个字符' })
      return
    }
    if (content.length < 20 || content.length > 5000) {
      res.status(400).json({ error: '内容需 20-5000 个字符' })
      return
    }

    // 敏感词过滤（标题 + 内容）
    const titleMod = await moderateContent(title)
    if (!titleMod.ok) {
      res.status(400).json({ error: titleMod.reason ?? '标题包含敏感词，请修改' })
      return
    }
    const contentMod = await moderateContent(content)
    if (!contentMod.ok) {
      res.status(400).json({ error: contentMod.reason ?? '内容包含敏感词，请修改' })
      return
    }

    // 创建话题
    const topic = await createForumTopic(user.id, title, content, agentIds)

    // 保存用户帖（话题内容作为首条 user 帖）
    await createForumPost(topic.id, user.id, 'user', content)

    // SSE 流式推送各被 @智能体首条回复（串行）
    setSSEHeaders(res)
    sendEvent(res, 'start', { topicId: topic.id })

    // 客户端断开时的取消信号
    const abortController = new AbortController()
    req.on('close', () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    })

    // 无被 @智能体 → 直接结束
    if (agentIds.length === 0) {
      sendEvent(res, 'done', {})
      res.end()
      return
    }

    // 串行流式：逐个 AI 生成
    for (const agentId of agentIds) {
      try {
        sendEvent(res, 'agent_start', { agentId })

        const messages: ChatMessage[] = [
          {
            role: 'user',
            content: `话题标题：${title}\n话题内容：${content}\n请以你的人格特色回复这个话题，融入热梗，60-150字`,
          },
        ]

        let full = ''
        for await (const delta of chatCompletionStream(messages, agentId, {
          signal: abortController.signal,
        })) {
          full += delta
          sendEvent(res, 'token', { c: delta, agentId })
        }

        // 流结束后保存完整回复到 forum_posts
        if (full.trim()) {
          await createForumPost(topic.id, null, 'agent', full, agentId)
        }

        sendEvent(res, 'agent_done', { agentId })
      } catch (err) {
        // 单个 AI 失败不影响其它回复与话题本身
        console.error(
          `[forum/create] AI ${agentId} 流式生成失败：`,
          err instanceof Error ? err.message : err
        )
        sendEvent(res, 'agent_done', { agentId })
      }
    }

    sendEvent(res, 'done', {})
    res.end()
  } catch (err) {
    console.error('[api/forum/create] 异常：', err)
    // 若 SSE 已开始则推送 error 事件，否则返回 JSON
    if (res.headersSent) {
      sendEvent(res, 'error', { message: '服务器开小差了' })
      res.end()
    } else {
      res.status(500).json({ error: '服务器开小差了' })
    }
  }
})

// ---------------------------------------------------------------------
// POST /api/forum/reply-stream —— 用户回帖 + AI 流式回复（SSE）
// ---------------------------------------------------------------------

interface ReplyStreamBody {
  topicId?: unknown
  content?: unknown
  agentIds?: unknown
}

forumRouter.post(
  '/reply-stream',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = req.user!

    try {
      // 封禁检查
      const banned = await isUserBanned(user.id)
      if (banned) {
        res.status(403).json({ error: '账号已被封禁，暂时不能发言' })
        return
      }

      // 解析并校验请求体
      const body = req.body as ReplyStreamBody
      const topicId = typeof body.topicId === 'string' ? body.topicId.trim() : ''
      const content =
        typeof body.content === 'string' ? body.content.trim() : ''
      const agentIds = Array.isArray(body.agentIds)
        ? body.agentIds.filter((a): a is string => typeof a === 'string')
        : []

      if (!topicId) {
        res.status(400).json({ error: '缺少话题 ID' })
        return
      }
      if (content.length < 1 || content.length > 5000) {
        res.status(400).json({ error: '回帖内容需 1-5000 个字符' })
        return
      }

      // 敏感词过滤
      const mod = await moderateContent(content)
      if (!mod.ok) {
        res.status(400).json({ error: mod.reason ?? '内容包含敏感词，请修改' })
        return
      }

      // 确认话题存在
      const topic = await getTopicById(topicId)
      if (!topic) {
        res.status(404).json({ error: '话题不存在' })
        return
      }

      // 保存用户回帖
      const userPost = await createForumPost(topicId, user.id, 'user', content)

      // SSE 流式推送 AI 回复
      setSSEHeaders(res)
      sendEvent(res, 'start', { userPostId: userPost.id })

      // 客户端断开时的取消信号
      const abortController = new AbortController()
      req.on('close', () => {
        if (!abortController.signal.aborted) {
          abortController.abort()
        }
      })

      // 若无指定 agentIds，回退到话题 mentioned_agents
      const effectiveAgentIds = agentIds.length > 0 ? agentIds : topic.mentioned_agents ?? []

      if (effectiveAgentIds.length === 0) {
        sendEvent(res, 'done', {})
        res.end()
        return
      }

      // 拉取已有回帖（含刚保存的用户回帖）用于上下文与参与统计
      const posts = await listForumPosts(topicId)
      const participatedBefore = collectParticipatedAgents(posts)
      const baseContext = buildRecentContext(posts, topic, content)

      // --- 主 AI 回复：随机选 1 个智能体 ---
      const primaryAgentId = pickRandom(effectiveAgentIds)
      const primaryContent = await streamAgentReply(
        res,
        primaryAgentId,
        topic,
        baseContext,
        content,
        abortController.signal
      )

      let primarySavedId: string | null = null
      if (primaryContent) {
        const saved = await createForumPost(
          topicId,
          null,
          'agent',
          primaryContent,
          primaryAgentId
        )
        primarySavedId = saved.id
        sendEvent(res, 'done', { agentId: primaryAgentId, postId: saved.id })
      } else {
        sendEvent(res, 'done', { agentId: primaryAgentId, postId: null })
      }

      // --- AI 自发讨论（交叉接梗）：2+ AI 时 50% 概率 ---
      const participatedAfter = new Set(participatedBefore)
      if (primarySavedId) {
        participatedAfter.add(primaryAgentId)
      }

      if (participatedAfter.size >= 2 && Math.random() < 0.5) {
        // 重新拉取回帖，取最近 2 条 agent 回帖用于排除
        const freshPosts = await listForumPosts(topicId)
        const lastTwoAgentIds = freshPosts
          .filter((p) => p.author_type === 'agent' && p.agent_id)
          .slice(-2)
          .map((p) => p.agent_id as string)

        // 候选：参与过且不在最近 2 条 agent 回帖中
        const candidateIds = Array.from(participatedAfter).filter(
          (id) => !lastTwoAgentIds.includes(id)
        )

        if (candidateIds.length > 0) {
          const crossAgentId = pickRandom(candidateIds)
          // 主回复已保存，拼到上下文让接梗更自然
          const crossContext = primaryContent
            ? `${baseContext}\n刚才 ${primaryAgentId} 已回复：${primaryContent}`
            : baseContext

          const crossContent = await streamAgentReply(
            res,
            crossAgentId,
            topic,
            crossContext,
            content,
            abortController.signal
          )

          if (crossContent) {
            const saved = await createForumPost(
              topicId,
              null,
              'agent',
              crossContent,
              crossAgentId
            )
            sendEvent(res, 'done', { agentId: crossAgentId, postId: saved.id })
          } else {
            sendEvent(res, 'done', { agentId: crossAgentId, postId: null })
          }
        }
      }

      res.end()
    } catch (err) {
      console.error('[api/forum/reply-stream] 异常：', err)
      if (res.headersSent) {
        sendEvent(res, 'error', {
          message: err instanceof Error ? err.message : '服务器开小差了',
        })
        res.end()
      } else {
        res.status(500).json({ error: '服务器开小差了' })
      }
    }
  }
)

// ---------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------

/**
 * 流式推送单个 AI 的回复。返回完整内容字符串；失败返回 null。
 * 内部不保存到 DB（由调用方负责保存）。
 */
async function streamAgentReply(
  res: Response,
  agentId: string,
  topic: ForumTopic,
  context: string,
  userContent: string,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `${context}\n\n用户刚回复：${userContent}\n请以你的人格特色接梗回应，融入热梗，60-150字。话题是「${topic.title}」。`,
      },
    ]

    let full = ''
    for await (const delta of chatCompletionStream(messages, agentId, { signal })) {
      full += delta
      sendEvent(res, 'token', { c: delta, agentId })
    }

    if (!full.trim()) return null
    return full
  } catch (err) {
    console.error(
      `[forum/reply-stream] AI ${agentId} 流式生成失败：`,
      err instanceof Error ? err.message : err
    )
    return null
  }
}

/**
 * 构建最近回帖摘要，作为 AI 回复的上下文。
 */
function buildRecentContext(
  posts: ForumPost[],
  topic: ForumTopic,
  userContent: string
): string {
  const RECENT_POST_COUNT = 5
  const recent = posts.slice(-RECENT_POST_COUNT)
  const summary = recent
    .map((p) => {
      const speaker =
        p.author_type === 'agent' ? `AI(${p.agent_id})` : '用户'
      return `${speaker}：${p.content}`
    })
    .join('\n')

  return `话题标题：${topic.title}\n话题内容：${topic.content}\n最近回帖：\n${summary}\n用户最新回帖：${userContent}`
}

/**
 * 收集话题回帖中所有 author_type='agent' 的不同 agent_id。
 */
function collectParticipatedAgents(posts: ForumPost[]): string[] {
  const set = new Set<string>()
  for (const p of posts) {
    if (p.author_type === 'agent' && p.agent_id) {
      set.add(p.agent_id)
    }
  }
  return Array.from(set)
}

/**
 * 从数组中随机取一个元素。
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
