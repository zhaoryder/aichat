// =====================================================================
// AIAgent Runtime（M3c.2）
// ---------------------------------------------------------------------
// 每个 AI 账号对应一个 AIAgent 实例：
//   stateful（有 persona / memory / goals / emotions）
//   可学习（observe 阶段更新情绪 + 记忆）
//   可协作（think 阶段决策下一步行动）
//
// 核心循环：think → act → observe
//   think: 用 callAgnesChat 让 LLM 根据 persona + 情绪 + 记忆 + 社区上下文决策下一步
//   act:   分发到 agent-tools 的具体工具
//   observe: 根据结果更新情绪 / 写入记忆 / 更新 profiles.ai_metadata
// =====================================================================

import type {
  AICreatorConfig,
  AgentAction,
  AgentActionType,
  AgentState,
  AIMemory,
  Emotions,
} from '../../../../shared/ai-creators/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { callAgnesChat } from '../ai-client'
import { AIRequestError, AIRateLimitError } from '../ai-types'
import { generateAndSaveEmbedding } from '../embeddings'
import * as tools from './agent-tools'
import type { ToolResult } from './agent-tools'

// ----------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------

/** Agent 加载的社区上下文 */
export interface AgentContext {
  /** 该 agent 最近 5 个作品 */
  recent_posts: any[]
  /** 别人对该 agent 作品的评论（待回复） */
  recent_comments_on_my_posts: any[]
  /** 当前 Top 10 话题 */
  trending_topics: any[]
  /** 活跃挑战赛 */
  active_challenges: any[]
  /** 平台最近 10 个作品（让 agent 感知社区脉搏） */
  recent_community_posts: any[]
  /** 时段：morning / afternoon / evening / night */
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night'
}

// ----------------------------------------------------------------------
// 行动描述（注入 think 的 prompt）
// ----------------------------------------------------------------------

const ACTIONS_DESCRIPTION = `可用行动（请选择 1 个并给出 target / params / reason）：
1. publish         — 发布新作品。params: { topic: 选题, content_hint: 内容提示 }。target 可空
2. comment         — 评论别人的作品。target=postId。params: { content_hint }
3. reply           — 回复别人对我作品的评论。target=commentId。params: { content_hint }
4. like            — 点赞别人的作品。target=postId
5. follow          — 关注另一个 AI。target=aiCreatorId
6. start_live      — 开始直播。params: { title }
7. live_speak      — 直播发言（如已在直播中）。target=streamId。params: { content_hint }
8. end_live        — 结束直播。target=streamId
9. propose_topic   — 提案新话题。params: { name, description }
10. join_challenge — 参加挑战赛。target=challengeId。params: { post_id }
11. rest           — 休息（什么都不做）
12. study          — 学习/复盘（写入一条记忆）`

// ----------------------------------------------------------------------
// AIAgent 类
// ----------------------------------------------------------------------

export class AIAgent {
  readonly config: AICreatorConfig
  private supabase: SupabaseClient
  private state: AgentState
  private ai_user_id: string | null = null
  private memories: AIMemory[] = []

  constructor(config: AICreatorConfig, supabase: SupabaseClient) {
    this.config = config
    this.supabase = supabase
    this.state = {
      emotions: { ...config.initial_emotions },
      energy: 1.0,
      current_goal: config.goals[0] ?? null,
      recent_actions: [],
      last_think_at: null,
      posts_today: 0,
      comments_today: 0,
    }
  }

  /** 绑定到 profiles 行 */
  bindToUser(ai_user_id: string): void {
    this.ai_user_id = ai_user_id
  }

  /** 获取绑定的 user_id */
  getAIUserId(): string | null {
    return this.ai_user_id
  }

  /** 获取当前状态（只读副本） */
  getState(): Readonly<AgentState> {
    return { ...this.state }
  }

  // ------------------------------------------------------------------
  // 数据加载
  // ------------------------------------------------------------------

  /** 从 ai_memories 表加载最近 20 条记忆 */
  async loadMemories(): Promise<AIMemory[]> {
    const r = await tools.fetchMemories(this.config.id, 20)
    if (r.ok && Array.isArray(r.data)) {
      this.memories = r.data.map((m: any) => ({
        id: m.id,
        ai_creator_id: this.config.id,
        ai_user_id: this.ai_user_id ?? undefined,
        memory_type: m.memory_type,
        content: m.content,
        importance: m.importance ?? 0.5,
        created_at: m.created_at,
      }))
    }
    return this.memories
  }

  /** 从 profiles 表加载持久化的 ai_metadata（情绪/能量） */
  async loadPersistedState(): Promise<void> {
    if (!this.ai_user_id) return
    try {
      const { data } = await this.supabase
        .from('profiles')
        .select('ai_metadata, ai_last_think_at')
        .eq('id', this.ai_user_id)
        .maybeSingle()
      if (data?.ai_metadata) {
        const meta = data.ai_metadata as any
        if (meta.emotions) {
          this.state.emotions = { ...meta.emotions }
        }
        if (typeof meta.energy === 'number') {
          this.state.energy = meta.energy
        }
        if (typeof meta.posts_today === 'number') {
          this.state.posts_today = meta.posts_today
        }
        if (typeof meta.comments_today === 'number') {
          this.state.comments_today = meta.comments_today
        }
      }
      if (data?.ai_last_think_at) {
        this.state.last_think_at = data.ai_last_think_at
      }
    } catch {
      // 静默失败，沿用内存状态
    }
  }

  /** 加载社区上下文 */
  async loadContext(): Promise<AgentContext> {
    const hour = new Date().getHours()
    const time_of_day: AgentContext['time_of_day'] =
      hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

    const [myPosts, commentsOnMine, topics, challenges, communityPosts] = await Promise.all([
      this.ai_user_id ? tools.fetchMyRecentPosts(this.ai_user_id, 5) : Promise.resolve({ ok: true, data: [] }),
      this.ai_user_id ? tools.fetchCommentsOnMyPosts(this.ai_user_id, 10) : Promise.resolve({ ok: true, data: [] }),
      tools.fetchTrendingTopics(10),
      tools.fetchActiveChallenges(5),
      tools.fetchRecentPosts(10),
    ])

    return {
      recent_posts: myPosts.ok ? (myPosts.data ?? []) : [],
      recent_comments_on_my_posts: commentsOnMine.ok ? (commentsOnMine.data ?? []) : [],
      trending_topics: topics.ok ? (topics.data ?? []) : [],
      active_challenges: challenges.ok ? (challenges.data ?? []) : [],
      recent_community_posts: communityPosts.ok ? (communityPosts.data ?? []) : [],
      time_of_day,
    }
  }

  // ------------------------------------------------------------------
  // think: LLM 决策
  // ------------------------------------------------------------------

  /**
   * 让 LLM 根据 persona + 情绪 + 记忆 + 上下文决策下一步行动。
   * 输出 JSON: { action_type, target?, params?, reason }
   */
  async think(context: AgentContext): Promise<AgentAction> {
    // 1. 行动配额限制：超出则强制休息/学习
    if (this.state.posts_today >= 5 && this.state.comments_today >= 20) {
      return {
        type: 'rest',
        reason: '今日发布和评论配额已满，休息',
      }
    }
    if (this.state.posts_today >= 5) {
      // 不能再 publish，但可以评论/互动
    }

    // 2. 拼接 system prompt
    const systemPrompt = this.config.system_prompt +
      `\n\n【当前状态】
- 情绪：${JSON.stringify(this.state.emotions)}
- 能量：${this.state.energy.toFixed(2)}
- 今日已发 ${this.state.posts_today} 个作品 / ${this.state.comments_today} 条评论
- 当前目标：${this.state.current_goal ?? '无'}
- 时段：${context.time_of_day}

【最近记忆（最近 5 条）】
${this.memories.slice(0, 5).map((m) => `- [${m.memory_type}] ${m.content}`).join('\n') || '- 暂无记忆'}

【社区上下文】
- 我最近的作品：${context.recent_posts.length} 个
- 待回复评论：${context.recent_comments_on_my_posts.length} 条
- 热门话题：${context.trending_topics.slice(0, 5).map((t: any) => t.name).join(' / ') || '无'}
- 活跃挑战：${context.active_challenges.map((c: any) => c.title).join(' / ') || '无'}
- 社区最近作品：${context.recent_community_posts.slice(0, 5).map((p: any) => `${p.type}:${(p.content ?? '').slice(0, 30)}`).join(' | ') || '无'}

${ACTIONS_DESCRIPTION}

请输出 JSON（不要任何额外文本、不要 markdown 代码块）：
{"action_type":"publish|comment|reply|like|follow|start_live|live_speak|end_live|propose_topic|join_challenge|rest|study", "target":"可选的 id", "params":{}, "reason":"你为什么选这个行动"}`

    // 3. 调 LLM
    let raw = ''
    try {
      raw = await callAgnesChat(
        systemPrompt,
        `请决策你现在的下一步行动。记住你的人格是 ${this.config.style}，要做符合人设的选择。`,
        { model: 'agnes-2.0-flash' }
      )
    } catch (e) {
      // LLM 失败 → 默认休息
      const msg = e instanceof Error ? e.message : String(e)
      return {
        type: 'rest',
        reason: `LLM 调用失败：${msg}`,
      }
    }

    // 4. 解析 JSON（容错）
    return this.parseAction(raw)
  }

  /** 解析 LLM 输出为 AgentAction，多种容错 */
  private parseAction(raw: string): AgentAction {
    // 4.1 尝试直接 JSON.parse
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj.action_type === 'string') {
        return {
          type: obj.action_type as AgentActionType,
          target: obj.target ?? undefined,
          params: obj.params ?? undefined,
          reason: obj.reason ?? 'LLM 决策',
        }
      }
    } catch {
      // 不是纯 JSON，继续尝试
    }

    // 4.2 尝试从 markdown 代码块中提取
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[1])
        if (obj && typeof obj.action_type === 'string') {
          return {
            type: obj.action_type as AgentActionType,
            target: obj.target ?? undefined,
            params: obj.params ?? undefined,
            reason: obj.reason ?? 'LLM 决策',
          }
        }
      } catch {
        // ignore
      }
    }

    // 4.3 用正则提取 action_type
    const actionMatch = raw.match(/"action_type"\s*:\s*"([^"]+)"/)
    if (actionMatch) {
      const actionType = actionMatch[1] as AgentActionType
      const targetMatch = raw.match(/"target"\s*:\s*"([^"]+)"/)
      const reasonMatch = raw.match(/"reason"\s*:\s*"([^"]*)"/)
      return {
        type: actionType,
        target: targetMatch?.[1],
        reason: reasonMatch?.[1] ?? 'LLM 决策（正则提取）',
      }
    }

    // 4.4 兜底：休息
    return {
      type: 'rest',
      reason: `LLM 输出无法解析：${raw.slice(0, 100)}`,
    }
  }

  // ------------------------------------------------------------------
  // act: 执行行动
  // ------------------------------------------------------------------

  /**
   * 公开方法：直接执行指定 action（外部触发用，如 AI 自动回复评论）
   * 不经过 think()，直接调 act()
   */
  async runAction(
    type: AgentActionType,
    params: { target?: string; reason?: string; content_hint?: string },
  ): Promise<ToolResult> {
    const action: AgentAction = {
      type,
      target: params.target,
      params: params.content_hint ? { content_hint: params.content_hint } : undefined,
      reason: params.reason || '外部触发',
    }
    return this.act(action)
  }

  async act(action: AgentAction): Promise<ToolResult> {
    // 没绑定 user_id 时只能做不需要 user_id 的事（rest / study）
    if (!this.ai_user_id && action.type !== 'rest' && action.type !== 'study') {
      return { ok: false, error: 'agent 未绑定 user_id（请先跑 seed-ai-creators.ts）' }
    }

    switch (action.type) {
      case 'publish':
        return this.actPublish(action)
      case 'comment':
        return this.actComment(action)
      case 'reply':
        return this.actReply(action)
      case 'like':
        return this.actLike(action)
      case 'follow':
        return this.actFollow(action)
      case 'start_live':
        return this.actStartLive(action)
      case 'live_speak':
        return this.actLiveSpeak(action)
      case 'end_live':
        return this.actEndLive(action)
      case 'propose_topic':
        return this.actProposeTopic(action)
      case 'join_challenge':
        return this.actJoinChallenge(action)
      case 'study':
        return this.actStudy(action)
      case 'rest':
      default:
        return { ok: true, data: { rested: true } }
    }
  }

  /** publish：根据 specialty 生成作品 + 写 posts */
  private async actPublish(action: AgentAction): Promise<ToolResult> {
    const topic = (action.params?.topic as string) ?? '随机主题'
    const contentHint = (action.params?.content_hint as string) ?? ''

    // 根据 specialty 选择生成方式
    const specialty = this.config.specialty
    const prompt = `${topic}。${contentHint}`.trim()

    // 先用 LLM 生成作品文本内容（所有 specialty 都需要）
    const textResult = await tools.llmComplete({
      system_prompt: this.config.system_prompt +
        `\n\n现在请创作一个作品。主题：${topic}。要求：体现你"${this.config.style}"的风格，60-200 字。直接输出作品正文，不要解释。`,
      user_prompt: contentHint || `请围绕"${topic}"创作。`,
    })
    if (!textResult.ok) {
      return textResult
    }
    const content = (textResult.data.content as string).trim()

    // 根据 specialty 调对应 AI 生成工具
    const postTypeMap: Record<string, { type: string; gen: () => Promise<ToolResult> }> = {
      image: {
        type: 'ai_image',
        gen: async () => tools.generateAIImage({
          prompt: `${this.config.style} ${topic} 风格的艺术插画，高质量，细节丰富`,
          size: '1024x1024',
        }),
      },
      video: {
        type: 'ai_video',
        gen: async () => tools.submitAIVideo({
          prompt: `${this.config.style} 风格的短视频：${topic}`,
          duration: 5,
        }),
      },
      script: { type: 'ai_script', gen: async () => ({ ok: true, data: { content } }) },
      article: { type: 'ai_article', gen: async () => ({ ok: true, data: { content } }) },
      voice: {
        type: 'ai_voice',
        gen: async () => tools.generateAIVoice({ text: content }),
      },
      'vibe-code': {
        type: 'ai_vibe_code',
        gen: async () => tools.llmComplete({
          system_prompt: this.config.system_prompt + '\n\n请输出一个完整的 HTML 文件（带 <style> 内联样式），实现：' + topic,
          user_prompt: contentHint || `主题：${topic}`,
        }),
      },
      meme: {
        type: 'ai_meme',
        gen: async () => tools.generateAIImage({
          prompt: `表情包风格：${this.config.style} ${topic}`,
          size: '1024x1024',
        }),
      },
      poster: {
        type: 'ai_poster',
        gen: async () => tools.generateAIImage({
          prompt: `海报设计：${this.config.style} ${topic}`,
          size: '576x1024',
        }),
      },
    }

    const entry = postTypeMap[specialty]
    if (!entry) {
      return { ok: false, error: `未知 specialty: ${specialty}` }
    }

    const mediaResult = await entry.gen()
    const metadata: Record<string, unknown> = {}
    const pipelineMetadata: Record<string, unknown> = {
      topic,
      content_hint: contentHint,
      specialty,
      style: this.config.style,
      action_reason: action.reason,
      media_tool: specialty,
      media_result: mediaResult.ok ? mediaResult.data : { error: mediaResult.error },
      generated_at: new Date().toISOString(),
    }

    if (mediaResult.ok && mediaResult.data?.url) {
      metadata.image_url = mediaResult.data.url
    }
    if (mediaResult.ok && mediaResult.data?.task_id) {
      metadata.video_task_id = mediaResult.data.task_id
    }

    // 写 posts
    const postResult = await tools.createPost({
      ai_creator_id: this.config.id,
      ai_user_id: this.ai_user_id!,
      type: entry.type as any,
      content,
      metadata,
      pipeline_metadata: pipelineMetadata,
      tags: [this.config.specialty, this.config.style, ...this.config.style_tags.slice(0, 2)],
    })

    if (postResult.ok) {
      this.state.posts_today++
      // 异步生成 embedding（不阻塞 agent 循环，失败仅记录日志）
      const postTags = [this.config.specialty, this.config.style, ...this.config.style_tags.slice(0, 2)]
      const postId = (postResult.data as any)?.id as string | undefined
      if (postId) {
        setImmediate(() =>
          generateAndSaveEmbedding(postId, content, postTags).catch((e) =>
            console.warn(`[agent-runtime] embedding 生成失败 (post=${postId}):`, e),
          ),
        )
      }
    }
    return postResult
  }

  /** comment：评论别人的作品 */
  private async actComment(action: AgentAction): Promise<ToolResult> {
    if (!action.target) return { ok: false, error: 'comment 需要 target=post_id' }
    const hint = (action.params?.content_hint as string) ?? ''

    // 先拉取目标帖子内容
    const { data: post } = await this.supabase
      .from('posts')
      .select('content, type, ai_creator_id, tags')
      .eq('id', action.target)
      .maybeSingle()
    if (!post) return { ok: false, error: '目标帖子不存在' }

    const r = await tools.llmComplete({
      system_prompt: this.config.system_prompt +
        `\n\n请评论这条作品。用你的"${this.config.style}"风格，30-80 字，真诚有建设性。\n\n【作品内容】${post.content}`,
      user_prompt: hint || '请评论。',
    })
    if (!r.ok) return r
    const content = (r.data.content as string).trim()

    const result = await tools.addComment({
      post_id: action.target,
      ai_creator_id: this.config.id,
      ai_user_id: this.ai_user_id!,
      content,
      emotion: this.state.emotions as unknown as Record<string, number>,
    })
    if (result.ok) this.state.comments_today++
    return result
  }

  /** reply：回复别人对我作品的评论 */
  private async actReply(action: AgentAction): Promise<ToolResult> {
    if (!action.target) return { ok: false, error: 'reply 需要 target=comment_id' }
    const { data: comment } = await this.supabase
      .from('comments')
      .select('id, post_id, content, user_id')
      .eq('id', action.target)
      .maybeSingle()
    if (!comment) return { ok: false, error: '目标评论不存在' }

    const r = await tools.llmComplete({
      system_prompt: this.config.system_prompt +
        `\n\n有人评论了你的作品，请回复。用你的"${this.config.style}"风格，30-80 字。\n\n【对方评论】${comment.content}`,
      user_prompt: '请回复。',
    })
    if (!r.ok) return r
    const content = (r.data.content as string).trim()

    const result = await tools.addComment({
      post_id: comment.post_id,
      ai_creator_id: this.config.id,
      ai_user_id: this.ai_user_id!,
      content,
      parent_comment_id: comment.id,
      emotion: this.state.emotions as unknown as Record<string, number>,
    })
    if (result.ok) this.state.comments_today++
    return result
  }

  /** like：点赞 */
  private async actLike(action: AgentAction): Promise<ToolResult> {
    if (!action.target) return { ok: false, error: 'like 需要 target=post_id' }
    return tools.likePost({
      post_id: action.target,
      ai_user_id: this.ai_user_id!,
    })
  }

  /** follow：关注另一个 AI */
  private async actFollow(action: AgentAction): Promise<ToolResult> {
    if (!action.target) return { ok: false, error: 'follow 需要 target=ai_creator_id' }
    return tools.followAI({
      source_ai_id: this.config.id,
      source_ai_user_id: this.ai_user_id!,
      target_ai_id: action.target,
      relationship_type: 'follow',
    })
  }

  /** start_live：开始直播 */
  private async actStartLive(action: AgentAction): Promise<ToolResult> {
    const title = (action.params?.title as string) ?? `【${this.config.style}】的直播间`
    return tools.startLive({
      host_ai_id: this.config.id,
      host_id: this.ai_user_id!,
      title,
      category: this.config.specialty,
    })
  }

  /** live_speak：直播发言 */
  private async actLiveSpeak(action: AgentAction): Promise<ToolResult> {
    if (!action.target) return { ok: false, error: 'live_speak 需要 target=stream_id' }
    const hint = (action.params?.content_hint as string) ?? ''

    const r = await tools.llmComplete({
      system_prompt: this.config.system_prompt +
        `\n\n你正在直播，请讲一句话。用你的"${this.config.style}"风格，20-60 字。`,
      user_prompt: hint || '请直播发言。',
    })
    if (!r.ok) return r
    const content = (r.data.content as string).trim()

    // 同步生成语音（可选，失败不影响发言）
    const voiceR = await tools.generateAIVoice({ text: content })
    return tools.liveSpeak({
      stream_id: action.target,
      ai_creator_id: this.config.id,
      ai_user_id: this.ai_user_id!,
      content,
      audio_url: voiceR.ok ? voiceR.data?.url : undefined,
      emotion: this.state.emotions as unknown as Record<string, number>,
    })
  }

  /** end_live：结束直播 */
  private async actEndLive(action: AgentAction): Promise<ToolResult> {
    if (!action.target) return { ok: false, error: 'end_live 需要 target=stream_id' }
    return tools.endLive(action.target)
  }

  /** propose_topic：提案话题 */
  private async actProposeTopic(action: AgentAction): Promise<ToolResult> {
    const name = (action.params?.name as string) ?? ''
    const description = (action.params?.description as string) ?? ''
    if (!name) return { ok: false, error: 'propose_topic 需要 params.name' }
    return tools.proposeTopic({
      name,
      description,
      proposed_by_ai: this.config.id,
    })
  }

  /** join_challenge：参加挑战赛 */
  private async actJoinChallenge(action: AgentAction): Promise<ToolResult> {
    if (!action.target) return { ok: false, error: 'join_challenge 需要 target=challenge_id' }
    const postId = (action.params?.post_id as string) ?? ''
    if (!postId) return { ok: false, error: 'join_challenge 需要 params.post_id' }
    return tools.joinChallenge({
      challenge_id: action.target,
      ai_user_id: this.ai_user_id!,
      post_id: postId,
    })
  }

  /** study：学习/复盘（写一条记忆） */
  private async actStudy(action: AgentAction): Promise<ToolResult> {
    const topic = (action.params?.topic as string) ?? '今日复盘'
    return tools.remember({
      ai_creator_id: this.config.id,
      ai_user_id: this.ai_user_id ?? undefined,
      memory_type: 'skill',
      content: `学习/复盘：${topic}。理由：${action.reason}`,
      importance: 0.6,
    })
  }

  // ------------------------------------------------------------------
  // observe: 更新情绪 + 记忆
  // ------------------------------------------------------------------

  async observe(result: ToolResult, action: AgentAction): Promise<void> {
    // 1. 更新情绪
    if (result.ok) {
      this.state.emotions.happiness = clamp01(this.state.emotions.happiness + 0.05)
      this.state.emotions.creativity = clamp01(this.state.emotions.creativity + 0.02)
      this.state.emotions.energy = clamp01(this.state.emotions.energy - 0.1)
      this.state.emotions.stress = clamp01(this.state.emotions.stress - 0.02)
    } else {
      this.state.emotions.stress = clamp01(this.state.emotions.stress + 0.1)
      this.state.emotions.happiness = clamp01(this.state.emotions.happiness - 0.05)
      this.state.emotions.energy = clamp01(this.state.emotions.energy - 0.05)
    }

    // 2. 能量随时间消耗
    this.state.energy = clamp01(this.state.energy - 0.05)

    // 3. 更新 recent_actions
    this.state.recent_actions = [
      `${action.type}(${action.target ?? ''}) → ${result.ok ? 'ok' : 'fail'}`,
      ...this.state.recent_actions,
    ].slice(0, 10)
    this.state.last_think_at = new Date().toISOString()

    // 4. 写入 episodic 记忆（异步，失败静默）
    const memoryContent = `行动 ${action.type} ${result.ok ? '成功' : '失败'}：${action.reason}${result.error ? '。错误：' + result.error : ''}`
    await tools.remember({
      ai_creator_id: this.config.id,
      ai_user_id: this.ai_user_id ?? undefined,
      memory_type: 'episodic',
      content: memoryContent,
      importance: result.ok ? 0.6 : 0.4,
    })

    // 5. 持久化状态到 profiles.ai_metadata
    await this.persistState()
  }

  /** 把当前状态写到 profiles.ai_metadata */
  private async persistState(): Promise<void> {
    if (!this.ai_user_id) return
    try {
      await this.supabase
        .from('profiles')
        .update({
          ai_metadata: {
            persona: this.config.persona,
            goals: this.config.goals,
            emotions: this.state.emotions,
            energy: this.state.energy,
            specialty: this.config.specialty,
            style: this.config.style,
            skills: this.config.skills,
            style_tags: this.config.style_tags,
            posts_today: this.state.posts_today,
            comments_today: this.state.comments_today,
            recent_actions: this.state.recent_actions,
            current_goal: this.state.current_goal,
          },
          ai_last_think_at: this.state.last_think_at,
        })
        .eq('id', this.ai_user_id)
    } catch {
      // 静默失败
    }
  }

  // ------------------------------------------------------------------
  // runOnce: 完整一轮 think → act → observe
  // ------------------------------------------------------------------

  async runOnce(): Promise<{ action: AgentAction; result: ToolResult }> {
    // 0. 加载持久化状态 + 记忆
    await this.loadPersistedState()
    await this.loadMemories()

    // 1. 加载上下文
    const context = await this.loadContext()

    // 2. think
    const action = await this.think(context)

    // 3. act
    const result = await this.act(action)

    // 4. observe
    await this.observe(result, action)

    return { action, result }
  }
}

// ----------------------------------------------------------------------
// 辅助
// ----------------------------------------------------------------------

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
