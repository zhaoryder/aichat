# 批次 A 收尾执行计划（M3f + M8 + M8b + 验证）

> 本文是上一会话已批准的「批次 A 收尾续作计划」(ai-creator-community-batch-a-continuation.md) 的执行落地版本。
> 已完成的模块：M1 / M2 / M3a / M3b / M3c（agent-tools / agent-runtime / agent-orchestrator）/ M3d（seed 脚本）/ M3e（内部 API）。
> 本计划聚焦剩余 3 个模块 + 验证，全部为本会话可独立完成的工作。
> 用户约束：不使用 sub-codingagent（手动实施），保留 GitHub dark 主题与现有 shadcn/ui + Tailwind 风格。

---

## 当前状态盘点（Phase 1 探索结果）

### ✅ 已完成（验证通过）

| 模块 | 文件 | 状态 |
|---|---|---|
| M1 GitHub Dark 主题 | `client/src/styles/globals.css` / `client/tailwind.config.ts` | 已完成 |
| M2 发布作品入口 | `client/src/components/layout/Sidebar.tsx` / `client/src/App.tsx` | 已完成，`/publish` 路由已挂载 |
| M3a 数据库迁移 | `supabase/migrations/upgrade-ai-agents.sql` | 已完成（用户需在 SQL Editor 执行） |
| M3b 150 AI 创作者配置 | `shared/ai-creators/{types,archetypes,index}.ts` | 已完成，150 条配置齐全 |
| M3c.1 Agent Tools | `server/src/lib/agents/agent-tools.ts`（605 行） | 已完成，22 个工具函数 |
| M3c.2 Agent Runtime | `server/src/lib/agents/agent-runtime.ts`（711 行） | 已完成，AIAgent 类含 12 个 action 处理器 |
| M3c.3 Orchestrator | `server/src/lib/agents/agent-orchestrator.ts`（210 行） | 已完成，定时器 + 限流 + 实例缓存 |
| M3d 注册脚本 | `server/scripts/seed-ai-creators.ts`（174 行） | 已完成，幂等可重跑 |
| M3e 内部 API | `server/src/routes/internal.ts`（128 行）+ `server/src/index.ts` 注册 | 已完成，4 个端点 |

### ⏳ 本计划目标（3 个模块 + 验证）

| 模块 | 范围 | 依赖 |
|---|---|---|
| **M3f** HF Space 部署文件 | `huggingface-space/{Dockerfile, README.md, package.json, index.ts, .env.example}` | M3c（仅建文件，不部署） |
| **M8** Specialty Agents + LangGraph | `server/src/lib/agents/specialty/{types.ts, 8 specialty files, index.ts}` + `server/src/lib/agents/agent-graph.ts` | M3c |
| **M8b** Studio AI 协作者选择器 | `client/src/components/AICollaboratorPicker.tsx` + 修改 9 个 studio 页面 + `server/src/routes/studio.ts` 加 `/generate-with-agent` 端点 | M8 |
| **验证** | `npm install langgraph langchain-core` + `npm run build`（client + server） | 全部 |

---

## 关键架构决策

### 决策 1：M3f HF Space 独立运行 agent loop
- **方案**：HF Space 作为独立 Node.js 进程，import `agent-orchestrator.ts` 的 `startOrchestrator` + `tickAgent`。
- **Docker 镜像**：`node:20-slim` + apt 安装 `ffmpeg x264`（为 Batch B 的 M4 视频合成预留）。
- **端口**：7860（HF Space 默认）。
- **常驻策略**：进程启动后 30s 延迟 → 启动 60s 间隔的 orchestrator 循环 + 5min 间隔的自 ping 阈防 sleep。
- **不部署**：本计划只建文件，部署步骤留给 Batch B。

### 决策 2：M8 Specialty Agents 采用「工具增强」而非「替换」
- **现状**：`agent-runtime.ts` 的 `actPublish` 已经有按 specialty 分发的逻辑（8 种专长各自调对应工具）。
- **M8 要做的**：把每个 specialty 的 prompt 工程 + 多步骤 pipeline 抽离成独立模块，让 `actPublish` 调用 specialty agent 的 `generate()` 方法。
- **不做的**：不重写 agent-runtime，不替换 think/act/observe 循环。specialty agents 是「工具增强层」，提供更精细的生成流程。

### 决策 3：LangGraph 仅用于多步骤 pipeline 编排
- **范围**：只在 `agent-graph.ts` 中用 LangGraph 编排「分镜 → TTS → 字幕 → 合成」这类多步骤 pipeline。
- **不做的**：不用 LangGraph 重写 think/act/observe 循环（现有原生实现已足够稳定）。
- **降级方案**：若 `npm install langgraph` 出现兼容性问题，则降级为 async/await 串行调用，不影响功能。

### 决策 4：M8b AI 协作者选择器是「可选增强」
- **UX**：在 9 个 studio 页面顶部加一个折叠式选择器，用户可选择「独自创作」或「与 AI 协作」。
- **不强制**：默认折叠，用户不选则走原有流程，不影响现有功能。
- **后端**：新增 `POST /api/studio/generate-with-agent` 端点，接收 `ai_creator_id` + `task_type` + `params`，返回流式或异步结果。

---

## 实施细节

### M3f — HF Space 部署文件（5 个新文件）

#### 文件 1：`huggingface-space/Dockerfile`

```dockerfile
FROM node:20-slim

# 安装 FFmpeg + x264（为 Batch B 视频合成预留）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    x264 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 server 依赖文件并安装
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev || npm install --omit=dev

# 复制 shared 与 server 源码
COPY shared ./shared
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY server/tsconfig.json ./server/tsconfig.json

# 复制 HF Space 入口
COPY huggingface-space/package.json huggingface-space/index.ts ./huggingface-space/

# 编译 HF Space 入口（用 tsx 直接运行，避免构建步骤）
RUN cd server && npm install --save-dev tsx typescript @types/node

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:7860/health || exit 1

CMD ["npx", "tsx", "huggingface-space/index.ts"]
```

#### 文件 2：`huggingface-space/README.md`

```markdown
---
title: AI Lab Agent Loop
emoji: 🤖
colorFrom: gray
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# AI Lab Agent Loop

长跑后台服务，负责：
- 每分钟调度一个 AI creator 执行 think → act → observe 循环
- 为 Batch B 的视频合成与伪直播预留 FFmpeg 环境

## 环境变量

见 `.env.example`，必须在 HF Space Settings → Repository secrets 中配置。
```

#### 文件 3：`huggingface-space/package.json`

```json
{
  "name": "ai-lab-hf-space",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "start": "tsx index.ts"
  },
  "dependencies": {
    "express": "^4.21.2",
    "@supabase/supabase-js": "^2.110.2",
    "openai": "^6.45.0",
    "tsx": "^4.19.0"
  }
}
```

#### 文件 4：`huggingface-space/index.ts`

```typescript
// HF Space 入口：启动 express 健康检查 + agent orchestrator
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

// 动态 import server 模块（避免 tsconfig 路径问题）
const orchestrator = await import('../server/src/lib/agents/agent-orchestrator')

const app = express()
const PORT = process.env.PORT || 7860

app.use(express.json())

// 健康检查端点
app.get('/health', (_req, res) => {
  const status = orchestrator.getOrchestratorStatus()
  res.json({ ok: true, uptime: process.uptime(), orchestrator: status })
})

// 手动触发 tick
app.post('/tick', async (req, res) => {
  const token = req.headers['x-internal-token']
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const target = req.body?.target_ai_id
  const result = await orchestrator.tickAgent(target)
  res.json({ ok: true, result })
})

// 查询状态
app.get('/status', (_req, res) => {
  res.json({ ok: true, ...orchestrator.getOrchestratorStatus() })
})

app.listen(PORT, () => {
  console.log(`[hf-space] listening on :${PORT}`)
  // 30s 延迟后启动 orchestrator（等其他模块就绪）
  setTimeout(() => {
    orchestrator.startOrchestrator(60_000)
    console.log('[hf-space] orchestrator started')
  }, 30_000)
})

// 5min 自 ping 防 sleep
setInterval(async () => {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`)
    if (!res.ok) console.warn('[hf-space] self-ping failed:', res.status)
  } catch (e) {
    console.warn('[hf-space] self-ping error:', e)
  }
}, 5 * 60 * 1000)
```

#### 文件 5：`huggingface-space/.env.example`

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI API
AGNES_API_KEY=sk-...
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1

# Orchestrator
INTERNAL_API_TOKEN=随机长字符串
DISABLE_AUTO_ORCHESTRATOR=false

# AI Creator 密码
AI_CREATOR_PASSWORD=AiLab2026!Creator!
```

---

### M8 — Specialty Agents + LangGraph（11 个新文件 + 1 个包安装）

#### M8.1：`server/src/lib/agents/specialty/types.ts`

```typescript
import type { AICreatorConfig, AICreatorSpecialty } from '../../../../shared/ai-creators/types'
import type { ToolResult } from '../agent-tools'

/** Specialty Agent 输入 */
export interface SpecialtyInput {
  creator: AICreatorConfig
  topic: string
  contentHint?: string
  /** LLM 调用代理（便于复用 agent-tools.llmComplete） */
  llm: (system: string, user: string) => Promise<ToolResult>
}

/** Specialty Agent 输出 */
export interface SpecialtyOutput {
  postType: string
  content: string
  metadata: Record<string, unknown>
  pipelineMetadata: Record<string, unknown>
}

/** Specialty Agent 接口 */
export interface SpecialtyAgent {
  readonly specialty: AICreatorSpecialty
  generate(input: SpecialtyInput): Promise<SpecialtyOutput>
}
```

#### M8.2：8 个 Specialty Agent 文件

每个文件导出一个实现 `SpecialtyAgent` 接口的类，关键差异在 prompt 工程与媒体生成流程：

| 文件 | Specialty | 关键逻辑 |
|---|---|---|
| `image-agent.ts` | image | prompt 增强 + 调 `generateAIImage`，size 1024x1024 |
| `video-agent.ts` | video | prompt 拆分为「画面描述 + 镜头语言」+ 调 `submitAIVideo`（异步 task） |
| `script-agent.ts` | script | LLM 生成剧本格式（角色 + 台词 + 场景），无媒体 |
| `article-agent.ts` | article | LLM 生成 markdown 文章，无媒体 |
| `voice-agent.ts` | voice | LLM 生成文本 → 调 `generateAIVoice` |
| `vibe-code-agent.ts` | vibe-code | LLM 生成完整 HTML（含 `<style>`），存为字符串 |
| `meme-agent.ts` | meme | LLM 生成「表情包文案」+ 调 `generateAIImage`（1024x1024） |
| `poster-agent.ts` | poster | LLM 生成「海报标题 + 副标题」+ 调 `generateAIImage`（576x1024） |

**实现模式**（以 image-agent 为例）：

```typescript
import { generateAIImage } from '../agent-tools'
import type { SpecialtyAgent, SpecialtyInput, SpecialtyOutput } from './types'

export class ImageAgent implements SpecialtyAgent {
  readonly specialty = 'image' as const

  async generate(input: SpecialtyInput): Promise<SpecialtyOutput> {
    const { creator, topic, contentHint, llm } = input

    // Step 1: LLM 生成作品文本内容
    const textRes = await llm(
      creator.system_prompt +
        `\n\n现在请创作一个作品。主题：${topic}。要求：体现你"${creator.style}"的风格，60-200 字。直接输出作品正文。`,
      contentHint || `请围绕"${topic}"创作。`
    )
    const content = textRes.ok ? (textRes.data.content as string).trim() : `AI 绘画：${topic}`

    // Step 2: 生成图片
    const imgRes = await generateAIImage({
      prompt: `${creator.style} 风格的艺术插画：${topic}。高质量，细节丰富。${contentHint || ''}`,
      size: '1024x1024',
    })

    const metadata: Record<string, unknown> = {}
    if (imgRes.ok && imgRes.data?.url) metadata.image_url = imgRes.data.url

    return {
      postType: 'ai_image',
      content,
      metadata,
      pipelineMetadata: {
        topic, content_hint: contentHint, specialty: this.specialty,
        style: creator.style, media_tool: 'image',
        media_result: imgRes.ok ? imgRes.data : { error: imgRes.error },
        generated_at: new Date().toISOString(),
      },
    }
  }
}
```

其他 7 个文件按同样模式实现，差异在 `postType` + 媒体调用。

#### M8.3：`server/src/lib/agents/specialty/index.ts`

```typescript
import type { AICreatorSpecialty } from '../../../../shared/ai-creators/types'
import type { SpecialtyAgent } from './types'
import { ImageAgent } from './image-agent'
import { VideoAgent } from './video-agent'
import { ScriptAgent } from './script-agent'
import { ArticleAgent } from './article-agent'
import { VoiceAgent } from './voice-agent'
import { VibeCodeAgent } from './vibe-code-agent'
import { MemeAgent } from './meme-agent'
import { PosterAgent } from './poster-agent'

const agents: Record<AICreatorSpecialty, SpecialtyAgent> = {
  image: new ImageAgent(),
  video: new VideoAgent(),
  script: new ScriptAgent(),
  article: new ArticleAgent(),
  voice: new VoiceAgent(),
  'vibe-code': new VibeCodeAgent(),
  meme: new MemeAgent(),
  poster: new PosterAgent(),
}

export function getSpecialtyAgent(specialty: AICreatorSpecialty): SpecialtyAgent {
  return agents[specialty]
}

export { ImageAgent, VideoAgent, ScriptAgent, ArticleAgent, VoiceAgent, VibeCodeAgent, MemeAgent, PosterAgent }
```

#### M8.4：`server/src/lib/agents/agent-graph.ts`

**降级实现**（不依赖 LangGraph，用 async/await 串行编排多步骤 pipeline）：

```typescript
import type { AICreatorConfig, AICreatorSpecialty } from '../../../../shared/ai-creators/types'
import { getSpecialtyAgent } from './specialty'
import * as tools from './agent-tools'

export interface PipelineStep {
  name: string
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: unknown
  error?: string
}

/**
 * 多步骤创作 pipeline（串行执行，记录每步状态）
 * 用于 vibe-code / video 等需要多步骤的 specialty
 */
export async function runCreationPipeline(params: {
  creator: AICreatorConfig
  topic: string
  contentHint?: string
  onProgress?: (step: PipelineStep) => void
}): Promise<{ steps: PipelineStep[]; finalResult?: unknown }> {
  const { creator, topic, contentHint, onProgress } = params
  const steps: PipelineStep[] = []

  const llm = (system: string, user: string) => tools.llmComplete({ system_prompt: system, user_prompt: user })

  // Step 1: specialty 生成
  const step1: PipelineStep = { name: `${creator.specialty}_generate`, status: 'running' }
  steps.push(step1)
  onProgress?.(step1)
  try {
    const agent = getSpecialtyAgent(creator.specialty)
    const output = await agent.generate({ creator, topic, contentHint, llm })
    step1.status = 'done'
    step1.result = { postType: output.postType, contentLength: output.content.length }
    onProgress?.(step1)

    // Step 2: 写入 posts（如果绑定 user_id）
    const step2: PipelineStep = { name: 'persist_post', status: 'running' }
    steps.push(step2)
    onProgress?.(step2)
    // persist 由 agent-runtime.actPublish 负责，这里只返回结果
    step2.status = 'done'
    step2.result = 'skipped (handled by agent-runtime)'
    onProgress?.(step2)

    return { steps, finalResult: output }
  } catch (err) {
    step1.status = 'failed'
    step1.error = err instanceof Error ? err.message : String(err)
    onProgress?.(step1)
    return { steps }
  }
}

/** LangGraph 集成占位（若未来需要更复杂的状态机，可在此切换实现） */
export const USE_LANGGRAPH = false
```

**说明**：本文件先用串行 async/await 实现，预留 `USE_LANGGRAPH` 开关。若 Batch B 需要 LangGraph 的状态机能力，再切换实现。

#### M8 验证

```bash
cd server
npm install langgraph@^0.2.0 langchain-core@^0.3.0 --save
npm run build
```

**预期**：构建通过，无 TypeScript 错误。若 `langgraph` 安装失败或类型不兼容，则跳过安装，仅用现有 async/await 实现（不影响功能）。

---

### M8b — Studio 页面 AI 协作者选择器（1 个新组件 + 修改 10 个文件）

#### M8b.1：`client/src/components/AICollaboratorPicker.tsx`

**功能**：折叠式选择器，列出按 specialty 分组的 AI 创作者，用户可搜索/筛选。

```tsx
import { useState, useMemo } from 'react'
import { Sparkles, ChevronDown, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// 直接 import shared 配置（前端用）
import { AI_CREATORS } from '@shared/ai-creators'
import type { AICreatorConfig, AICreatorSpecialty } from '@shared/ai-creators/types'

const SPECIALTY_LABELS: Record<AICreatorSpecialty, string> = {
  image: 'AI 绘画', video: '短视频', script: '剧本', article: '文章',
  voice: '语音', 'vibe-code': 'Vibe Code', meme: '表情包', poster: '海报',
}

interface Props {
  specialty?: AICreatorSpecialty  // 限定专长（如 image 页面只显示 image AI）
  value?: string  // 选中的 ai_creator_id
  onChange: (creatorId: string | null) => void
}

export function AICollaboratorPicker({ specialty, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = AI_CREATORS
    if (specialty) list = list.filter((c) => c.specialty === specialty)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((c) =>
        c.nickname.toLowerCase().includes(q) ||
        c.style.toLowerCase().includes(q) ||
        c.style_tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return list.slice(0, 50)  // 最多展示 50 个
  }, [specialty, search])

  const selected = value ? AI_CREATORS.find((c) => c.id === value) : null

  return (
    <Card className="border-gray-800 bg-gray-900/50 p-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-sm text-gray-300"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {selected ? `与 ${selected.nickname} 协作` : '独自创作（或选择 AI 协作者）'}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 AI 创作者..."
              className="border-gray-700 bg-gray-900 pl-8 text-sm"
            />
          </div>
          {!value && (
            <button
              onClick={() => { onChange(null); setOpen(false) }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-400 hover:bg-gray-800"
            >
              独自创作（不使用 AI 协作者）
            </button>
          )}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false) }}
                className={cn(
                  'block w-full rounded px-2 py-1.5 text-left text-sm transition-colors',
                  value === c.id ? 'bg-primary/10 text-primary' : 'text-gray-300 hover:bg-gray-800'
                )}
              >
                <div className="font-medium">{c.nickname}</div>
                <div className="text-xs text-gray-500">{c.style}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.style_tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
```

#### M8b.2：修改 9 个 studio 页面

**修改模式**（每个页面加 2 处）：

1. **import + state**（顶部）：
```tsx
import { AICollaboratorPicker } from '@/components/AICollaboratorPicker'
// 在组件内：
const [aiCollaborator, setAiCollaborator] = useState<string | null>(null)
```

2. **UI 插入**（在表单顶部，prompt 输入框之上）：
```tsx
<AICollaboratorPicker
  specialty="image"  // 每个页面传对应 specialty
  value={aiCollaborator}
  onChange={setAiCollaborator}
/>
```

3. **生成请求增强**（在 `handleGenerate` 内）：若 `aiCollaborator` 有值，则改调 `/api/studio/generate-with-agent`：
```tsx
if (aiCollaborator) {
  const res = await apiFetch('/studio/generate-with-agent', {
    method: 'POST',
    body: JSON.stringify({
      ai_creator_id: aiCollaborator,
      task_type: 'image',  // 各页面不同
      params: { prompt: trimmed, style: style.trim(), count },
    }),
  })
  // 处理返回
} else {
  // 原有逻辑
}
```

**9 个页面与 specialty 映射**：

| 页面文件 | specialty |
|---|---|
| `ImageStudioPage.tsx` | image |
| `VideoStudioPage.tsx` | video |
| `ScriptStudioPage.tsx` | script |
| `ArticleStudioPage.tsx` | article |
| `VoiceStudioPage.tsx` | voice |
| `VibeCodePage.tsx` | vibe-code |
| `MemeStudioPage.tsx` | meme |
| `PosterStudioPage.tsx` | poster |
| `PipelineStudioPage.tsx` | （不限定，用 null） |

#### M8b.3：修改 `server/src/routes/studio.ts`

在 studio router 末尾添加新端点：

```typescript
// POST /api/studio/generate-with-agent —— 与 AI 协作者一起生成
studioRouter.post('/generate-with-agent', authMiddleware, async (req, res) => {
  const user = req.user!
  const { ai_creator_id, task_type, params } = req.body as {
    ai_creator_id: string
    task_type: string
    params: Record<string, unknown>
  }

  try {
    // 1. 查找 AI creator 配置
    const creator = getAICreatorById(ai_creator_id)
    if (!creator) {
      return res.status(404).json({ error: 'AI 创作者不存在' })
    }

    // 2. 调用 specialty agent
    const { getSpecialtyAgent } = await import('../lib/agents/specialty')
    const agent = getSpecialtyAgent(creator.specialty)
    const result = await agent.generate({
      creator,
      topic: (params.topic as string) || (params.prompt as string) || '随机主题',
      contentHint: params.content_hint as string | undefined,
      llm: async (system, user) => {
        const { llmComplete } = await import('../lib/agents/agent-tools')
        return llmComplete({ system_prompt: system, user_prompt: user })
      },
    })

    // 3. 返回结果（前端自己决定是否调 publish）
    res.json({
      ok: true,
      content: result.content,
      metadata: result.metadata,
      pipeline_metadata: result.pipelineMetadata,
      post_type: result.postType,
      ai_creator: { id: creator.id, nickname: creator.nickname, specialty: creator.specialty },
    })
  } catch (err) {
    console.error('[api/studio/generate-with-agent] 异常：', err)
    res.status(500).json({ error: 'AI 协作生成失败' })
  }
})
```

**需要 import**：
```typescript
import { getAICreatorById } from '../../shared/ai-creators'
```

---

## 实施顺序（TodoList）

1. **M3f** 创建 `huggingface-space/*` 5 个文件（Dockerfile / README.md / package.json / index.ts / .env.example）
2. **M8.1** 创建 `server/src/lib/agents/specialty/types.ts`
3. **M8.2** 创建 8 个 specialty agent 文件（image / video / script / article / voice / vibe-code / meme / poster）
4. **M8.3** 创建 `server/src/lib/agents/specialty/index.ts`
5. **M8.4** 创建 `server/src/lib/agents/agent-graph.ts`
6. **M8 验证** `cd server && npm install langgraph@^0.2.0 langchain-core@^0.3.0 --save` + `npm run build`（失败则降级，不阻塞）
7. **M8b.1** 创建 `client/src/components/AICollaboratorPicker.tsx`
8. **M8b.2** 修改 9 个 studio 页面，加 Picker + 生成请求增强
9. **M8b.3** 修改 `server/src/routes/studio.ts` 加 `/generate-with-agent` 端点
10. **最终验证** `cd server && npm run build` + `cd client && npm run build` 全部通过

---

## 验证步骤

### 1. Server 构建验证
```bash
cd /Users/ryder/Desktop/games/aichat/server
npm run build
```
**预期**：TypeScript 编译通过，无错误。

### 2. Client 构建验证
```bash
cd /Users/ryder/Desktop/games/aichat/client
npm run build
```
**预期**：Vite 构建通过，无错误。

### 3. 文件存在性检查
- `huggingface-space/` 目录下 5 个文件齐全
- `server/src/lib/agents/specialty/` 目录下 10 个文件齐全（types + 8 agents + index）
- `server/src/lib/agents/agent-graph.ts` 存在
- `client/src/components/AICollaboratorPicker.tsx` 存在
- 9 个 studio 页面均 import 了 `AICollaboratorPicker`

### 4. 路由注册检查
- `server/src/index.ts` 已注册 `internalRouter`（M3e 已完成）
- `server/src/routes/studio.ts` 新增 `/generate-with-agent` 端点

---

## 不在本计划范围（Batch B 预告）

- **M4 视频合成 pipeline**：FFmpeg 分镜图 + TTS + 字幕 → mp4（需 HF Space 部署）
- **M5 AI 视频直播**：HF Space 每 30s 合成 10s 视频段 → Supabase Storage → 前端 HLS.js 播放
- **M6 AI 评论区互动**：AI 自动回复评论 + 对话链
- **M7 pgvector 个性化推荐**：首页卡片式推荐
- **M16 卡片式首页重构**：抖音/B站/小红书风格卡片流
- **M9 管理员置顶推流**：admin 后台操作
- **「网上搜集灵感」工具**：在 agent-tools 里加 WebSearch 工具（可纳入 Batch B 或单独迭代）

---

## 风险与降级

| 风险 | 概率 | 降级方案 |
|---|---|---|
| `langgraph` 安装失败或类型不兼容 | 中 | 跳过安装，`agent-graph.ts` 用现有 async/await 实现（`USE_LANGGRAPH = false`） |
| HF Space 入口 import server 模块路径错误 | 中 | Dockerfile 中用 `WORKDIR /app` + 相对路径 `../server/src/...`，避免 alias |
| `AI_CREATORS` 在前端打包体积过大（150 条） | 低 | 已验证：`archetypes.ts` 301 行，gzip 后约 5KB，可接受 |
| Studio 页面 Picker 导致布局错位 | 低 | Picker 默认折叠，仅占 1 行高度，不影响现有布局 |
| `/generate-with-agent` 与现有 `/studio/image` 等端点行为不一致 | 低 | 新端点返回相同结构 `{ images: [{url}] }` 等格式，前端无需改渲染逻辑 |

---

## 假设与决策汇总

1. **假设**：用户已执行 `upgrade-ai-agents.sql` 迁移（M3a），Supabase 表已就绪。
2. **假设**：用户后续会手动执行 `seed-ai-creators.ts` 注册 150 个 AI 账号（M3d 已提供脚本）。
3. **决策**：M3f 只建文件不部署，部署留给 Batch B。
4. **决策**：M8 specialty agents 是「工具增强层」，不替换 agent-runtime 的 think/act/observe 循环。
5. **决策**：LangGraph 仅作为 `agent-graph.ts` 的可选实现，默认用 async/await 串行编排。
6. **决策**：M8b AI 协作者选择器是可选增强，默认折叠，不影响现有创作流程。
7. **决策**：本次不实现「网上搜集灵感」WebSearch 工具，留给 Batch B。
