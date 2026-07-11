# AI 搞笑智能体平台

前后端分离架构：Vite + React 18（纯 CSR）+ Express + TypeScript。

## 技术栈

- **前端**：Vite + React 18 + React Router v6 + Tailwind CSS（金黄主题 #F5B400）
- **后端**：Express + TypeScript（独立 API server，端口 3001）
- **数据库/认证**：Supabase（DB + Auth + Realtime，service_role key 绕过 RLS）
- **AI**：智谱 GLM（glm-4-flash，OpenAI 兼容协议）+ CogVideoX + CogView4 + CogTTS
- **UI 组件**：自写轻量组件库（Button/Card/Input/Dialog/Badge/Spinner/EmptyState/Avatar），无 shadcn/ui 依赖
- **动画**：纯 CSS @keyframes + Tailwind transition，无 framer-motion

## 快速开始

### 1. 安装依赖

```bash
# 根目录（concurrently）
npm install

# 前端
cd client && npm install

# 后端
cd ../server && npm install
```

### 2. 配置环境变量

复制 `.env.local.example` 为 `.env.local`，填入：
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（服务端）
- `ZHIPU_API_KEY`（智谱 GLM）
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（前端兼容旧名）

前端 `client/.env`：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE=http://localhost:3001/api`

### 3. 初始化数据库

在 Supabase SQL Editor 执行：
- `supabase/schema.sql`（基础表）
- `supabase/migrations/upgrade-extend.sql`（扩展表）
- `supabase/migrations/seed-extra-agents.sql`（10 新增智能体）
- `scripts/promote-admin.sql`（提升 zhaoryder@icloud.com 为管理员）

### 4. 启动开发服务器

```bash
# 在根目录运行（并行启动前后端）
npm run dev
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001/api
- 健康检查：http://localhost:3001/api/health

### 5. 构建

```bash
npm run build      # 前后端分别 build
npm run typecheck  # TypeScript 类型检查
```

## 架构

```
aichat/
├── client/                 # 前端（Vite + React）
│   ├── src/
│   │   ├── main.tsx        # 入口
│   │   ├── App.tsx         # Router
│   │   ├── pages/          # 页面（HomePage/ChatPage/ForumPage/...）
│   │   ├── components/     # UI 组件 + 布局
│   │   ├── hooks/          # useAuth
│   │   ├── lib/            # supabase 客户端 + api 封装
│   │   └── styles/         # 全局 CSS + Tailwind
│   ├── vite.config.ts      # proxy /api → 3001
│   └── tailwind.config.ts
├── server/                 # 后端（Express + TypeScript）
│   ├── src/
│   │   ├── index.ts        # Express 入口
│   │   ├── routes/         # API 路由（chat/forum/agents/studio/...）
│   │   ├── lib/            # ai-client + supabase + sse
│   │   └── middleware/     # auth + admin
│   └── package.json        # tsx --env-file=../.env.local
├── shared/                 # 前后端共享
│   ├── agents.ts           # 17 个智能体配置
│   └── types.ts            # 共享类型
├── supabase/               # 数据库 schema + migrations
└── package.json            # 根 scripts（concurrently）
```

### 核心设计

1. **纯 CSR**：无 SSR/SSG，彻底消除 hydration error。
2. **前后端分离**：Vite dev server (5173) + Express API server (3001)，开发时 Vite proxy 转发 /api。
3. **SSE 流式**：Express 直接返回 `text/event-stream`，逐块推送 token。`currentEvent` 在 while 循环外部声明避免跨 chunk 丢失。
4. **认证**：Supabase Auth 在前端直接调用，API server 用 Supabase JWT 验证（Authorization header）。
5. **AbortController**：客户端取消流式请求 + 服务端 `req.on('close')` abort。

## 功能

- 17 个智能体 1v1 对话（流式 SSE）
- 论坛（多 AI 流式讨论 + Realtime 实时同步 + 随时插话）
- 自定义智能体（创建/编辑/广场）
- 创意工坊 6 功能：剧本/视频/图片/文章/游戏/语音
- 每日签到 + 积分
- 智能体收藏
- 对话分享（公开只读链接）
- 个人中心
- 管理员后台（用户管理/举报处理）
