# Tasks

## 阶段一：项目初始化与基础设施

- [x] Task 1: 初始化 Next.js 14 项目并配置基础环境
  - [x] SubTask 1.1: 使用 `create-next-app` 初始化 TypeScript + Tailwind + App Router 项目
  - [x] SubTask 1.2: 安装核心依赖：shadcn/ui、lucide-react、framer-motion、@tanstack/react-query、zustand、@supabase/supabase-js
  - [x] SubTask 1.3: 配置 Tailwind 主题色（金黄色主色 `#F5B400`）与全局样式
  - [x] SubTask 1.4: 创建 `.env.local` 模板，配置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`AGNES_API_KEY`、`AGNES_API_BASE`
  - [x] SubTask 1.5: 验证：`npm run dev` 启动无报错，主页可访问

- [x] Task 2: 配置 Supabase 项目与数据库 Schema
  - [x] SubTask 2.1: 编写 `supabase/schema.sql`，创建表：`profiles`、`agents`、`conversations`、`messages`、`forum_topics`、`forum_posts`、`reports`、`moderation_keywords`、`trending_memes`
  - [x] SubTask 2.2: 为每张表编写 RLS（Row Level Security）策略（用户只能 CRUD 自己的数据；论坛公开可读；管理员全权）
  - [x] SubTask 2.3: 编写 `supabase/seed.sql`，预置 7 个 AI 智能体数据与初始审核关键词与若干兜底经典梗
  - [x] SubTask 2.4: 编写 `scripts/init-db.md` 说明如何在 Supabase 控制台执行 SQL

## 阶段二：核心库与配置

- [x] Task 3: 实现 AI 智能体人格配置
  - [x] SubTask 3.1: 创建 `agents/index.ts`，导出 7 个智能体配置（id、name、avatar、era、tagline、system_prompt、topics）
  - [x] SubTask 3.2: 编写每个智能体的 system_prompt（融入热梗 + 人格特色，如 C罗 "SIUUU"、野兽先生 "今天我要花掉一百万"）
  - [x] SubTask 3.3: 创建头像组件（首字母 + 渐变背景，每个智能体独特配色）
  - [x] SubTask 3.4: 验证：导出结构正确，TypeScript 类型完整

- [x] Task 4: 实现 Agnes AI API 客户端
  - [x] SubTask 4.1: 创建 `lib/ai-client.ts`，封装 OpenAI 兼容协议调用 Agnes 模型
  - [x] SubTask 4.2: 实现 `chatCompletion(messages, agentId)` 函数，根据 agentId 注入 system_prompt，并在末尾追加当前活跃热梗提示（从 `trending_memes` 表拉取 is_active=true）
  - [x] SubTask 4.3: 每次调用成功后递增被引用热梗的 `used_count`
  - [x] SubTask 4.4: 实现错误处理（超时、限流、API 错误）
  - [x] SubTask 4.5: 验证：用测试脚本调用一次 API，确认返回正常且热梗提示已注入

- [x] Task 5: 实现 Supabase 客户端封装
  - [x] SubTask 5.1: 创建 `lib/supabase/client.ts`（浏览器端）与 `lib/supabase/server.ts`（服务端）
  - [x] SubTask 5.2: 封装常用查询：创建对话、追加消息、获取对话历史、创建论坛话题、获取话题列表等
  - [x] SubTask 5.3: 验证：客户端可成功连接 Supabase

## 阶段三：账户系统

- [x] Task 6: 实现用户注册与登录
  - [x] SubTask 6.1: 创建 `/auth/login` 与 `/auth/register` 页面
  - [x] SubTask 6.2: 调用 Supabase Auth 实现注册（邮箱+密码+昵称），注册成功后在 `profiles` 表插入记录
  - [x] SubTask 6.3: 实现登录、登出、session 保持
  - [x] SubTask 6.4: 创建鉴权中间件保护需登录路由（`/chat`、`/forum/new`、`/profile`）
  - [x] SubTask 6.5: 验证：注册 → 登录 → 访问受保护页面 → 登出 全流程通畅

- [x] Task 7: 实现个人中心
  - [x] SubTask 7.1: 创建 `/profile` 页面，展示用户信息（头像、昵称、邮箱）
  - [x] SubTask 7.2: 展示用户对话历史列表与论坛发帖历史
  - [x] SubTask 7.3: 支持修改昵称与头像（URL 输入或预设选择）
  - [x] SubTask 7.4: 验证：个人中心数据正确展示，修改昵称后生效

## 阶段四：核心功能 - 1v1 对话

- [x] Task 8: 实现主页与智能体选择
  - [x] SubTask 8.1: 创建主页布局：Hero 区、智能体卡片网格、论坛热门预览、特性区、页脚
  - [x] SubTask 8.2: 实现智能体卡片组件（头像、名字、tagline、悬停动画 scale 1.03 + shadow）
  - [x] SubTask 8.3: 点击卡片跳转 `/chat/[agentId]`
  - [x] SubTask 8.4: 验证：主页渲染美观，悬停动画顺滑

- [x] Task 9: 实现 1v1 对话页面
  - [x] SubTask 9.1: 创建 `/chat/[agentId]` 路由，未登录跳转登录页
  - [x] SubTask 9.2: 实现对话 UI：消息列表（左右气泡区分）、输入框、发送按钮
  - [x] SubTask 9.3: 实现 API Route `/api/chat`，接收用户消息，保存到 DB，调用 AI 生成回复，保存回复
  - [x] SubTask 9.4: 实现加载状态与逐字/流式显示 AI 回复
  - [x] SubTask 9.5: 实现历史对话恢复（首次进入创建新对话，已有对话加载历史）
  - [x] SubTask 9.6: 验证：发送消息 → 收到带人格特色的回复 → 刷新后历史仍在

## 阶段五：论坛功能

- [x] Task 10: 实现论坛列表与详情
  - [x] SubTask 10.1: 创建 `/forum` 页面，展示话题列表（标题、作者、回复数、最后活动时间）
  - [x] SubTask 10.2: 创建 `/forum/topic/[id]` 页面，展示话题详情与回帖列表
  - [x] SubTask 10.3: 实现话题分类/标签筛选（可选：按 @的智能体筛选）
  - [x] SubTask 10.4: 验证：论坛列表与详情正确渲染

- [x] Task 11: 实现发起新话题与 AI 自动回复
  - [x] SubTask 11.1: 创建 `/forum/new` 页面，表单含标题、内容、@提及智能体（多选）
  - [x] SubTask 11.2: 实现 API Route `/api/forum/create`，保存话题后异步触发被 @智能体生成首条回复
  - [x] SubTask 11.3: 实现回帖 API `/api/forum/reply`，用户回帖后随机触发 1 个相关智能体回复
  - [x] SubTask 11.4: 实现多智能体交叉讨论触发（话题中已存在 2+ 智能体时，新回复有概率触发另一智能体接梗）
  - [x] SubTask 11.5: 验证：发新话题 → 1-3 秒内 AI 回复 → 用户回帖 → AI 接力回复

## 阶段六：审核系统

- [x] Task 12: 实现关键词过滤
  - [x] SubTask 12.1: 创建 `lib/moderation.ts`，提供 `containsForbidden(content)` 函数，查询 `moderation_keywords` 表并正则匹配
  - [x] SubTask 12.2: 在所有内容提交 API（chat、forum create、forum reply）中调用过滤，命中则拒绝
  - [x] SubTask 12.3: 验证：发送含关键词内容被拦截

- [x] Task 13: 实现用户举报功能
  - [x] SubTask 13.1: 在消息/帖子/回复组件添加"举报"按钮
  - [x] SubTask 13.2: 实现 API `/api/report`，创建举报记录（type、target_id、reason、reporter_id、status=pending）
  - [x] SubTask 13.3: 验证：举报成功创建记录

- [x] Task 14: 实现管理员后台
  - [x] SubTask 14.1: 创建 `/admin` 路由，仅 role=admin 可访问（中间件保护）
  - [x] SubTask 14.2: 实现举报列表页（查看举报详情、操作：忽略/删除内容/封禁用户）
  - [x] SubTask 14.3: 实现关键词管理页（增删查改 `moderation_keywords`）
  - [x] SubTask 14.4: 实现用户管理页（查看用户、封禁/解封）
  - [x] SubTask 14.5: 验证：管理员可处理举报、维护关键词、封禁用户

## 阶段七：每日热梗采集系统

- [x] Task 17: 实现每日网络热梗采集与动态注入
  - [x] SubTask 17.1: 在 `trending_memes` 表 schema 上增加字段：`content`、`source`、`fetched_at`、`is_active`、`used_count`，并建立 `fetched_at` 与 `is_active` 索引
  - [x] SubTask 17.2: 创建 `lib/meme-fetcher.ts`，封装搜索逻辑：调用 DuckDuckGo HTML 接口（或备用源）查询"今日网络热词 最新梗 热搜梗 网络流行语"，解析结果摘要提取候选梗词
  - [x] SubTask 17.3: 实现去重逻辑：与最近 30 天 `trending_memes` 内容比对（归一化后），过滤重复
  - [x] SubTask 17.4: 实现 API Route `/api/cron/fetch-memes`：触发采集 → 入库（is_active=true）→ 同时将超过 7 天的旧梗置 is_active=false
  - [x] SubTask 17.5: 配置 Vercel Cron（`vercel.json`）每日 03:00（Asia/Shanghai 实为 UTC 19:00）触发该 API，使用 `CRON_SECRET` 鉴权防止外部调用
  - [x] SubTask 17.6: 在 `lib/ai-client.ts` 中实现：每次 chatCompletion 前拉取活跃热梗拼接到 system_prompt 末尾（提示"可自然融入以下当下热梗，不要堆砌"），调用成功后递增 used_count
  - [x] SubTask 17.7: 实现采集失败容错：搜索源不可用时记录日志但不抛错，AI 沿用上次活跃梗
  - [x] SubTask 17.8: 验证：手动触发 `/api/cron/fetch-memes` → 入库若干新梗 → 调用 AI 时 system_prompt 末尾包含活跃梗 → used_count 递增

## 阶段八：UI/UX 打磨与测试

- [x] Task 15: 应用金黄色主题与全局视觉打磨
  - [x] SubTask 15.1: 配置 shadcn/ui 主题变量为主色金黄
  - [x] SubTask 15.2: 统一组件视觉：按钮、卡片、输入框、头像、气泡
  - [x] SubTask 15.3: 调整动画曲线为 ease-out、时长 0.3-0.5s、scale 1.02-1.05
  - [x] SubTask 15.4: 适配深色模式（可选，如时间允许）
  - [x] SubTask 15.5: 验证：整体视觉现代美观耐看，悬停动画细腻

- [x] Task 16: 端到端测试与 Bug 修复
  - [x] SubTask 16.1: 使用 webapp-testing skill 编写 Playwright 脚本覆盖：注册→登录→主页→对话→论坛→举报 流程
  - [x] SubTask 16.2: 使用 web-design-guidelines skill 审查 UI 合规性
  - [x] SubTask 16.3: 修复发现的问题
  - [x] SubTask 16.4: 最终回归测试，确保所有功能正常

## Task Dependencies
- Task 2 依赖 Task 1
- Task 3、4、5 可并行（依赖 Task 1、2）
- Task 6 依赖 Task 5
- Task 7 依赖 Task 6
- Task 8 依赖 Task 3
- Task 9 依赖 Task 4、5、6、8
- Task 10、11 依赖 Task 4、5、6
- Task 12、13、14 依赖 Task 5、6
- Task 17 依赖 Task 2、4、5（trending_memes 表与 AI 客户端就绪后即可独立开发）
- Task 15 贯穿全程，集中打磨在 Task 8-14 完成后
- Task 16 依赖所有功能 Task（含 Task 17）
