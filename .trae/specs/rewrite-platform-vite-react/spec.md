# AI 搞笑智能体平台 - 全部重写 Spec

## Why
现有 Next.js 14 代码库存在系统性问题：hydration error 频发（SSR/CSR 不一致）、SSE 流式解析 bug（currentEvent 作用域错误导致"一直加载"）、代码质量参差（子代理并行实现导致风格混乱、重复逻辑）、架构耦合严重（Server Actions + API Routes + Server Components 混用）。修补式修复已无法解决根本问题，需要从零重写，采用更简单稳定的纯 CSR 架构。

## What Changes
- **BREAKING**：废弃 Next.js 14，改用 Vite + React 18（纯 CSR，无 SSR/SSG）
- **BREAKING**：废弃 App Router，改用 React Router v6
- **BREAKING**：废弃 Server Actions / Server Components，改用独立 Express API server
- **BREAKING**：废弃 API Routes（`app/api/`），改用 Express routes（`server/routes/`）
- **BREAKING**：移除 framer-motion，全部用 CSS/Tailwind 动画
- **BREAKING**：移除 shadcn/ui，自写轻量 UI 组件
- 保留：Supabase（DB + Auth + Realtime）、智谱 GLM（glm-4-flash）、Tailwind CSS
- 保留全部功能：17 智能体对话、论坛、自定义智能体、创意工坊 6 功能、签到/收藏/分享、管理员

## Impact
- Affected specs: build-ai-chat-platform, extend-agents-and-streaming（均废弃）
- Affected code: 全部 87 个文件重写
- 数据库 schema 保留（upgrade-extend.sql 已执行的表不动）
- .env.local 配置保留（Supabase + 智谱 GLM 凭据）

## Architecture

```
aichat/
├── client/                 # 前端（Vite + React）
│   ├── src/
│   │   ├── main.tsx        # 入口
│   │   ├── App.tsx         # Router
│   │   ├── pages/          # 页面
│   │   ├── components/     # UI 组件（自写轻量）
│   │   ├── lib/            # supabase 客户端、工具
│   │   ├── agents/         # 智能体配置
│   │   ├── hooks/          # 自定义 hooks
│   │   └── styles/         # 全局 CSS + Tailwind
│   ├── index.html
│   ├── vite.config.ts      # proxy /api → 3001
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── server/                 # 后端（Express + TypeScript）
│   ├── src/
│   │   ├── index.ts        # Express 入口
│   │   ├── routes/         # API 路由
│   │   │   ├── chat.ts     # SSE 流式对话
│   │   │   ├── forum.ts    # 论坛流式
│   │   │   ├── agents.ts   # 自定义智能体 CRUD
│   │   │   ├── studio.ts   # 创意工坊 6 功能
│   │   │   ├── auth.ts     # 注册/登录辅助
│   │   │   ├── checkin.ts  # 签到
│   │   │   ├── favorite.ts # 收藏
│   │   │   ├── share.ts    # 分享
│   │   │   └── admin.ts    # 管理员
│   │   ├── lib/
│   │   │   ├── ai-client.ts    # 智谱 GLM 调用（流式+多媒体）
│   │   │   ├── supabase.ts     # 服务端 Supabase 客户端
│   │   │   └── sse.ts          # SSE 工具函数
│   │   ├── middleware/
│   │   │   └── auth.ts     # JWT 验证中间件
│   │   └── agents/         # 智能体配置（shared with client）
│   └── tsconfig.json
├── shared/                  # 前后端共享类型
│   └── types.ts
├── supabase/               # 保留现有
├── .env.local              # 保留现有
└── package.json            # workspaces 或统一 scripts
```

### 核心架构决策
1. **纯 CSR**：无 SSR，彻底消除 hydration error。页面由 React Router 客户端渲染。
2. **前后端分离**：Vite dev server (5173) + Express API server (3001)，开发时 Vite proxy 转发 /api。
3. **SSE 流式**：Express 直接返回 `text/event-stream`，比 Next.js API Route 更可控。
4. **认证**：Supabase Auth 在前端直接调用（signIn/signUp），API server 用 Supabase JWT 验证。
5. **无 framer-motion**：用 Tailwind 的 `transition`、`animate-*`、CSS `@keyframes` 实现所有动画。
6. **无 shadcn/ui**：自写 Button/Card/Input/Dialog 等基础组件，Tailwind 样式，金黄主题。

## ADDED Requirements

### Requirement: Vite + React 前端
The system SHALL use Vite + React 18 with React Router v6 for client-side rendering.

#### Scenario: 页面加载无 hydration error
- **WHEN** 用户访问任何页面
- **THEN** 控制台零 hydration error、零 SSR 相关警告

#### Scenario: 路由切换
- **WHEN** 用户点击导航链接
- **THEN** 客户端路由切换，无页面刷新，带过渡动画

### Requirement: Express API Server
The system SHALL provide an Express server handling all API requests including SSE streaming.

#### Scenario: SSE 流式对话
- **WHEN** 用户发送消息到 /api/chat
- **THEN** Express 返回 text/event-stream，逐块推送 token，首字 < 500ms

#### Scenario: API 鉴权
- **WHEN** 请求需登录的 API
- **THEN** 中间件验证 Supabase JWT，无效则 401

### Requirement: 轻量 UI 组件
The system SHALL provide custom UI components without shadcn/ui dependency.

#### Scenario: 组件使用
- **WHEN** 页面需要按钮/卡片/输入框
- **THEN** 使用自写组件，金黄主题，Tailwind 样式，无外部 UI 依赖

### Requirement: CSS 动画
The system SHALL use CSS/Tailwind animations instead of framer-motion.

#### Scenario: 卡片悬停
- **WHEN** 用户悬停卡片
- **THEN** CSS transition 触发 scale(1.02-1.05) + shadow，0.3-0.5s ease-out

### Requirement: SSE 流式对话（稳定版）
The system SHALL provide stable SSE streaming for 1v1 chat.

#### Scenario: 正常对话
- **WHEN** 用户发送消息
- **THEN** AI 回复实时流式追加，token 不丢失，流结束 isStreaming=false

#### Scenario: 网络断开
- **WHEN** 流式传输中网络断开
- **THEN** 已接收的 token 保留，isStreaming 设为 false，不卡在加载状态

#### Scenario: 取消请求
- **WHEN** 用户发新消息时取消上一个流
- **THEN** AbortController 触发，旧流停止，不报错

### Requirement: 论坛流式 + 随时插话
The system SHALL provide forum streaming where users can interject anytime.

#### Scenario: AI 流式讨论
- **WHEN** 用户发帖/回帖
- **THEN** AI 流式生成回复，发起者看到逐字生成

#### Scenario: 多用户实时同步
- **WHEN** 其他用户发帖
- **THEN** Supabase Realtime 推送，所有用户实时看到新帖

#### Scenario: 随时插话
- **WHEN** AI 正在流式生成
- **THEN** 用户输入框始终可用，可随时发帖打断 AI

### Requirement: 创意工坊 6 功能
The system SHALL provide 6 creative studio features, each fully implemented.

#### Scenario: 搞笑剧本
- **WHEN** 用户选角色+主题+时长
- **THEN** GLM 流式生成多角色剧本，含 3+ 反转，可下载分享

#### Scenario: 搞笑视频
- **WHEN** 用户提交主题+风格
- **THEN** CogVideoX 异步生成，前端轮询，完成后播放下载

#### Scenario: 搞笑图片
- **WHEN** 用户描述+选风格+数量
- **THEN** CogView4 批量生成，画廊展示，可配字幕做表情包

#### Scenario: 搞笑文章
- **WHEN** 用户选主题+文体+字数
- **THEN** GLM 流式生成结构化文章，含金句卡片，可配图

#### Scenario: 搞笑游戏
- **WHEN** 用户选游戏类型
- **THEN** GLM 作为 DM 生成剧情+选项，多结局，可存档

#### Scenario: 搞笑语音
- **WHEN** 用户输入文本+选音色
- **THEN** CogTTS 生成语音，可播放下载

### Requirement: 自定义智能体
The system SHALL allow users to create custom agents with name/description/personality.

#### Scenario: 创建智能体
- **WHEN** 用户填写表单
- **THEN** 智能体保存到 custom_agents，可设公开/私有

#### Scenario: 上线广场
- **WHEN** 用户设为公开
- **THEN** 广场页展示，其他用户可与之对话

### Requirement: 好玩功能
The system SHALL provide checkin, favorites, and sharing.

#### Scenario: 每日签到
- **WHEN** 用户每日签到
- **THEN** 积分+10，连续加成，签到日历展示

#### Scenario: 智能体收藏
- **WHEN** 用户点收藏
- **THEN** toggle 收藏，个人中心可查看

#### Scenario: 对话分享
- **WHEN** 用户点分享
- **THEN** 生成 slug 链接，只读页可访问

## MODIFIED Requirements

### Requirement: 智能体配置
保留现有 17 个智能体（7 原有 + 10 新增），systemPrompt 含强制搞笑指令。配置从 `shared/agents.ts` 导出，前后端共享。

### Requirement: 数据库 Schema
保留现有 Supabase 表结构（profiles/conversations/messages/forum_topics/forum_posts/custom_agents/agent_favorites/checkins/shared_conversations/creative_works/game_saves），不新建表不修改字段。

### Requirement: 智谱 GLM 集成
保留 glm-4-flash 模型，保留 CogVideoX/CogView4/CogTTS 多媒体能力。AI client 从 `server/src/lib/ai-client.ts` 导出，仅服务端调用（保护 API key）。

## REMOVED Requirements

### Requirement: Next.js App Router
**Reason**: SSR 导致 hydration error，Server Components/Server Actions 增加复杂度
**Migration**: 改用 Vite + React 纯 CSR + React Router

### Requirement: framer-motion
**Reason**: 增加包体积，偶尔导致动画卡顿，CSS 动画更稳定
**Migration**: 用 Tailwind transition + CSS @keyframes 替代

### Requirement: shadcn/ui
**Reason**: 依赖较多子组件，样式定制复杂，自写更轻量
**Migration**: 自写 Button/Card/Input/Dialog/Badge 等基础组件

### Requirement: API Routes (app/api/)
**Reason**: Next.js API Routes 的 SSE 实现不稳定，stream 边界处理有问题
**Migration**: 改用 Express routes，直接 res.write() 推送 SSE，更可控
