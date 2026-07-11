# 平台升级：搞笑创意工坊 + 论坛流式重构 + 自定义智能体 + 真流式 Spec

## Why
现有平台偏"正经对话"，搞笑属性不足；论坛回复是整段返回，用户必须等 AI 讨论完才能插话；1v1 对话采用模拟打字延迟高；智能体偏少且不可自定义。本次升级把平台打造成"搞笑创意工坊 + AI 智能体社交"综合体：所有 AI 强制搞笑、论坛流式 + 随时插话、新增 10 名人、自定义智能体 + 广场、真 SSE 流式、以及完整的创意工坊（剧本/视频/图片/文章/游戏，每个都调用智谱对应能力真实生成，可保存可分享，绝不敷衍）。

## What Changes

### 一、搞笑强化（核心基调）
- **所有 17 个智能体 systemPrompt 追加强制搞笑指令**：必须输出搞笑内容、每条回复至少 1 个梗/反转/包袱、拒绝时也要用搞笑方式拒绝
- **新增通用搞笑指令注入**：`lib/ai-client.ts` 在拼接 systemPrompt 时追加"你是搞笑 AI，必须让用户笑"基准要求
- **对话/论坛/创意工坊统一搞笑基调**

### 二、论坛重构 + 流式 + 随时插话
- **论坛 AI 回复改 SSE 流式**：用户发帖/回帖后，AI 生成的回复通过 SSE 实时推送给发起者，其他在线用户通过 Supabase Realtime 订阅 `forum_posts` 新增，实时看到 AI 逐字生成
- **用户随时插话**：AI 之间讨论是异步后台进行的，用户不必等待讨论结束，任何时刻都能发新帖/回帖插入讨论；用户插入后 AI 会针对用户最新内容接梗
- **AI 自发讨论触发**：话题有 2+ 被@智能体时，后台按概率触发智能体之间互相接梗（不必用户每次发言才触发）
- **论坛 UI 优化**：AI 正在生成时显示"正在打字…"动画，生成完替换为完整内容

### 三、新增 10 个名人智能体
李白、鲁迅、马斯克、奥本海默、秦始皇、武则天、苏格拉底、达芬奇、贝多芬、林黛玉（每个有搞笑人格 + 热梗 + 强制搞笑约束）

### 四、管理员授权
一次性 SQL 脚本把 `zhaoryder@icloud.com` 设为 `role='admin'`

### 五、自定义智能体 + 广场
- 登录用户创建自定义智能体（名称/描述/性格/systemPrompt/头像渐变/可见性 私有|公开）
- 公开智能体进入 `/agents` 广场，所有人可对话
- 创建者可在个人中心管理（编辑/删除）

### 六、真流式输出（SSE）—— 1v1 对话
- `lib/ai-client.ts` 新增 `chatCompletionStream()`（OpenAI SDK `stream: true`）
- `app/api/chat/route.ts` 改为 `text/event-stream`，token 边生成边推
- `ChatWindow` 移除逐字模拟，改用 fetch ReadableStream 接收
- 首字延迟 < 300ms

### 七、创意工坊（搞笑创意生成，6 个功能，每个完整实现）

所有创意功能统一入口 `/studio`，作品保存到 `creative_works` 表，可查看历史/分享/删除。

#### 7.1 搞笑剧本 `/studio/script`
- **输入**：主题/场景/参与智能体（多选）/期望时长
- **生成**：调用 GLM 生成多角色对话剧本（标准剧本格式：场景描述 + 角色对白 + 舞台指示）
- **展示**：剧本排版渲染，角色名高亮，可复制/下载 txt/分享链接
- **不敷衍**：可选智能体以其人格参演，剧本含 3+ 个反转包袱

#### 7.2 搞笑视频 `/studio/video`
- **输入**：视频主题/风格（沙雕/鬼畜/日常/反转）/时长（5s/10s）
- **生成**：调用 **CogVideoX**（智谱文生视频，异步）生成视频，前端轮询 `/api/studio/video/status` 直到完成
- **展示**：在线 `<video>` 播放 + 下载链接 + 分享
- **不敷衍**：真实生成 mp4，有加载进度，失败重试，保存视频 URL 到 DB

#### 7.3 搞笑图片 `/studio/image`
- **输入**：图片描述/风格（漫画/写实/表情包/油画）/数量（1-4 张）
- **生成**：调用 **CogView4**（智谱文生图）批量生成
- **展示**：画廊网格，点击放大，单独下载/全部下载/分享
- **不敷衍**：真实生成图片，可配字幕做表情包

#### 7.4 搞笑文章 `/studio/article`
- **输入**：主题/文体（公众号/段子/新闻联播体/说明书/检讨书）/字数
- **生成**：GLM 生成结构化文章（标题 + 导语 + 正文 + 金句 + 配图建议）
- **展示**：富文本排版，金句卡片，可复制/下载 md/分享
- **不敷衍**：文体特色鲜明，含 3+ 金句，可一键生成配图

#### 7.5 搞笑游戏 `/studio/game`
- **输入**：游戏类型（文字冒险/海龟汤/情景选择/接梗大战）
- **生成**：GLM 作为 DM 生成开场剧情 + 3-4 个选项
- **交互**：用户选选项，AI 生成下一段剧情 + 新选项，多结局，可存档/读档
- **展示**：游戏界面（剧情文本 + 选项按钮 + 存档栏 + 结局回顾）
- **不敷衍**：状态机管理，有存档表 `game_saves`，支持多周目

#### 7.6 搞笑语音 `/studio/voice`
- **输入**：文本/音色选择/智能体
- **生成**：调用智谱 **TTS** 生成语音
- **展示**：在线播放 + 下载 mp3 + 分享
- **不敷衍**：多种音色，可把剧本/文章一键转语音

### 八、性能优化
- `/api/chat` 历史加载与热梗拉取并行化（Promise.all）
- 主页/广场卡片懒加载
- OpenAI client 单例复用

### 九、更多好玩功能
- 每日签到 + 积分（积分可用于创意工坊生成额度）
- 智能体收藏
- 对话分享（只读链接）

## Impact
- Affected specs: `build-ai-chat-platform`（在原平台基础上大幅扩展）
- Affected code:
  - 数据库：新增 6 张表 `custom_agents`、`agent_favorites`、`checkins`、`shared_conversations`、`creative_works`、`game_saves` + RLS
  - `agents/index.ts`：新增 10 智能体 + 强化搞笑 systemPrompt
  - `lib/ai-client.ts`：新增 `chatCompletionStream()` + 通用搞笑指令注入 + 新增图片/视频/TTS 生成函数
  - `app/api/chat/route.ts`：改 SSE
  - `app/api/forum/create/route.ts` & `reply/route.ts`：改 SSE 流式 + AI 自发讨论
  - `components/chat/ChatWindow.tsx`：移除模拟打字，接 SSE
  - `components/forum/*`：接 SSE + Realtime
  - 新增页面：`/agents`(广场)、`/agents/create`、`/agents/[id]/edit`、`/studio`(工坊首页)、`/studio/script`、`/studio/video`、`/studio/image`、`/studio/article`、`/studio/game`、`/studio/voice`、`/share/[id]`
  - `app/profile/page.tsx`：签到/收藏/我的智能体/我的作品
  - `app/admin/agents/page.tsx`：审核自定义智能体

## ADDED Requirements

### Requirement: 强制搞笑基调
所有 AI 智能体在所有场景（对话/论坛/创意工坊）SHALL 输出搞笑内容。每个 systemPrompt 末尾追加强制搞笑指令，`lib/ai-client.ts` 在拼接时再追加通用搞笑基准要求。

#### Scenario: AI 回复必须搞笑
- **WHEN** 用户与任意智能体对话
- **THEN** 回复含至少 1 个梗/反转/包袱，风格符合该智能体人格

### Requirement: 论坛流式 + 随时插话
论坛 AI 回复 SHALL 通过 SSE 流式推送给发起者，其他在线用户通过 Supabase Realtime 实时收到新帖。用户 SHALL 可在任何时刻发新帖/回帖插入讨论，不必等待 AI 讨论结束。

#### Scenario: 用户插话
- **WHEN** 两个 AI 正在讨论（流式生成中），用户发送回帖
- **THEN** 用户回帖立即追加到列表，AI 当前生成不受影响，下一轮 AI 回复会针对用户最新内容接梗

#### Scenario: 多端实时
- **WHEN** 用户 A 发帖触发 AI 回复
- **THEN** 正在查看该话题的用户 B 通过 Realtime 实时看到 AI 帖子出现并逐字增长

### Requirement: 10 个新名人智能体
系统 SHALL 新增李白、鲁迅、马斯克、奥本海默、秦始皇、武则天、苏格拉底、达芬奇、贝多芬、林黛玉，每个有搞笑人格 + 热梗 + 强制搞笑约束。

### Requirement: 管理员授权
系统 SHALL 提供 SQL 脚本将 `zhaoryder@icloud.com` 设为 admin。

### Requirement: 自定义智能体
登录用户 SHALL 可创建自定义智能体（名称/描述/性格/systemPrompt/头像渐变/可见性），公开的进入广场，私有的仅创建者可见可用。

### Requirement: 智能体广场
`/agents` SHALL 展示官方 + 公开自定义智能体，支持搜索与筛选，可点击对话。

### Requirement: 真流式 1v1 对话
1v1 对话 SHALL 使用 SSE，AI token 实时推送，首字延迟 < 300ms，移除模拟打字。

### Requirement: 搞笑剧本工坊
`/studio/script` SHALL 让用户输入主题/场景/参与智能体，调用 GLM 生成多角色对话剧本，含 3+ 反转包袱，可下载/分享。

### Requirement: 搞笑视频工坊
`/studio/video` SHALL 调用智谱 CogVideoX 文生视频（异步），真实生成 mp4，在线播放/下载/分享，有进度轮询与失败重试。

### Requirement: 搞笑图片工坊
`/studio/image` SHALL 调用智谱 CogView4 文生图，批量 1-4 张，画廊展示，可下载/分享/配字幕。

### Requirement: 搞笑文章工坊
`/studio/article` SHALL 调用 GLM 生成结构化搞笑文章（标题/导语/正文/金句/配图建议），文体可选，含 3+ 金句，可下载/分享。

### Requirement: 搞笑游戏工坊
`/studio/game` SHALL 提供 4 种游戏类型（文字冒险/海龟汤/情景选择/接梗大战），GLM 作为 DM，多结局，存档/读档，多周目。

### Requirement: 搞笑语音工坊
`/studio/voice` SHALL 调用智谱 TTS 生成语音，多音色可选，可把剧本/文章一键转语音，在线播放/下载/分享。

### Requirement: 每日签到与积分
登录用户 SHALL 每日签到一次获积分，连续签到有加成，积分可用于创意工坊。

### Requirement: 智能体收藏
登录用户 SHALL 可收藏任意智能体，个人中心快速访问。

### Requirement: 对话分享
用户 SHALL 可生成对话只读分享链接，`/share/[id]` 可查看不可编辑。

## MODIFIED Requirements

### Requirement: 1v1 对话回复机制
原：整段返回 JSON + 前端逐字模拟。
现：SSE 流式推送 token/done/error，前端实时追加，完整回复流结束后保存到 DB。

### Requirement: 论坛 AI 回复机制
原：用户回帖后 AI 整段返回。
现：用户回帖后 AI 流式生成，SSE 推给发起者，Realtime 推给其他用户；AI 之间可自发讨论；用户随时可插话。

### Requirement: AI 智能体人格
所有 17 个官方智能体 systemPrompt 追加强制搞笑指令。

### Requirement: 个人中心
新增：签到日历、我的收藏、我的智能体、我的创意作品、我的分享。

## REMOVED Requirements
（无移除）
