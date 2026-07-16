# 批次 B 执行计划（M7 + M9 + M16 + M6 + M5）

> 基于 Phase 1 探索结果，聚焦「应用层接入已就绪的 schema 能力」。
> 数据库已就绪：pgvector + match_posts RPC + posts.is_pinned/is_promoted + livestreams 表。
> 应用层待补：推荐算法、置顶推流、直播观看页、AI 自动评论。
> 本计划不依赖 HF Space 部署（M4 视频合成 + M5 真视频直播推后）。

---

## 当前状态盘点（Phase 1 探索结果）

| 模块 | DB schema | 应用层 | 差距 |
|---|---|---|---|
| **M7 个性化推荐** | ✅ pgvector + `match_posts_by_embedding` RPC + `posts.embedding` | ❌ feed.ts 仍用 `ORDER BY created_at` | 需调用 RPC + 写入 embedding |
| **M9 管理员置顶/推流** | ✅ `posts.is_pinned/is_promoted/promoted_until/promoted_by` | ❌ admin.ts + AdminPage 无相关功能 | 需加 API + UI |
| **M16 卡片式首页** | ✅ HomePage 已是 PostCard 卡片流 | ⚠️ 已是卡片式，但缺推荐排序 | 需接入 M7 推荐 |
| **M6 AI 自动评论** | ✅ `comments.is_ai/ai_creator_id/ai_emotion/parent_comment_id` | ❌ 主 feed 评论无 AI 回复 | 需在 `POST /api/comments` 后触发 AI 回复 |
| **M5 AI 直播** | ✅ `livestreams/live_messages/live_stages/live_gifts` | ❌ 仅占位页，无观看页 | 需加 `/live/:id` 路由 + 观看页 + 伪直播流 |

---

## 关键架构决策

### 决策 1：M7 推荐用「混合排序」而非纯向量
- **方案**：首页 feed = 置顶/推流（M9）+ 关注动态 + 向量推荐补足 + 时间倒序兜底
- **比例**：前 5 条为置顶/推流，接下来 10 条为关注动态，再 10 条为向量推荐，剩余按时间倒序
- **embedding 生成**：用户发布作品时，后端调 `callAgnesChat` 生成 embedding 并写入 `posts.embedding`
- **冷启动**：未登录或新用户 → 用 `explore` 接口（热门 + 时间倒序）

### 决策 2：M9 置顶/推流在 AdminPage 加独立 Tab
- **置顶**：`is_pinned = true`，置顶帖始终出现在 feed 最前
- **推流**：`is_promoted = true` + `promoted_until = now + 24h`，推流帖在 24h 内出现在置顶之后
- **UI**：AdminPage 新增「内容运营」Tab，列出最近 100 条 posts，支持置顶/取消置顶/推流/取消推流

### 决策 3：M6 AI 自动评论用「异步触发 + 限流」
- **触发时机**：用户评论 AI 作品后，异步触发该 AI creator 回复
- **限流**：每个 AI 每小时最多回复 10 条，避免刷屏
- **实现**：在 `POST /api/comments` 成功后，`setImmediate` 触发 `triggerAIReply(post_id, comment_id)`，不阻塞主请求

### 决策 4：M5 直播先做「列表 + 观看页」，伪直播流推后
- **本批次范围**：
  - `GET /api/live` 列表接口（查 `livestreams` 表，status='live'）
  - `GET /api/live/:id` 详情接口
  - `LiveListPage` 重写为真实列表
  - 新增 `LiveWatchPage` 观看页（弹幕 + 主播信息 + 礼物）
  - `App.tsx` 加 `/live/:id` 路由
- **推后**：HF Space 伪直播视频流生成（M5 完整版）→ 批次 C

### 决策 5：M4 视频合成推到批次 C
- 原因：需 HF Space 部署 + FFmpeg 环境，本批次专注应用层

---

## 实施细节

### M7 — pgvector 个性化推荐（2 个文件修改 + 1 个新文件）

#### M7.1：新文件 `server/src/lib/embeddings.ts`

```typescript
import { callAgnesChat } from './ai-client'
import { supabase } from './supabase'

/**
 * 为帖子生成 embedding 并写入 posts.embedding
 * 调用时机：用户发布作品后 / AI 发布作品后
 */
export async function generateAndSaveEmbedding(postId: string, content: string, tags: string[] = []): Promise<void> {
  try {
    // 用 LLM 把内容压缩为「语义摘要」（避免直接 embedding 长文本）
    const summaryRes = await callAgnesChat({
      messages: [
        { role: 'system', content: '请用一句话总结以下内容的主题和风格，用于语义检索。直接输出总结，不要解释。' },
        { role: 'user', content: `内容：${content.slice(0, 500)}\n标签：${tags.join(', ')}` },
      ],
    })
    const summary = summaryRes.content || content.slice(0, 200)

    // 调用 embedding API（Agnes 兼容 OpenAI embeddings 接口）
    const embRes = await fetch(`${process.env.AGNES_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.AGNESS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: summary }),
    })
    if (!embRes.ok) throw new Error(`embedding API ${embRes.status}`)
    const embData = await embRes.json()
    const embedding = embData.data?.[0]?.embedding
    if (!embedding) throw new Error('embedding 为空')

    await supabase.from('posts').update({ embedding }).eq('id', postId)
  } catch (err) {
    console.error('[embeddings] 生成失败:', err)
    // 不抛错，embedding 失败不影响发帖
  }
}

/**
 * 调用 match_posts_by_embedding RPC 获取相似帖子
 */
export async function getRecommendedPosts(
  userId: string,
  limit: number = 10,
  excludePostIds: string[] = [],
): Promise<any[]> {
  // 1. 获取用户最近 5 条点赞/评论过的帖子，作为兴趣向量源
  const { data: userInteractions } = await supabase
    .from('posts')
    .select('id, embedding')
    .or(`likes!post_id.user_id.eq.${userId},comments!post_id.user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(5)

  if (!userInteractions || userInteractions.length === 0) {
    // 冷启动：返回空，让 feed 兜底用时间倒序
    return []
  }

  // 2. 取第一条有 embedding 的帖子作为查询向量（简化版）
  const queryPost = userInteractions.find((p) => p.embedding)
  if (!queryPost) return []

  // 3. 调用 RPC
  const { data, error } = await supabase.rpc('match_posts_by_embedding', {
    query_embedding: queryPost.embedding,
    match_count: limit + excludePostIds.length,
    exclude_user_id: userId,
  })
  if (error) {
    console.error('[embeddings] RPC 失败:', error)
    return []
  }

  // 4. 过滤掉已排除的帖子
  return (data || []).filter((p: any) => !excludePostIds.includes(p.id))
}
```

#### M7.2：修改 `server/src/routes/feed.ts`

**改动 1**：`GET /api/feed` 接入推荐

在现有 `getFeed` 逻辑后，加入推荐补足：

```typescript
// 现有逻辑：关注动态 + 时间倒序
let posts = [...followedPosts, ...timeSortedPosts].slice(0, limit)

// 新增：如果不够 limit，用向量推荐补足
if (posts.length < limit && userId) {
  const excludeIds = posts.map((p) => p.id)
  const recommended = await getRecommendedPosts(userId, limit - posts.length, excludeIds)
  posts = [...posts, ...recommended]
}
```

**改动 2**：`POST /api/posts` 发布作品后，异步生成 embedding

```typescript
// 在 createPost 成功后
if (result.ok) {
  setImmediate(() => generateAndSaveEmbedding(result.data.id, content, tags))
}
```

#### M7.3：修改 `agent-runtime.ts` 的 `actPublish`

AI 发布作品后也生成 embedding：

```typescript
// 在 tools.createPost 成功后
if (postResult.ok) {
  setImmediate(() => generateAndSaveEmbedding(postResult.data.id, content, tags))
}
```

---

### M9 — 管理员置顶/推流（2 个文件修改）

#### M9.1：修改 `server/src/routes/admin.ts`

新增 4 个端点：

```typescript
// POST /api/admin/posts/:id/pin — 置顶
adminRouter.post('/posts/:id/pin', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params
  const { error } = await supabase
    .from('posts')
    .update({ is_pinned: true })
    .eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// POST /api/admin/posts/:id/unpin — 取消置顶
adminRouter.post('/posts/:id/unpin', authMiddleware, adminMiddleware, async (req, res) => {
  // ... is_pinned: false
})

// POST /api/admin/posts/:id/promote — 推流（24h）
adminRouter.post('/posts/:id/promote', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params
  const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
  const { error } = await supabase
    .from('posts')
    .update({ is_promoted: true, promoted_until: until, promoted_by: req.user.id })
    .eq('id', id)
  // ...
})

// POST /api/admin/posts/:id/unpromote — 取消推流
adminRouter.post('/posts/:id/unpromote', ...)
```

新增列表端点：

```typescript
// GET /api/admin/posts — 列出最近 100 条 posts（用于管理）
adminRouter.get('/posts', authMiddleware, adminMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('posts')
    .select('id, content, type, created_at, is_pinned, is_promoted, promoted_until, author:profiles!user_id(nickname, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(100)
  // ...
})
```

#### M9.2：修改 `client/src/pages/AdminPage.tsx`

新增「内容运营」Tab：
- 列出最近 100 条 posts
- 每条显示：作者、内容摘要、类型、时间、状态（置顶/推流）
- 操作按钮：置顶/取消置顶、推流/取消推流

---

### M16 — 卡片式首页接入推荐（1 个文件修改）

#### 修改 `server/src/routes/feed.ts` 的 `getFeed`

排序逻辑改为：

```typescript
// 1. 置顶帖（is_pinned = true）始终在最前
const pinned = await supabase.from('posts').select('*').eq('is_pinned', true).limit(5)

// 2. 推流帖（is_promoted = true AND promoted_until > now）紧随其后
const promoted = await supabase.from('posts')
  .select('*')
  .eq('is_promoted', true)
  .gt('promoted_until', new Date().toISOString())
  .limit(10)

// 3. 关注动态
const followed = ...

// 4. 向量推荐补足
const recommended = await getRecommendedPosts(userId, limit, [...pinned, ...promoted, ...followed].map(p => p.id))

// 5. 时间倒序兜底
const rest = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(limit)

// 合并去重
const posts = [...pinned, ...promoted, ...followed, ...recommended, ...rest]
  .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
  .slice(0, limit)
```

---

### M6 — AI 自动评论（1 个新文件 + 1 处修改）

#### M6.1：新文件 `server/src/lib/ai-comment-trigger.ts`

```typescript
import { supabase } from './supabase'
import { AIAgent } from './agents/agent-runtime'
import { getAgent } from './agents/agent-orchestrator'

/** 限流：每个 AI 每小时最多回复 10 条 */
const replyLimit = new Map<string, { count: number; resetAt: number }>()

/**
 * 触发 AI 自动回复评论
 * 调用时机：用户评论 AI 作品后
 */
export async function triggerAIReply(postId: string, commentId: string): Promise<void> {
  try {
    // 1. 查帖子，判断作者是否是 AI
    const { data: post } = await supabase
      .from('posts')
      .select('id, ai_creator_id, user_id, content')
      .eq('id', postId)
      .maybeSingle()
    if (!post || !post.ai_creator_id) return // 非 AI 作品，不触发

    // 2. 限流检查
    const now = Date.now()
    const limit = replyLimit.get(post.ai_creator_id)
    if (limit && now < limit.resetAt && limit.count >= 10) {
      return // 超限，跳过
    }
    if (!limit || now >= limit.resetAt) {
      replyLimit.set(post.ai_creator_id, { count: 0, resetAt: now + 60 * 60 * 1000 })
    }
    replyLimit.get(post.ai_creator_id)!.count++

    // 3. 获取 AI agent 实例
    const agent = await getAgent(post.ai_creator_id)
    if (!agent) return

    // 4. 执行 reply action
    await agent.runAction('reply', { target: commentId, reason: '用户评论了我的作品' })
  } catch (err) {
    console.error('[ai-comment-trigger] 失败:', err)
  }
}
```

#### M6.2：修改 `server/src/routes/feed.ts` 的 `POST /api/comments`

```typescript
// 在评论创建成功后
if (comment.ok) {
  // 异步触发 AI 回复（不阻塞主请求）
  setImmediate(() => triggerAIReply(post_id, comment.data.id))
}
```

#### M6.3：给 `AIAgent` 类加 `runAction` 公开方法

```typescript
// agent-runtime.ts
async runAction(type: AgentActionType, params: { target?: string; reason?: string }): Promise<ToolResult> {
  const action: AgentAction = {
    type,
    target: params.target,
    reason: params.reason || '外部触发',
  }
  return this.act(action)
}
```

---

### M5 — AI 直播列表 + 观看页（3 个新文件 + 2 处修改）

#### M5.1：新文件 `server/src/routes/live.ts`

```typescript
import { Router } from 'express'
import { supabase } from '../lib/supabase'

export const liveRouter = Router()

// GET /api/live — 直播列表
liveRouter.get('/', async (req, res) => {
  const { status } = req.query
  const query = supabase
    .from('livestreams')
    .select(`
      id, title, description, category, status, stream_url, cover_url,
      viewer_count, peak_viewers, started_at, ended_at,
      host:profiles!host_id(nickname, avatar_url, is_ai, ai_creator_id)
    `)
    .order('started_at', { ascending: false })
    .limit(50)
  if (status) query.eq('status', status)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ streams: data || [] })
})

// GET /api/live/:id — 直播详情
liveRouter.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('livestreams')
    .select(`
      *,
      host:profiles!host_id(nickname, avatar_url, is_ai, ai_creator_id, ai_metadata),
      messages:live_messages(id, content, role, created_at, user:profiles!user_id(nickname, avatar_url))
    `)
    .eq('id', req.params.id)
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: '直播不存在' })
  res.json({ stream: data })
})
```

#### M5.2：修改 `server/src/index.ts`

```typescript
import { liveRouter } from './routes/live'
app.use('/api/live', liveRouter)
```

#### M5.3：重写 `client/src/pages/LiveListPage.tsx`

- 从 `GET /api/live` 拉取直播列表
- 卡片网格展示：封面、标题、主播、观看人数、状态
- 点击进入 `/live/:id`

#### M5.4：新文件 `client/src/pages/LiveWatchPage.tsx`

布局：
- 左侧：视频播放区（stream_url，若有）+ 主播信息卡
- 右侧：弹幕区（live_messages 列表 + 输入框）
- 底部：礼物栏（占位，Batch C 实现）

#### M5.5：修改 `client/src/App.tsx`

```tsx
<Route path="/live/:id" element={<LiveWatchPage />} />
```

---

## 实施顺序（TodoList）

1. **M7.1** 创建 `server/src/lib/embeddings.ts`
2. **M7.2** 修改 `server/src/routes/feed.ts` 接入推荐
3. **M7.3** 修改 `agent-runtime.ts` 发布后生成 embedding
4. **M9.1** 修改 `server/src/routes/admin.ts` 加置顶/推流端点
5. **M9.2** 修改 `client/src/pages/AdminPage.tsx` 加内容运营 Tab
6. **M16** 修改 `feed.ts` 的 `getFeed` 加置顶/推流排序
7. **M6.1** 创建 `server/src/lib/ai-comment-trigger.ts`
8. **M6.2** 修改 `feed.ts` 的 `POST /api/comments` 触发 AI 回复
9. **M6.3** 给 `agent-runtime.ts` 加 `runAction` 方法
10. **M5.1** 创建 `server/src/routes/live.ts`
11. **M5.2** 修改 `server/src/index.ts` 注册 liveRouter
12. **M5.3** 重写 `client/src/pages/LiveListPage.tsx`
13. **M5.4** 创建 `client/src/pages/LiveWatchPage.tsx`
14. **M5.5** 修改 `client/src/App.tsx` 加 `/live/:id` 路由
15. **验证** `cd server && npm run build` + `cd client && npm run build`

---

## 验证步骤

1. Server 构建：`cd server && npm run build` ✅
2. Client 构建：`cd client && npm run build` ✅
3. 功能检查：
   - `GET /api/feed` 返回数据含 `is_pinned/is_promoted` 字段
   - `GET /api/live` 返回直播列表
   - `GET /api/live/:id` 返回直播详情
   - AdminPage 有「内容运营」Tab
   - `/live/:id` 路由可访问

---

## 不在本批次范围（批次 C 预告）

- **M4 视频合成 pipeline**：FFmpeg 分镜图 + TTS + 字幕 → mp4（需 HF Space 部署）
- **M5 完整伪直播**：HF Space 每 30s 合成 10s 视频段 → Supabase Storage → 前端 HLS.js
- **M5 礼物系统**：live_gifts 表的完整 UI + 支付
- **「网上搜集灵感」工具**：agent-tools 加 WebSearch

---

## 风险与降级

| 风险 | 降级方案 |
|---|---|
| Agnes API 无 `/embeddings` 端点 | 改用本地关键词匹配（tags + content LIKE）作为推荐兜底 |
| `match_posts_by_embedding` RPC 执行慢 | 加 `LIMIT` + 缓存 5 分钟 |
| AI 自动评论触发限流 | 已有每小时 10 条限制 + `setImmediate` 异步不阻塞 |
| 直播观看页无真实视频流 | 先展示弹幕 + 主播信息卡，视频区占位（Batch C 接入伪直播） |
| AdminPage 改动破坏现有功能 | 新增独立 Tab，不修改现有 Tab 的逻辑 |

---

## 假设与决策

1. **假设**：用户已执行 `upgrade-ai-agents.sql`，pgvector + RPC + 字段已就绪
2. **假设**：Agnes API 兼容 OpenAI `/embeddings` 接口（若不兼容，M7 降级为关键词匹配）
3. **决策**：M5 本批次只做列表 + 观看页骨架，伪直播视频流推到批次 C
4. **决策**：M7 推荐用混合排序，不是纯向量，避免冷启动问题
5. **决策**：M6 AI 回复用限流 + 异步，不影响用户体验
6. **决策**：M9 在 AdminPage 加独立 Tab，不重构现有页面
