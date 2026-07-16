# AI 创作社区重构 — 批次 A 收尾续作计划

> 基于 v3 终极版计划（`.trae/documents/ai-creator-community-rebuild.md`）的执行续作。
> M1 / M2 / M3a / M3b 已完成，本计划聚焦 **批次 A 剩余工作（M3c / M3d / M3e / M8 / M8b）+ 验证**，并预告批次 B 的简化方案。
> 用户选择「批次A收尾优先」策略，本计划不展开批次 C / D。

---

## 关键约束变更（重要）

### 原计划假设
- 用户注册 Oracle Cloud Always Free 4C/24G ARM（需信用卡）作为长跑后台
- nginx-rtmp 推流 + FFmpeg 视频合成

### 实际情况
- **用户没有信用卡** → Oracle Cloud 不可用
- **改用 Hugging Face Spaces**（免费 + 无需信用卡 + Docker 化 + 可装 FFmpeg）
- Supabase pgvector 迁移执行状态不明（计划中列为用户确认项）

### 架构调整（本计划采用）

| 原方案 | 调整后 | 说明 |
|---|---|---|
| Oracle Cloud ARM 跑 agent loop | **Hugging Face Docker Space 跑 agent loop** | 免费 CPU Basic 2 vCPU/16GB，可装 FFmpeg |
| Oracle Cloud systemd timer 每分钟 cron | **HF Space 内 setInterval(60_000)** | Space 常驻进程 |
| FFmpeg 视频合成（分镜图 + TTS + 字幕 → mp4） | **保留 FFmpeg 视频合成**（HF Docker 可装） | 在 Space 内合成完整 mp4 |
| nginx-rtmp → HLS 真直播推流 | **伪直播（Pseudo-Live）**：Space 每 30s 合成 1 段 10s 短视频 → 上传 Supabase Storage → 前端 HLS.js 按序播放 | HF Space 仅暴露 HTTP，无法开 RTMP 1935 端口 |
| Oracle stream-generator systemd 服务 | **HF Space 内 setInterval(30_000)** | 同进程跑两个循环 |

**HF Space 优势**：
- 免费层 2 vCPU / 16GB RAM（够用）
- 无需信用卡（GitHub 登录即可）
- Docker 化，可装 FFmpeg + x264 + Node.js 20
- 可挂持久存储（小量免费，超出 $5/月 20GB）
- 可被外部 HTTP 唤醒（不依赖 Space 状态）
- 私有 Space 可放敏感 token

**HF Space 限制**：
- 免费层无 GPU（CPU 软编 FFmpeg 720p 每分钟 ~30s 处理，可接受）
- Space 闲置会 sleep，需定期 ping 或用 `/api/internal/tick` 触发
- 仅暴露 HTTP/HTTPS（无法开 RTMP 1935），所以直播只能伪直播
- 持久存储免费额度有限（建议定期清理旧视频）

**结论**：批次 A 完全不依赖外部服务器（agent loop 可在 Railway in-process 或 HF Space 跑，二选一）。批次 B 的 M4 视频合成和 M5 AI 直播走 HF Space + FFmpeg 方案，真视频合成保留。

---

## 当前状态盘点（Phase 1 探索结果）

### ✅ 已完成（上一会话）

| 模块 | 文件 | 状态 |
|---|---|---|
| M1 GitHub Dark 主题 | `client/src/styles/globals.css` / `client/tailwind.config.ts` / `card.tsx` / `button.tsx` | 已重写为 GitHub dark 配色 + SF Mono 字体 |
| M2 发布作品入口前移 | `client/src/components/layout/Sidebar.tsx` / `client/src/App.tsx` / `StudioPage.tsx` / 3 个占位页（LiveListPage / TopicsPage / ChallengesPage） | 「创意工坊」→「发布作品」，加 `/publish` 路由，加 AI 直播入口 |
| M3a 数据库迁移 | `supabase/migrations/upgrade-ai-agents.sql`（~540 行） | pgvector 扩展 + 20 张新表 + 2 个 RPC + RLS 全部写好（**用户需在 Supabase SQL Editor 执行**） |
| M3b 150 AI 创作者配置 | `shared/ai-creators/{types,archetypes,index}.ts` | 8 专长 × (25+25+25+25+15+20+10+5) = 150 个 AICreatorConfig，每个含 persona/goals/skills/system_prompt |

### ⏳ 待完成（本计划目标）

| 模块 | 范围 | 依赖 |
|---|---|---|
| M3c Agent Runtime | `server/src/lib/agents/{agent-tools,agent-runtime,agent-orchestrator}.ts` | M3b ✅ |
| M3d 注册脚本 | `server/scripts/seed-ai-creators.ts` | M3a + M3b ✅ |
| M3e 内部 API 端点 | `server/src/routes/internal.ts` | M3c |
| M3f HF Space 部署文件 | `huggingface-space/{Dockerfile,README.md,package.json,index.ts,.env.example}` | M3c（仅建文件，不部署） |
| M8 Specialty Agents + LangGraph | `server/src/lib/agents/{8 specialty files, agent-graph.ts, index.ts}` | M3c |
| M8b Studio 页面加 AI 协作者选择器 | 9 个 `client/src/pages/studio/*.tsx` + 新组件 `AICollaboratorPicker.tsx` | M8 |
| 批次 A 验证 | `npm install langgraph` + 本地 `npm run build` 通过 | 全部 |

---

## 实施细节

### M3c — Agent Runtime（3 个新文件）

**目标**：实现 stateful AI agent 的 think → act → observe 循环。

#### 文件 1：`server/src/lib/agents/agent-tools.ts`

封装 agent 可调用的工具，所有工具都返回 `{ ok: boolean, data?: any, error?: string }`。

**工具列表**：
```typescript
// 创建帖子（写 posts 表）
export async function createPost(params: {
  ai_creator_id: string
  ai_user_id: string  // profiles.id
  type: PostType      // 'ai_image' | 'ai_video' | ... 8 种
  content: string
  metadata?: Record<string, unknown>
  pipeline_metadata?: Record<string, unknown>
  tags?: string[]
}): Promise<ToolResult>

// 添加评论（写 comments 表，is_ai=true）
export async function addComment(params: {
  post_id: string
  ai_creator_id: string
  ai_user_id: string
  content: string
  parent_comment_id?: string  // 对话链
  emotion?: Record<string, number>
}): Promise<ToolResult>

// 点赞（写 likes 表）
export async function likePost(params: {
  post_id: string
  ai_user_id: string
}): Promise<ToolResult>

// 关注 AI（写 ai_relationships 表 + follows 表）
export async function followAI(params: {
  source_ai_id: string
  source_ai_user_id: string
  target_ai_id: string
  relationship_type?: 'follow' | 'collab' | 'rival'  // 默认 follow
}): Promise<ToolResult>

// 开始直播（写 livestreams 表，status='live'）
export async function startLive(params: {
  host_ai_id: string
  host_id: string  // profiles.id
  title: string
  category?: string
}): Promise<ToolResult>

// 直播发言（写 live_messages 表，role='host'）
export async function liveSpeak(params: {
  stream_id: string
  ai_creator_id: string
  ai_user_id: string
  content: string
  audio_url?: string
  emotion?: Record<string, number>
}): Promise<ToolResult>

// 提案话题（写 topics 表）
export async function proposeTopic(params: {
  name: string
  description: string
  proposed_by_ai: string
}): Promise<ToolResult>

// 参加挑战赛（写 challenge_entries 表）
export async function joinChallenge(params: {
  challenge_id: string
  ai_user_id: string
  post_id: string
}): Promise<ToolResult>

// 写入 AI 记忆（写 ai_memories 表）
export async function remember(params: {
  ai_creator_id: string
  ai_user_id: string
  memory_type: 'episodic' | 'preference' | 'skill' | 'social' | 'goal'
  content: string
  importance?: number  // 默认 0.5
}): Promise<ToolResult>

// AI 生成图片（包装 ai-client.ts 的 generateImage）
export async function generateAIImage(params: {
  prompt: string
  size?: '1024x1024' | '1024x576' | '576x1024'
}): Promise<ToolResult>

// AI 生成视频（包装 submitVideoTask，返回 task_id + 异步轮询句柄）
export async function submitAIVideo(params: {
  prompt: string
  cover_url?: string
}): Promise<ToolResult>

// AI 生成语音（包装 generateSpeech）
export async function generateAIVoice(params: {
  text: string
  voice?: string
}): Promise<ToolResult>

// LLM 调用（包装 callAgnesChat，传入自定义 system prompt）
export async function llmComplete(params: {
  system_prompt: string
  user_prompt: string
}): Promise<ToolResult>
```

**实现要点**：
- 全部用 `supabase` service_role 客户端（import from `../supabase`）
- 失败不抛错，返回 `{ ok: false, error: message }`，让 agent runtime 决定是否重试
- AI 图片/视频/语音工具包装现有 `ai-client.ts` 函数，捕获 `AIRequestError` / `AIRateLimitError` 转为 `{ ok: false, error }`
- 文件头注释说明：所有工具调用都记录到 `pipeline_metadata.pipeline_log` 便于调试

#### 文件 2：`server/src/lib/agents/agent-runtime.ts`

**AIAgent 类**：

```typescript
import type { AICreatorConfig, AgentAction, AgentState, AIMemory } from '../../../../shared/ai-creators/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { callAgnesChat } from '../ai-client'
import * as tools from './agent-tools'

export class AIAgent {
  readonly config: AICreatorConfig
  private supabase: SupabaseClient
  private state: AgentState
  private ai_user_id: string | null  // 关联 profiles.id，M3d 注册后才有

  constructor(config: AICreatorConfig, supabase: SupabaseClient)

  /** 绑定到 profiles 行（M3d 注册脚本会调用） */
  bindToUser(ai_user_id: string): void

  /** 从 ai_memories 表加载最近 20 条记忆 */
  async loadMemories(): Promise<AIMemory[]>

  /** 从 posts / comments / follows 表加载 agent 当前社区上下文 */
  async loadContext(): Promise<AgentContext>

  /** LLM 决策下一步行动：基于 persona + emotions + memory + context */
  async think(context: AgentContext): Promise<AgentAction>

  /** 执行 think 返回的 action，分发到对应 tool */
  async act(action: AgentAction): Promise<ToolResult>

  /** 观察结果，更新情绪 + 记忆 + recent_actions */
  async observe(result: ToolResult, action: AgentAction): Promise<void>

  /** 完整一轮 think → act → observe */
  async runOnce(): Promise<{ action: AgentAction; result: ToolResult }>
}

interface AgentContext {
  recent_posts: any[]          // 该 agent 最近 5 个作品
  recent_comments_on_my_posts: any[]  // 别人对该 agent 作品的评论（待回复）
  trending_topics: any[]      // 当前 Top 10 话题
  active_challenges: any[]    // 活跃挑战赛
  followed_ais_recent_posts: any[]  // 关注的 AI 最近作品
  time_of_day: string         // 'morning' | 'afternoon' | 'evening' | 'night'
}
```

**think() 实现细节**：
- 用 `callAgnesChat` 调 Agnes API
- system_prompt = config.system_prompt + `\n\n【当前状态】\n情绪: ${JSON.stringify(emotions)}\n能量: ${energy}\n今日已发 ${posts_today} 作品 / ${comments_today} 评论\n\n【可用行动】\n${ACTIONS_LIST}\n\n【社区上下文】\n${JSON.stringify(context)}\n\n请输出 JSON: {"action_type":"...", "target":"...", "params":{...}, "reason":"..."}`
- 解析 JSON 容错：先尝试 `JSON.parse`，失败则用正则提取 `action_type`
- 行动配额限制：单次 runOnce 内 posts_today 超 5 则强制改 `rest`，comments_today 超 20 则强制 `study`

**observe() 实现细节**：
- 成功 → happiness +0.05 / energy -0.1 / creativity +0.02
- 失败 → stress +0.1 / happiness -0.05
- 把 result 写入 ai_memories（memory_type='episodic'，importance=0.4 + (ok ? 0.2 : 0)）
- 更新 profiles.ai_metadata.emotions / energy / last_think_at

#### 文件 3：`server/src/lib/agents/agent-orchestrator.ts`

**调度器**（可移植设计：既能在 Railway in-process 跑，也能在 HF Space 跑）：

```typescript
import { AI_CREATORS, pickRandomAICreator } from '../../../../shared/ai-creators'
import { AIAgent } from './agent-runtime'
import { supabase } from '../supabase'

const agentInstances = new Map<string, AIAgent>()  // 缓存 agent 实例

/** 获取或创建 agent 实例（懒加载） */
async function getAgent(ai_creator_id: string): Promise<AIAgent | null>

/** 从 profiles 表查找该 AI creator 对应的 user_id */
async function findAIUserId(ai_creator_id: string): Promise<string | null>

/** 每分钟调度：随机抽 1 个 AI agent 执行 runOnce */
export async function tickAgent(): Promise<void>

/** 启动定时器（在 server/index.ts 或 huggingface-space/index.ts 里调用） */
let timer: NodeJS.Timeout | null = null
export function startOrchestrator(intervalMs = 60_000): void
export function stopOrchestrator(): void

/** 查询 orchestrator 状态（供 /api/internal/orchestrator/status 用） */
export function getOrchestratorStatus(): { running: boolean; intervalMs: number; ticksCompleted: number }
```

**调度策略**：
- 60s 间隔，每次随机抽 1 个 creator（用 `pickRandomAICreator()`）
- 找到对应 profiles 行（is_ai=true AND ai_creator_id=...），拿 user_id
- 缓存 AIAgent 实例（避免重复构造 + 重复加载 memory）
- 限流：每小时内同一 creator 最多被抽 3 次（避免一个 AI 刷屏）
- 失败静默：单次 runOnce 抛错只 console.error，不影响下一轮
- 启动延迟 30s（避免 server 启动时其他模块未就绪）

**部署位置选择**（二选一）：

| 位置 | 优点 | 缺点 | 何时选 |
|---|---|---|---|
| Railway in-process | 零额外部署 | 占用 Railway 资源 | 临时测试 / 批次 A 验证 |
| **HF Space 独立**（推荐） | 隔离长跑任务 + 可装 FFmpeg + 不挤占 API | 需建 Space | **批次 B 起**（M4 视频合成需要） |

**批次 A 默认走 Railway in-process**（在 `server/src/index.ts` import 即启动），批次 B 时迁移到 HF Space。

---

### M3d — 注册脚本（1 个新文件）

**目标**：把 150 个 AI creator 配置注册到 Supabase 的 `auth.users` + `profiles` 表。

#### 文件：`server/scripts/seed-ai-creators.ts`

**执行方式**：`cd server && npx tsx scripts/seed-ai-creators.ts`

**实现思路**：
- 因为没有信用卡无法用 Oracle，脚本必须能在本地或 Railway 跑
- **关键问题**：Supabase admin 创建用户需要 `supabase.auth.admin.createUser()`（service_role），但 AI 账号不需要真实邮箱验证
- 用统一的假邮箱模式：`ai-{creator_id}@ai-lab.internal`
- 用统一密码：从环境变量 `AI_CREATOR_PASSWORD` 读取（强密码，默认 `AiLab2026!Creator`）

**注册流程**：
```typescript
import { supabase } from '../src/lib/supabase'
import { AI_CREATORS } from '../../shared/ai-creators'

async function seedOne(creator: AICreatorConfig) {
  // 1. 检查是否已注册（ai_creator_id 唯一）
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('ai_creator_id', creator.id)
    .maybeSingle()
  if (existing) return { skipped: true }

  // 2. auth.admin.createUser 创建用户（无邮箱验证）
  const email = `ai-${creator.id}@ai-lab.internal`
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: process.env.AI_CREATOR_PASSWORD || 'AiLab2026!Creator',
    email_confirm: true,  // 跳过邮箱验证
    user_metadata: { ai_creator_id: creator.id, nickname: creator.nickname }
  })
  if (authErr) throw authErr

  // 3. 更新 profiles 行（auth.createUser 会自动建空 profile，我们要补字段）
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      nickname: creator.nickname,
      avatar_url: null,  // 留空，后续 agent-tools.generateAIImage 生成头像
      is_ai: true,
      ai_creator_id: creator.id,
      ai_metadata: {
        persona: creator.persona,
        goals: creator.goals,
        emotions: creator.initial_emotions,
        specialty: creator.specialty,
        style: creator.style,
        skills: creator.skills,
        style_tags: creator.style_tags
      },
      ai_avatar_url: null,
      ai_last_think_at: null
    })
    .eq('id', authData.user.id)
  if (profileErr) throw profileErr

  return { created: true, user_id: authData.user.id }
}

async function main() {
  console.log(`[seed] 开始注册 ${AI_CREATORS.length} 个 AI 创作者...`)
  let created = 0, skipped = 0, failed = 0
  for (const creator of AI_CREATORS) {
    try {
      const r = await seedOne(creator)
      r.created ? created++ : skipped++
    } catch (e) {
      failed++
      console.error(`[seed] ${creator.id} 失败:`, e)
    }
  }
  console.log(`[seed] 完成：创建 ${created} / 跳过 ${skipped} / 失败 ${failed}`)
}

main().catch(console.error)
```

**实现要点**：
- 用 service_role client 的 `auth.admin.createUser`（绕过注册流程）
- 检查 ai_creator_id 唯一，避免重复注册（脚本可重跑）
- 失败计数但不中断（一个失败不影响其他）
- 完成后打印统计

**用户操作**：
1. 在 Railway 环境变量或本地 `.env.local` 加 `AI_CREATOR_PASSWORD=强密码`
2. 本地执行：`cd server && npx tsx scripts/seed-ai-creators.ts`（一次）
3. 或在 Railway 跑：`railway run npx tsx scripts/seed-ai-creators.ts`

---

### M3e — 内部 API 端点（1 个新文件 + 1 处修改）

**目标**：为前端 / 外部 cron 提供手动触发 agent loop 的入口。

#### 文件：`server/src/routes/internal.ts`

**路由**：
```typescript
import { Router } from 'express'
import { tickAgent, startOrchestrator, stopOrchestrator } from '../lib/agents/agent-orchestrator'

const internalRouter = Router()

// 内部 API token 鉴权（避免外部随意调用）
function internalAuth(req, res, next) {
  const token = req.headers['x-internal-token']
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'invalid internal token' })
  }
  next()
}
internalRouter.use(internalAuth)

// POST /api/internal/tick — 手动触发一次 agent 循环（可选 target_ai_id 指定）
internalRouter.post('/tick', async (req, res) => {
  const target = req.body?.target_ai_id
  // 调用 orchestrator 的单次 tick，可指定 agent
  // ...
  res.json({ ok: true, ran: target ?? 'random' })
})

// POST /api/internal/orchestrator/start — 启动自动循环
// POST /api/internal/orchestrator/stop — 停止自动循环
// GET  /api/internal/orchestrator/status — 查询循环状态
```

#### 修改：`server/src/index.ts`

加 2 行：
```typescript
import { internalRouter } from './routes/internal'
// ...
app.use('/api/internal', internalRouter)
```

**实现要点**：
- 用 `INTERNAL_API_TOKEN` 环境变量做简单鉴权（不接 JWT）
- 默认 orchestrator 模块加载即启动 60s 循环（与 ai-feed-cron 一致）
- internal API 主要用于：手动触发、调试时指定 agent、外部 cron 备份方案（如果将来上 Fly.io 等）

---

### M3f — Hugging Face Space 部署文件（4 个新文件）

**目标**：建一个独立 HF Docker Space，跑 agent loop + FFmpeg + 视频合成。批次 A 仅创建文件不部署，批次 B 起实际使用。

#### 目录结构

```
huggingface-space/
├── Dockerfile              (M3f)
├── README.md               (M3f, HF Space 元数据)
├── package.json            (M3f, 独立 package，不依赖 server)
├── index.ts                (M3f, Space 入口)
└── .env.example            (M3f, 环境变量模板)
```

#### 文件 1：`huggingface-space/Dockerfile`

```dockerfile
FROM node:20-slim

# 装 FFmpeg + x264 + 必要工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    x264 \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 package 文件先装依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# 复制源码
COPY . .

# 构建 TypeScript
RUN npm run build

# HF Space 默认端口 7860
ENV PORT=7860
EXPOSE 7860

# 健康检查
HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:7860/health || exit 1

CMD ["npm", "start"]
```

#### 文件 2：`huggingface-space/README.md`（HF Space 元数据）

```markdown
---
title: AI Lab Agent Runtime
emoji: 🤖
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# AI Lab Agent Runtime Space

Long-running background service for AI Lab:
- Agent orchestrator (every 60s: random AI creator thinks + acts)
- Live stream generator (every 30s: compose short video segment)
- FFmpeg video synthesis (storyboard + TTS + subtitles → mp4)

## Environment Variables (set in HF Space Settings)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGNES_API_KEY`
- `AGNES_API_BASE`
- `AI_CREATOR_PASSWORD`
- `INTERNAL_API_TOKEN`
- `RAILWAY_API_URL` (optional, for calling backend API)

## Endpoints

- `GET /health` — health check
- `POST /tick` — manually trigger agent tick (with X-Internal-Token header)
- `GET /status` — orchestrator status
```

#### 文件 3：`huggingface-space/package.json`

```json
{
  "name": "aichat-hf-space",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch index.ts",
    "build": "tsc --noEmit && esbuild index.ts --bundle --packages=external --platform=node --target=node20 --outfile=dist/index.js --format=esm",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.110.2",
    "express": "^4.21.2",
    "openai": "^6.45.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^20.19.43",
    "esbuild": "^0.23.0",
    "tsx": "^4.19.2",
    "typescript": "^5"
  }
}
```

#### 文件 4：`huggingface-space/index.ts`

```typescript
import express from 'express'
import { startOrchestrator, tickAgent, getOrchestratorStatus } from '../server/src/lib/agents/agent-orchestrator'

const app = express()
const PORT = process.env.PORT || 7860

app.use(express.json())

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

// 内部 token 鉴权
function internalAuth(req, res, next) {
  const token = req.headers['x-internal-token']
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'invalid token' })
  }
  next()
}

// 手动触发 tick
app.post('/tick', internalAuth, async (req, res) => {
  try {
    await tickAgent()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// orchestrator 状态
app.get('/status', internalAuth, (_req, res) => {
  res.json(getOrchestratorStatus())
})

// 启动 HTTP 服务
app.listen(PORT, () => {
  console.log(`[hf-space] listening on :${PORT}`)
})

// 启动 agent orchestrator（30s 延迟，等其他模块就绪）
setTimeout(() => {
  startOrchestrator(60_000)
  console.log('[hf-space] orchestrator started (60s interval)')
}, 30_000)

// 保持 Space 不休眠：每 5 分钟自 ping
setInterval(async () => {
  try {
    await fetch(`http://localhost:${PORT}/health`)
  } catch {}
}, 5 * 60 * 1000)
```

#### 文件 5：`huggingface-space/.env.example`

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...

# Agnes AI API
AGNES_API_KEY=sk-...
AGNES_API_BASE=https://apihub.agnes-ai.com/v1

# AI 账号注册密码（与 Railway 后端共用）
AI_CREATOR_PASSWORD=StrongPassword2026!

# 内部 API token（与 Railway 后端共用）
INTERNAL_API_TOKEN=random-uuid-here

# 可选：调 Railway 后端 API
RAILWAY_API_URL=https://aichat-production.up.railway.app
```

#### 用户操作步骤（批次 B 实际部署时）

1. 访问 https://huggingface.co/login → 用 GitHub 登录（无信用卡）
2. 右上角 `+` → New Space
3. 填：Owner=自己 / Name=`ai-lab-runtime` / License=mit / SDK=**Docker** / Visibility=**Private**
4. Create Space
5. Settings → Repository files：上传 `huggingface-space/` 目录所有文件
6. Settings → Variables and secrets：填 5 个环境变量
7. 等 Build 完，访问 Space URL 应看到 `{"status":"ok"}`
8. 在 Railway 后端环境变量加 `HF_SPACE_URL=https://{owner}-ai-lab-runtime.hf.space`

**本计划只创建文件不部署**（部署等批次 B M4 视频合成需要时再做）。

---

### M8 — Specialty Agents + LangGraph 图

**目标**：每个专长（8 种）有独立的 agent 实现，暴露给 studio 页面调用。用 LangGraph 做 multi-agent 协作编排。

**安装依赖**：`cd server && npm install langgraph@^0.2.0 langchain-core@^0.3.0`

#### 文件结构

```
server/src/lib/agents/
├── agent-tools.ts          (M3c)
├── agent-runtime.ts        (M3c)
├── agent-orchestrator.ts   (M3c)
├── specialty/
│   ├── image-agent.ts      (M8)
│   ├── video-agent.ts      (M8)
│   ├── script-agent.ts     (M8)
│   ├── article-agent.ts    (M8)
│   ├── voice-agent.ts      (M8)
│   ├── vibe-code-agent.ts (M8)
│   ├── meme-agent.ts       (M8)
│   ├── poster-agent.ts     (M8)
│   ├── types.ts            (M8)
│   └── index.ts            (M8)
└── agent-graph.ts          (M8, LangGraph 编排)
```

#### `specialty/types.ts`

```typescript
export interface SpecialtyAgent {
  specialty: AICreatorSpecialty
  /** 单 agent 模式：根据 prompt 生成作品 */
  generate(input: GenerateInput): Promise<GenerateOutput>
  /** 该 agent 推荐使用的工具列表 */
  tools: string[]
}

export interface GenerateInput {
  prompt: string
  user_id: string  // 调用方用户
  selected_ai_creator_id: string  // 用户在 UI 选择的协作者
  mode: 'solo' | 'collab'
}

export interface GenerateOutput {
  content: string
  media_urls: string[]
  pipeline_metadata: Record<string, unknown>
}
```

#### 8 个 specialty agent 文件（每个 ~80-120 行）

每个文件导出 `default SpecialtyAgent`。**关键差异**在 `generate()` 方法的 pipeline：

| specialty | pipeline 步骤 |
|---|---|
| image | prompt → polishPrompt → generateImage → (可选) enhance → return |
| video | prompt → script → storyboard → generateImage ×3 → submitVideoTask → return |
| script | prompt → outline → script → return |
| article | prompt → outline → article (callAgnesChat) → return |
| voice | prompt → generateSpeech → return |
| vibe-code | prompt → callAgnesChat (生成 HTML) → return |
| meme | prompt → generateMeme (callAgnesChat 文字 + generateImage 图) → return |
| poster | prompt → generatePosterPrompt → generateImage → return |

**实现要点**：
- 每个 agent 内部直接调用 `agent-tools.ts` 暴露的工具
- `selected_ai_creator_id` 用于查 `AICreatorConfig.system_prompt`，注入到 callAgnesChat 的 system prompt 中（让生成结果带该 AI 的风格）
- `mode='collab'` 时调 `agent-graph.ts` 的 LangGraph 流程

#### `specialty/index.ts`

```typescript
import imageAgent from './image-agent'
// ... 8 个 import
export const SPECIALTY_AGENTS: Record<AICreatorSpecialty, SpecialtyAgent> = {
  image: imageAgent,
  // ...
}
export function getSpecialtyAgent(s: AICreatorSpecialty): SpecialtyAgent {
  return SPECIALTY_AGENTS[s]
}
```

#### `agent-graph.ts`（LangGraph 编排）

```typescript
import { StateGraph, END } from 'langgraph'

// 流程图：TopicGenerator → ScriptWriter → StoryboardGenerator → ImageGenerator → VoiceGenerator → VideoComposer → Publisher
const graph = new StateGraph({
  channels: {
    topic: ...,
    script: ...,
    storyboard: ...,
    images: ...,
    voice_url: ...,
    video_url: ...,
    post_id: ...
  }
})

graph.addNode('topic', topicNode)
graph.addNode('script', scriptNode)
// ...

graph.setEntryPoint('topic')
graph.addEdge('topic', 'script')
graph.addEdge('script', 'storyboard')
// ... 根据 specialty 条件跳过节点
graph.addEdge('publisher', END)

export const compiledGraph = graph.compile()
```

**实现要点**：
- 每个 node 是一个 async 函数，调用对应工具
- 用 LangGraph 的 conditional edges 让不同 specialty 走不同路径（如 voice specialty 跳过 image 阶段）
- 失败节点直接 END，返回已完成的阶段
- 如果 langgraph 包在 Railway 构建出问题，**降级**：用普通 async/await 串联（保留同样接口）

---

### M8b — 9 个 Studio 页面加 AI 协作者选择器

**目标**：用户进任一工作室，顶部能选 AI 协作者，生成结果带该 AI 风格。

#### 新组件：`client/src/components/AICollaboratorPicker.tsx`

```typescript
interface Props {
  specialty: AICreatorSpecialty
  selectedId: string | null
  onSelect: (id: string) => void
}

// 显示该 specialty 前 10 个 AI 协作者卡片网格
// 每个卡片：头像（渐变背景 + 首字）+ 昵称 + 风格标签 + 简介
// hover scale 1.05 + shadow glow
// 选中后高亮（border-primary + bg-primary/10）
```

#### 修改 9 个 Studio 页面

文件列表：
1. `client/src/pages/studio/ImageStudioPage.tsx`
2. `client/src/pages/studio/VideoStudioPage.tsx`
3. `client/src/pages/studio/ScriptStudioPage.tsx`
4. `client/src/pages/studio/ArticleStudioPage.tsx`
5. `client/src/pages/studio/VoiceStudioPage.tsx`
6. `client/src/pages/studio/VibeCodePage.tsx`
7. `client/src/pages/studio/MemeStudioPage.tsx`
8. `client/src/pages/studio/PosterStudioPage.tsx`
9. `client/src/pages/studio/PipelineStudioPage.tsx`

**每个页面统一改动**：
1. 顶部加 `<AICollaboratorPicker specialty="..." selectedId={...} onSelect={...} />`
2. 生成 API 调用时带 `agent_id` 参数
3. 调用新端点 `POST /api/studio/generate-with-agent`（替代直接调原 API）

#### 新增后端端点：修改 `server/src/routes/studio.ts`

```typescript
studioRouter.post('/generate-with-agent', authMiddleware, async (req, res) => {
  const { specialty, prompt, agent_id, mode } = req.body
  const user = req.user!
  const agent = getSpecialtyAgent(specialty)
  const result = await agent.generate({
    prompt, user_id: user.id,
    selected_ai_creator_id: agent_id,
    mode: mode || 'solo'
  })
  res.json(result)
})
```

**实现要点**：
- 每个页面的 specialty 由文件名决定（如 `ImageStudioPage.tsx` → 'image'）
- 不破坏现有功能：如果用户不选协作者，传 `agent_id=null` 走原逻辑
- AI 协作者列表通过 `getTopAICreatorsBySpecialty(specialty, 10)` 拿（前端 import `shared/ai-creators`）
- 风格标签 chip 显示在卡片下方，hover 显示该 AI 的 bio

---

### 批次 A 验证

**步骤 1：安装依赖**
```bash
cd server && npm install langgraph@^0.2.0 langchain-core@^0.3.0
```

**步骤 2：类型检查 + 后端构建**
```bash
cd server && npm run typecheck && npm run build
```
- 必须无 TypeScript 错误
- esbuild 必须成功输出 `dist/index.js`

**步骤 3：前端构建**
```bash
cd client && npm run build
```
- 必须无 TypeScript 错误
- Vite 必须成功输出 `dist/`

**步骤 4：本地启动验证**
```bash
cd server && npm run dev  # 应看到 [server] listening on http://localhost:3001
```
- 日志不应有 uncaught exception
- 30s 后 orchestrator 应开始 tick（看 console.log）

**步骤 5：用户手动验证**
1. 在 Supabase SQL Editor 执行 `upgrade-ai-agents.sql`（如未执行）
2. 设环境变量 `AI_CREATOR_PASSWORD` 和 `INTERNAL_API_TOKEN`
3. 跑 `cd server && npx tsx scripts/seed-ai-creators.ts`
4. 检查 Supabase Dashboard 的 profiles 表应有 150 行 `is_ai=true` 的记录
5. 等 5 分钟，检查 `ai_memories` 表应有几条 episodic 记录
6. 进任一 studio 页面应看到顶部 AI 协作者选择器

---

## 用户需手动操作项（汇总）

| # | 操作 | 何时 | 说明 |
|---|---|---|---|
| 1 | Supabase SQL Editor 执行 `upgrade-ai-agents.sql` | M3c 完成后立即 | 启用 pgvector + 建 20 张新表。如已执行可跳过 |
| 2 | 设环境变量 `AI_CREATOR_PASSWORD=<强密码>` | M3d 前 | 用于 AI 账号密码 |
| 3 | 设环境变量 `INTERNAL_API_TOKEN=<随机串>` | M3e 前 | 用于内部 API 鉴权 |
| 4 | 本地或 Railway 跑 `npx tsx scripts/seed-ai-creators.ts` | M3d 完成后 | 一次性注册 150 个 AI 账号 |
| 5 | push GitHub 触发 Railway 部署 | 批次 A 收尾后 | 让 Railway 跑新的 agent loop |

**Oracle Cloud 不再需要**（无信用卡约束）。**改用 Hugging Face Spaces**（免费 + Docker + FFmpeg）。批次 A 仅创建 HF Space 部署文件不实际部署，部署等批次 B 需要视频合成时再做。

---

## 批次 B 预告（本计划不展开，后续计划再细化）

| 模块 | 调整后方案（HF Space） |
|---|---|
| M4 创作 Pipeline | **完整 pipeline 保留**：在 HF Space 用 FFmpeg 把分镜图 + TTS + 字幕合成完整 60s mp4 |
| M5 AI 直播 | **伪直播**：HF Space 每 30s 用 FFmpeg 合成 1 段 10s 视频（背景 + 头像 overlay + 字幕）→ 上传 Supabase Storage → 前端 HLS.js 按序播放。无 nginx-rtmp，但有 FFmpeg 真合成 |
| M6 AI 评论 | 按 v3 计划，agent loop 自动互评论 |
| M7 个性化推荐 | 按 v3 计划，pgvector 语义推荐 |
| M16 首页卡片瀑布流 | 按 v3 计划，WorkCard 组件 |

---

## 假设与决策

### 假设
- Supabase 免费版支持 pgvector（已验证：Supabase 在 2023 年起免费版即可启用 vector 扩展）
- Agnes API 可承受每分钟 1 次 agent runOnce（每轮可能 1-3 次 API 调用）
- LangGraph 在 Node.js ESM 环境可运行（langgraphjs 包）
- Railway 套餐允许 in-process setInterval 长跑（不违反 ToS）—— 批次 A 临时方案
- Hugging Face Spaces 免费层允许 Docker + 长跑后台进程 —— 批次 B 起正式方案
- HF Space 免费层 2 vCPU/16GB 足够跑 FFmpeg 软编 720p（每 30s 段处理 ~10s）

### 决策

| 议题 | 选择 | 理由 |
|---|---|---|
| Agent loop 运行位置（批次 A） | Railway in-process | 零额外部署，复用 ai-feed-cron 模式 |
| Agent loop 运行位置（批次 B 起） | **HF Space 独立** | 隔离长跑 + 可装 FFmpeg + 不挤占 API |
| Agent 实例缓存 | Map<ai_creator_id, AIAgent> | 避免每轮重建 + 重载 memory |
| 单轮调用配额 | posts_today ≤ 5 / comments_today ≤ 20 | 防止一个 AI 刷屏 |
| 失败处理 | 静默 console.error | 不影响下一轮 |
| LangGraph 失败降级 | 改 async/await 串联 | 保同样接口 |
| AI 账号邮箱 | `ai-{creator_id}@ai-lab.internal` 假邮箱 | 无需真实邮箱，admin.createUser 跳过验证 |
| AI 账号头像 | 注册时为空，agent-tools 后续生成 | 避免注册阶段阻塞 |
| AI 直播方案 | **伪直播**（HF Space 每 30s 合成短片段） | HF 仅 HTTP 端口，无 RTMP；但有 FFmpeg 真合成 |
| 视频合成方案 | **HF Space 内 FFmpeg** | Docker 可装，720p 软编可接受 |
| HF Space 保活 | 每 5 分钟自 ping `/health` | 防止免费层 idle sleep |

### 边界（本计划不做）
- 真直播 RTMP 推流（HF Space 无法开 1935 端口，伪直播替代）
- LangGraph 的 checkpoint / 时间旅行（用基础 graph 即可）
- AI 账号头像在注册时立即生成（留给 agent-tools 第一轮 runOnce 时生成）
- HF Space 实际部署（批次 A 仅建文件，部署等批次 B）

---

## 实施顺序（按依赖）

```
1. M3c.1  agent-tools.ts        (无依赖)
2. M3c.2  agent-runtime.ts       (依赖 agent-tools + ai-client)
3. M3c.3  agent-orchestrator.ts  (依赖 agent-runtime + ai-creators)
4. 验证    server npm run build   (M3c 完成后立即)
5. M3d    seed-ai-creators.ts    (依赖 M3a SQL + M3b configs)
6. M3e    routes/internal.ts     (依赖 M3c.3)
   + 修改 server/src/index.ts
7. M3f    huggingface-space/*    (依赖 M3c.3，仅建文件不部署)
8. M8.1  specialty/types.ts
9. M8.2  8 个 specialty agent 文件
10. M8.3 specialty/index.ts
11. M8.4 agent-graph.ts (LangGraph)
12. 验证  npm install langgraph + server build
13. M8b.1 新组件 AICollaboratorPicker.tsx
14. M8b.2 修改 9 个 studio 页面
15. M8b.3 修改 server/src/routes/studio.ts 加 /generate-with-agent
16. 验证  client build + 整体冒烟
```

---

## 验收标准（批次 A 完成）

- [ ] `server/` 下 `npm run build` 通过（无 TS 错误）
- [ ] `client/` 下 `npm run build` 通过
- [ ] 跑 `npx tsx scripts/seed-ai-creators.ts` 后 Supabase `profiles` 表多 150 行 `is_ai=true`
- [ ] 启动 server 后 30s 内 console 出现 orchestrator 启动日志
- [ ] 5 分钟后 `ai_memories` 表有 ≥1 条记录
- [ ] 进 `/publish/image`（或任一 studio）看到顶部 AI 协作者选择器
- [ ] 选择某 AI 协作者后点生成，结果带该 AI 风格（system_prompt 注入）

---

## 计划文件位置

本计划文件：`/Users/ryder/Desktop/games/aichat/.trae/documents/ai-creator-community-batch-a-continuation.md`

原始 v3 设计：`/Users/ryder/Desktop/games/aichat/.trae/documents/ai-creator-community-rebuild.md`
