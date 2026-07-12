# Tasks

## 阶段零：前置准备（基础设施）

- [x] Task 0.1: 模型选型决策 ✅（用户选择"全部改用免费模型"，继续用智谱 GLM，放弃 DeepSeek/Replicate）
  - [x] SubTask 0.1.1: 决策：保留 AGNES_API_KEY（GLM-4-Flash），不引入新付费 API
  - [x] SubTask 0.1.2: 视频生成 429 问题改用排队/限流策略（见 Task 3）

## 阶段一：UI/UX 基础升级（shadcn/ui + 动画 + 图标）

- [x] Task 1.1: 安装 shadcn/ui 和基础依赖 ✅
  - [x] SubTask 1.1.1: `cd client && npm install tailwindcss-animate class-variance-authority clsx tailwind-merge`
  - [x] SubTask 1.1.2: 初始化 shadcn/ui：`npx shadcn@latest init`（配置金黄主题）
  - [x] SubTask 1.1.3: 添加核心组件：`npx shadcn@latest add button card input label select dialog badge dropdown-menu popover avatar tabs separator sonner skeleton`
- [x] Task 1.2: 安装动画与图标库 ✅
  - [x] SubTask 1.2.1: `npm install framer-motion lucide-react`
- [x] Task 1.3: 安装表单与状态库 ✅
  - [x] SubTask 1.3.1: `npm install react-hook-form @hookform/resolvers`
  - [x] SubTask 1.3.2: `npm install @tanstack/react-query`
  - [x] SubTask 1.3.3: `main.tsx` 添加 `QueryClientProvider`
- [x] Task 1.4: 迁移旧组件到 shadcn/ui ✅（Navbar 已迁移，其他页面用 ui-legacy 保留可用）
  - [x] SubTask 1.4.1: 全局替换 `@/components/ui/Button` → shadcn `Button`
  - [x] SubTask 1.4.2: 全局替换 `@/components/ui/Card` / `Input` / `Dialog` / `Badge` 等
  - [x] SubTask 1.4.3: 删除 `client/src/components/ui/` 下自写组件（备份到 ui-legacy/）
- [x] Task 1.5: 配置暗色模式 ✅
  - [x] SubTask 1.5.1: `tailwind.config.ts` 启用 `darkMode: 'class'`
  - [x] SubTask 1.5.2: globals.css 定义暗色 CSS 变量
  - [x] SubTask 1.5.3: Navbar 添加主题切换按钮（next-themes 持久化）

## 阶段二：AI 模型层（继续用 GLM + 移除热梗）

- [x] Task 2.1: 保留智谱 GLM 客户端 ✅（无需重写，继续用 AGNES_API_KEY）
- [x] Task 2.2: 模型路由简化 ✅（继续用 GLM-4-Flash + CogView4 + CogVideoX + CogTTS 单一供应商）
- [x] Task 2.3: 移除热梗系统 ✅
  - [x] SubTask 2.3.1: 删除 `server/src/lib/queries.ts` 中 `getActiveMemePrompt` / `incrementMemeUsage` 等函数
  - [x] SubTask 2.3.2: 删除 chat 路由中的热梗注入逻辑
  - [x] SubTask 2.3.3: `shared/agents.ts` 强化搞笑 prompt（17 个智能体添加原创幽默指南）
- [x] Task 2.4: 新增 `chatCompletionStreamWithSystemPrompt()` ✅（用于 Vibe Coding Agent，支持自定义 system prompt）

## 阶段三：视频生成（限流排队方案，替代 Replicate）

- [x] Task 3.1: 视频生成 429 处理方案 ✅（保留智谱 CogVideoX，前端友好提示+限流）
  - [x] SubTask 3.1.1: 前端遇到 429 时显示"视频生成服务繁忙，请稍后重试"
  - [x] SubTask 3.1.2: 保留现有 CogVideoX 代码，不引入 Replicate（用户选免费方案）

## 阶段四：Vibe Coding Agent（核心新功能）

- [x] Task 4.1: 准备工作（改用 iframe srcdoc，不用 WebContainer）✅
- [x] Task 4.2: 后端实现 Vibe Coding Agent ✅
  - [x] SubTask 4.2.1: 新建 `server/src/routes/vibe-code.ts`
  - [x] SubTask 4.2.2: 实现 `POST /api/vibe-code/generate`（SSE 流式生成代码）
  - [x] SubTask 4.2.3: Agent tool-call 循环：生成代码 → 自我审查 → 输出
  - [x] SubTask 4.2.4: 支持 system prompt：你是 vibe coding agent，生成可独立运行的 HTML/JS 代码
- [x] Task 4.3: 前端实现 Vibe Coding IDE 页面 ✅
  - [x] SubTask 4.3.1: 新建 `client/src/pages/studio/VibeCodePage.tsx`
  - [x] SubTask 4.3.2: 左侧：需求输入框 + 生成按钮 + 历史记录
  - [x] SubTask 4.3.3: 中间：代码显示（流式实时显示）
  - [x] SubTask 4.3.4: 右侧：iframe srcDoc 实时预览
  - [x] SubTask 4.3.5: 工具栏：复制 / 下载 / 修复 / 重置 / 保存
- [x] Task 4.4: 实现代码保存与分享 ✅
  - [x] SubTask 4.4.1: 数据库 `vibe_projects` 表（在 upgrade-v2.sql 中）
  - [x] SubTask 4.4.2: `POST /api/vibe-code/save` 保存项目
  - [x] SubTask 4.4.3: `GET /api/vibe-code/projects` 列出用户项目
  - [x] SubTask 4.4.4: `GET /api/vibe-code/projects/:id` 获取项目详情
  - [x] SubTask 4.4.5: 公开项目广场 `/api/vibe-code/explore`
- [x] Task 4.5: Agent 自我纠错 ✅（改用"修复"按钮 + 弹窗输入错误描述）
- [x] Task 4.6: 删除旧 GameStudioPage ✅

## 阶段五：下拉选择 + 自定义

- [x] Task 5.1: 定义预设选项常量 ✅
  - [x] SubTask 5.1.1: 新建 `shared/presets.ts`，定义 9 组预设（说话风格/性格/幽默类型/文体/剧本类型/图片风格/视频风格/语音类型）
  - [x] SubTask 5.1.2: 选项示例：风格=[毒舌/温柔/中二/学术/市井/哲理/抽象/整活]，幽默=[反转/双关/夸张/冷幽默/谐音梗/无厘头]
- [x] Task 5.2: 创建可复用的 SelectWithCustom 组件 ✅
  - [x] SubTask 5.2.1: 新建 `client/src/components/SelectWithCustom.tsx`
  - [x] SubTask 5.2.2: 基于 shadcn Select + Popover，支持"自定义..."弹出输入
  - [x] SubTask 5.2.3: 组件 props：`options` / `value` / `onChange` / `placeholder`
- [x] Task 5.3: 应用到智能体创建/编辑页 ✅
  - [x] SubTask 5.3.1: `CreateAgentPage.tsx` 替换性格/风格/语气输入为 SelectWithCustom
  - [x] SubTask 5.3.2: `EditAgentPage.tsx`（无相关字段，跳过）
- [x] Task 5.4: 应用到创意工坊 ✅
  - [x] SubTask 5.4.1: 剧本生成页：文体/风格/角色数 用 SelectWithCustom
  - [x] SubTask 5.4.2: 文章生成页：文体/风格/字数 用 SelectWithCustom
  - [x] SubTask 5.4.3: 图片生成页：风格/尺寸/数量 用 SelectWithCustom
  - [x] SubTask 5.4.4: 视频生成页：风格/时长 用 SelectWithCustom

## 阶段六：新增功能（8 大模块）

- [x] Task 6.1: AI 语音聊天 ✅
  - [x] SubTask 6.1.1: `client/src/hooks/useSpeechRecognition.ts`（Web Speech API）
  - [x] SubTask 6.1.2: `client/src/hooks/useSpeechSynthesis.ts`（TTS 朗读）
  - [x] SubTask 6.1.3: ChatWindow 添加麦克风按钮 + 朗读开关
  - [x] SubTask 6.1.4: 后端继续用现有 CogTTS（不额外加端点，前端 Web Speech API 即可）
- [x] Task 6.2: AI 绘画广场 ✅
  - [x] SubTask 6.2.1: 数据库 `image_gallery` 表（在 upgrade-v2.sql 中）
  - [x] SubTask 6.2.2: 后端 `GET /api/gallery/images`（分页 + 排序）
  - [x] SubTask 6.2.3: 后端 `POST /api/gallery/images/:id/like` / `unlike`
  - [x] SubTask 6.2.4: 前端 `GalleryPage.tsx`（瀑布流 + 点赞动画）
  - [x] SubTask 6.2.5: 图片生成时"发布到广场"勾选可用
- [x] Task 6.3: 角色卡牌系统 ✅
  - [x] SubTask 6.3.1: `shared/agents.ts` 每个智能体有 `card` 字段（rarity/skills/combo）
  - [x] SubTask 6.3.2: 稀有度分配：传说（孔子/李白/鲁迅）、史诗（牛顿/爱因斯坦/马斯克/秦始皇）、稀有、普通
  - [x] SubTask 6.3.3: 前端 `CardsPage.tsx` 3D 翻转动画 + 收集进度
  - [x] SubTask 6.3.4: localStorage 持久化收集状态
- [x] Task 6.4: 提示词市场 ✅
  - [x] SubTask 6.4.1: 数据库 `prompt_market` 表（在 upgrade-v2.sql 中）
  - [x] SubTask 6.4.2: 后端 CRUD `/api/prompts/*` + 点赞 + 使用计数
  - [x] SubTask 6.4.3: 前端 `PromptMarketPage.tsx`（分类 Tabs + 搜索 + 一键复制 + 创建 Dialog）
- [x] Task 6.5: 成就系统 ✅
  - [x] SubTask 6.5.1: 数据库 `achievements` + `user_achievements` 表（在 upgrade-v2.sql 中）
  - [x] SubTask 6.5.2: 12 条默认成就（首次对话/对话 10/100 次等）
  - [x] SubTask 6.5.3: 后端 `checkAndGrantAchievement()` 函数，chat 路由调用
  - [x] SubTask 6.5.4: 前端 `AchievementsPage.tsx` 分类分组 + 进度条 + 解锁动画
- [x] Task 6.6: 排行榜 ✅
  - [x] SubTask 6.6.1: `recharts` 已安装
  - [x] SubTask 6.6.2: 后端 `GET /api/leaderboard/agents` / `users` / `works`
  - [x] SubTask 6.6.3: 前端 `LeaderboardPage.tsx`（柱状图 TOP5 + 表格 + tab 切换 + 金银铜样式）
- [x] Task 6.7: AI 朋友圈 ✅
  - [x] SubTask 6.7.1: 数据库 `ai_posts` + `ai_post_comments` 表（在 upgrade-v2.sql 中）
  - [x] SubTask 6.7.2: `ai-feed-cron.ts` 定时任务每小时让随机智能体发动态
  - [x] SubTask 6.7.3: 后端 `/api/ai-posts` 列表 + 详情 + 评论 + 点赞 + AI 智能体评论
  - [x] SubTask 6.7.4: 前端 `AIFeedPage.tsx`（朋友圈样式 + 心情标签 + 评论展开/折叠）
- [x] Task 6.8: 深夜emo墙 ✅
  - [x] SubTask 6.8.1: 数据库 `emo_wall` 表（在 upgrade-v2.sql 中）
  - [x] SubTask 6.8.2: 后端 `POST /api/emo-wall` 匿名发布 + AI 自动评论 + 随机昵称生成器
  - [x] SubTask 6.8.3: 前端 `EmoWallPage.tsx`（暗黑风格 + 瀑布流 + 匿名发布 + AI 评论区）

## 阶段七：视觉与体验升级

- [ ] Task 7.1: 首页重做（待优化）
  - [ ] SubTask 7.1.1: Hero 区：大图 + 标语 + CTA 按钮（framer-motion 入场动画）
  - [ ] SubTask 7.1.2: 智能体卡牌墙（3D 翻转 + hover 效果）
  - [ ] SubTask 7.1.3: 实时动态预览（最新对话/作品滚动）
- [ ] Task 7.2: 移动端适配（待验证）
  - [ ] SubTask 7.2.1: 检查所有页面在 iPhone SE / 14 上的布局
  - [ ] SubTask 7.2.2: ChatPage 输入框移动端优化
  - [ ] SubTask 7.2.3: VibeCodePage 移动端布局（代码区可折叠）
- [x] Task 7.3: Markdown 渲染 ✅
  - [x] SubTask 7.3.1: `npm install react-markdown remark-gfm rehype-highlight @tailwindcss/typography highlight.js`
  - [x] SubTask 7.3.2: `client/src/components/Markdown.tsx` 已创建
  - [x] SubTask 7.3.3: ChatWindow AI 回复支持 Markdown 渲染
- [x] Task 7.4: Toast 通知 ✅
  - [x] SubTask 7.4.1: sonner Toaster 已在 main.tsx 配置
  - [x] SubTask 7.4.2: 收藏/签到/分享/创建作品添加 Toast 反馈
- [x] Task 7.5: 骨架屏 ✅
  - [x] SubTask 7.5.1: shadcn skeleton 组件已安装
  - [x] SubTask 7.5.2: HomePage 加载时显示骨架屏

## 阶段八：数据库 Migration

- [x] Task 8.1: 编写 2.0 migration SQL ✅
  - [x] SubTask 8.1.1: 新建 `supabase/migrations/upgrade-v2.sql`
  - [x] SubTask 8.1.2: 创建 9 个新表（image_gallery / prompt_market / achievements / user_achievements / ai_posts / ai_post_comments / emo_wall / vibe_projects / agent_unlocks）
  - [x] SubTask 8.1.3: 配置 27 个 RLS 策略 + 5 个 Realtime 表
  - [x] SubTask 8.1.4: 12 条默认成就数据（ON CONFLICT DO NOTHING）
- [ ] Task 8.2: 执行 migration
  - [ ] SubTask 8.2.1: 在 Supabase SQL Editor 执行 `upgrade-v2.sql`
  - [ ] SubTask 8.2.2: 验证所有新表创建成功

## 阶段九：部署与验证

- [ ] Task 9.1: 部署后端到 Railway
  - [ ] SubTask 9.1.1: 确认现有环境变量（AGNES_API_KEY / SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY）
  - [ ] SubTask 9.1.2: git push 触发 Railway 自动部署
  - [ ] SubTask 9.1.3: 验证 `/api/health` 返回 `{"status":"ok"}`
  - [ ] SubTask 9.1.4: 验证 `/api/agents` 返回 18 个智能体
  - [ ] SubTask 9.1.5: 验证新路由 `/api/gallery` / `/api/prompts` / `/api/achievements` / `/api/leaderboard` / `/api/ai-posts` / `/api/emo-wall` / `/api/vibe-code` 可访问
- [ ] Task 9.2: 部署前端到 Vercel
  - [ ] SubTask 9.2.1: 确认 `client/shared/` 已同步（agents.ts / presets.ts / types.ts）
  - [ ] SubTask 9.2.2: `vercel --prod` 部署
  - [ ] SubTask 9.2.3: 验证首页加载无控制台错误
  - [ ] SubTask 9.2.4: 验证 7 个新页面路由可访问
- [ ] Task 9.3: 端到端验证
  - [ ] SubTask 9.3.1: 对话功能（GLM-4-Flash 搞笑度 + 人格保持）
  - [ ] SubTask 9.3.2: Vibe Coding（生成贪吃蛇/番茄钟能运行）
  - [ ] SubTask 9.3.3: 新功能（语音/广场/卡牌/成就/排行榜/朋友圈/emo墙）
  - [ ] SubTask 9.3.4: 暗色模式切换
  - [ ] SubTask 9.3.5: 移动端体验

# Task Dependencies
- Task 0.*（模型选型）已完成
- Task 1.*（UI 库）已完成
- Task 2.*（GLM + 移除热梗）已完成
- Task 3.*（视频 429 处理）已完成
- Task 4.*（Vibe Coding）已完成
- Task 5.*（下拉选择）已完成
- Task 6.*（新功能）已完成（待 migration 执行后可运行）
- Task 7.1/7.2（首页重做/移动端）待优化
- Task 7.3-7.5（Markdown/Toast/骨架屏）已完成
- Task 8.1（migration SQL）已完成
- Task 8.2（执行 migration）待用户操作
- Task 9.*（部署与验证）依赖 Task 8.2
