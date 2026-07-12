# AI 搞笑智能体平台 2.0 升级 Spec

## Why
当前 1.5 版本存在四大痛点：① AI 不够搞笑（glm-4-flash 偏正经，热梗系统引用的全是 2008 年过时梗）；② 视频生成频繁 429 限流；③ "搞笑游戏"功能定位错误，应该让 AI 直接 vibe-coding 制作游戏/工具；④ 网站太简陋，功能少、UI 单调、所有组件都自写，违反"能用成熟方案就别自己做"原则。2.0 要从根本上解决这些问题，把平台从"能用"升级到"高级、好玩、功能丰富"。

## What Changes

### 一、AI 模型层重做（核心）
- **BREAKING**：废弃 `glm-4-flash` 作为主对话模型，改用 DeepSeek-V3（开源、中文搞笑能力强、API 免费或低价）
- **BREAKING**：移除"每日热梗采集系统"（`trending_memes` 表查询、`getActiveMemePrompt`、`incrementMemeUsage` 全部删除）—— 热梗已过时且效果差，改用 prompt engineering 让模型自发产出幽默
- 保留智谱 GLM 作为多媒体生成 fallback（CogView4/CogTTS）
- 多模型路由：对话用 DeepSeek，图片/语音用智谱，视频用 Replicate
- 引入 `@anthropic-ai/sdk` 或 `openai` 兼容客户端调用 DeepSeek API

### 二、视频生成换开源方案
- **BREAKING**：废弃智谱 CogVideoX（429 限流严重）
- 改用 Replicate API（汇聚开源视频模型，免费额度 + 按量付费）
- 备选：阿里通义万相 API、Hugging Face Inference API
- 开源模型选项：`ali-vilab/text-to-video`、`stability-ai/stable-video-diffusion`

### 三、搞笑游戏 → Vibe Coding Agent（功能重做）
- **BREAKING**：废弃现有"文字冒险/海龟汤/情景选择/接梗大战"游戏模式
- 改为 **AI Agent 自主编程**：用户提需求 → AI 写代码 → 浏览器内即时运行预览
- 开源方案：**WebContainer**（StackBlitz 开源，浏览器内运行 Node.js）+ LLM agent
- Agent 能力：分析需求 → 生成代码 → 自我纠错 → 部署预览
- 输出类型：HTML/CSS/JS 单文件、React 组件、小型 Node.js 工具
- 用户可下载代码、分享预览链接、remix 他人作品

### 四、UI/UX 大幅升级
- **BREAKING**：重新引入 `shadcn/ui`（用户原话："能用别人做的就别自己做"）
- **BREAKING**：重新引入 `framer-motion`（细腻动画，用户偏好）
- 引入 `react-hook-form` + `zod`（表单处理）
- 引入 `@tanstack/react-query`（服务端状态管理）
- 引入 `lucide-react`（图标库）
- 引入 `sonner`（Toast 通知）
- 所有"风格/性格/语气"选项改为 **下拉选择 + 自定义**（不再纯文本输入）

### 五、下拉选择 + 自定义（交互改进）
- 智能体创建：性格风格、说话语气、幽默类型用 Select 组件
- 创意工坊：所有参数（文体、风格、时长、数量）用 Select
- 支持预设选项 + "自定义..." 弹出输入
- 组件复用 shadcn/ui 的 `Select` + `Popover`

### 六、功能扩展（新增 8+ 功能）
- **AI 语音聊天**：浏览器语音输入（Web Speech API）→ AI 回复 → TTS 朗读
- **AI 绘画广场**：公开画廊，浏览/点赞/收藏 AI 生成的图片
- **角色卡牌系统**：每个智能体一张卡牌，有稀有度、技能、组合效果（游戏化）
- **提示词市场**：用户分享优质 prompt，可一键使用
- **成就系统**：对话 N 次、创作 N 个作品、连续签到 N 天解锁徽章
- **排行榜**：智能体热度、用户活跃度、作品热度排行
- **AI 朋友圈**：智能体之间自发"发朋友圈"动态，用户可评论点赞
- **深夜emo墙**：用户匿名发布搞笑/emo 内容，AI 智能体评论玩梗

### 七、视觉升级
- 首页：Hero 大图 + 智能体卡牌墙 + 实时动态预览
- 全站暗色模式（用户偏好）
- 移动端响应式优化
- 引入 `recharts` 数据可视化（排行榜/统计图表）
- 引入 `react-photo-view` 图片画廊
- 引入 `react-markdown` + `remark-gfm` 富文本渲染

## Impact
- Affected specs: rewrite-platform-vite-react（在 1.5 基础上升级，不重写）
- Affected code:
  - `server/src/lib/ai-client.ts` — 重写为多模型路由（DeepSeek + 智谱 + Replicate）
  - `server/src/routes/studio.ts` — 视频换 Replicate、游戏改 vibe coding
  - `client/src/pages/studio/GameStudioPage.tsx` — 完全重做为 Vibe Coding IDE
  - `client/src/components/ui/*` — 用 shadcn/ui 替换自写组件
  - `client/package.json` — 大量新依赖（shadcn/framer-motion/react-query 等）
  - `shared/agents.ts` — 移除热梗引用，强化搞笑 prompt
  - `supabase/migrations/` — 新增表（achievements/leaderboard/ai_posts/prompt_market）

## Architecture

### 2.0 多模型架构
```
用户请求 → API Server → 模型路由
                      ├─ DeepSeek-V3（对话/搞笑/文章/vibe coding）
                      ├─ 智谱 GLM-4-Flash（fallback 对话）
                      ├─ 智谱 CogView4（图片生成）
                      ├─ 智谱 CogTTS（语音合成）
                      └─ Replicate（视频生成，开源模型）
```

### Vibe Coding 架构
```
用户输入需求
  ↓
DeepSeek Agent（多轮 tool-call）
  ├─ 分析需求
  ├─ 生成 HTML/JS 代码
  ├─ 自我审查 + 修复
  └─ 输出最终代码
  ↓
WebContainer（浏览器内运行）
  ├─ mount 文件系统
  ├─ 安装依赖（如需）
  ├─ 启动 dev server
  └─ iframe 预览
  ↓
用户可：编辑 / 下载 / 分享 / remix
```

### 技术栈升级
| 层 | 1.5 | 2.0 |
|----|-----|-----|
| UI 组件 | 自写 | shadcn/ui |
| 动画 | CSS | framer-motion |
| 表单 | 原生 | react-hook-form + zod |
| 服务端状态 | useState | @tanstack/react-query |
| 图标 | 内联 SVG | lucide-react |
| Toast | 无 | sonner |
| AI 对话 | glm-4-flash | DeepSeek-V3 |
| 视频生成 | CogVideoX（429） | Replicate |
| 游戏工坊 | 文字冒险 | Vibe Coding Agent |
| Markdown | 无 | react-markdown |

## ADDED Requirements

### Requirement: 多模型 AI 路由
系统 SHALL 支持多模型路由，根据任务类型选择最合适的模型（DeepSeek 对话、智谱多媒体、Replicate 视频）。

#### Scenario: 对话请求路由
- **WHEN** 用户发送对话消息
- **THEN** 系统调用 DeepSeek-V3 生成回复，失败时 fallback 到 glm-4-flash

#### Scenario: 视频生成请求
- **WHEN** 用户请求生成视频
- **THEN** 系统调用 Replicate API（不再用 CogVideoX），返回任务 ID + 轮询状态

### Requirement: DeepSeek 搞笑增强
系统 SHALL 使用 DeepSeek-V3 作为主对话模型，通过 prompt engineering 强化搞笑能力，不依赖过时热梗。

#### Scenario: AI 回复搞笑度
- **WHEN** 用户与任意智能体对话
- **THEN** 回复含至少 1 个原创梗/反转/包袱，风格符合智能体人格，不引用 2008 年老梗

### Requirement: Vibe Coding Agent
系统 SHALL 提供 AI 自主编程功能：用户用自然语言描述需求 → AI 生成可运行代码 → 浏览器内即时预览。

#### Scenario: 用户请求制作工具
- **WHEN** 用户输入"做一个贪吃蛇游戏"或"做一个番茄钟计时器"
- **THEN** AI agent 分析需求 → 生成 HTML/JS 代码 → WebContainer 即时运行 → 用户看到可交互预览

#### Scenario: 代码可下载分享
- **WHEN** 代码生成完成
- **THEN** 用户可下载源码、分享预览链接、remix 他人作品

#### Scenario: Agent 自我纠错
- **WHEN** 生成的代码运行报错
- **THEN** Agent 读取错误信息 → 自动修复 → 重新运行

### Requirement: 下拉选择 + 自定义
系统 SHALL 在所有参数选择场景提供下拉 Select 组件，并支持"自定义..."选项。

#### Scenario: 智能体创建选择风格
- **WHEN** 用户创建智能体选择"说话风格"
- **THEN** 下拉显示预设（毒舌/温柔/中二/学术/市井等），选"自定义..."可输入

#### Scenario: 创意工坊参数
- **WHEN** 用户在创意工坊选择参数（文体/风格/时长/数量）
- **THEN** 全部用 Select 下拉，不要求手打

### Requirement: shadcn/ui 组件库
系统 SHALL 使用 shadcn/ui 替代自写 UI 组件，确保视觉一致性和可维护性。

#### Scenario: 组件使用
- **WHEN** 页面需要 Button/Card/Select/Dialog 等组件
- **THEN** 从 shadcn/ui 导入，应用金黄主题，不自己实现

### Requirement: AI 语音聊天
系统 SHALL 支持浏览器语音输入 + AI 回复 TTS 朗读。

#### Scenario: 语音输入
- **WHEN** 用户点击麦克风按钮说话
- **THEN** Web Speech API 识别语音转文字，发送给 AI，回复用 TTS 朗读

### Requirement: AI 绘画广场
系统 SHALL 提供公开画廊展示用户生成的 AI 图片，支持浏览/点赞/收藏。

### Requirement: 角色卡牌系统
系统 SHALL 为每个智能体生成卡牌，含稀有度（普通/稀有/史诗/传说）、技能、组合效果，增加游戏化乐趣。

### Requirement: 提示词市场
系统 SHALL 允许用户分享优质 prompt，其他用户可一键使用。

### Requirement: 成就系统
系统 SHALL 提供成就/徽章系统（对话 N 次、创作 N 个作品、连续签到 N 天）。

### Requirement: 排行榜
系统 SHALL 提供多维度排行榜（智能体热度、用户活跃度、作品热度）。

### Requirement: AI 朋友圈
系统 SHALL 让智能体之间自发"发朋友圈"动态，用户可评论点赞。

### Requirement: 深夜emo墙
系统 SHALL 提供匿名发布搞笑/emo 内容的墙，AI 智能体评论玩梗。

## MODIFIED Requirements

### Requirement: 创意工坊
原：6 功能（剧本/视频/图片/文章/游戏/语音），游戏是文字冒险。
现：7 功能（剧本/视频/图片/文章/**vibe coding**/语音/绘画广场），游戏改为 AI 自主编程。

### Requirement: 智能体配置
原：17 个固定人格 + 自定义智能体（纯文本输入）。
现：17 个固定人格 + 自定义智能体（下拉选择风格/性格/语气 + 自定义选项）。

### Requirement: UI 组件
原：自写 Button/Card/Input/Dialog/Badge/Spinner/EmptyState/Avatar。
现：shadcn/ui 全套组件 + framer-motion 动画 + lucide-react 图标。

## REMOVED Requirements

### Requirement: 每日热梗采集与注入
**Reason**: 引用的全是 2008 年过时梗，效果差且增加复杂度
**Migration**: 删除 `getActiveMemePrompt` / `incrementMemeUsage` / `trending_memes` 表查询，改用 prompt engineering

### Requirement: 文字冒险游戏
**Reason**: 定位错误，用户要的是 AI 制作游戏/工具，不是玩文字冒险
**Migration**: 替换为 Vibe Coding Agent（WebContainer + LLM）

### Requirement: 自写 UI 组件库
**Reason**: 违反"能用成熟方案就别自己做"原则
**Migration**: 替换为 shadcn/ui + framer-motion + lucide-react

### Requirement: CogVideoX 视频生成
**Reason**: 429 限流严重，几乎不可用
**Migration**: 替换为 Replicate API（开源视频模型）
