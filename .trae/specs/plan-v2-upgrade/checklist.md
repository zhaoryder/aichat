# Checklist

## 阶段零：前置准备
- [x] 模型选型决策：保留智谱 GLM，不引入新付费 API
- [x] 视频生成 429 问题改用前端友好提示+限流策略

## 阶段一：UI/UX 基础升级
- [x] `tailwindcss-animate` / `class-variance-authority` / `clsx` / `tailwind-merge` 已安装
- [x] shadcn/ui 已初始化（components.json + globals.css 主题变量）
- [x] 核心组件已添加（button/card/input/label/select/dialog/badge/dropdown-menu/popover/avatar/tabs/separator/sonner/skeleton/tooltip）
- [x] `framer-motion` 和 `lucide-react` 已安装
- [x] `react-hook-form` / `@hookform/resolvers` 已安装
- [x] `@tanstack/react-query` 已安装并配置 `QueryClientProvider`
- [x] Navbar 已迁移到 shadcn/ui 组件
- [x] `client/src/components/ui/` 下自写组件已删除（备份到 ui-legacy/）
- [x] `tailwind.config.ts` 已启用 `darkMode: 'class'`
- [x] 暗色模式 CSS 变量已定义（shadcn 语义令牌）
- [x] Navbar 主题切换按钮可工作（next-themes + ThemeToggle）
- [x] 主题选择可持久化（next-themes 默认 localStorage）

## 阶段二：AI 模型层（GLM + 移除热梗）
- [x] 保留智谱 GLM 客户端（AGNES_API_KEY / AGNES_API_BASE）
- [x] `chatCompletionStreamWithSystemPrompt()` 已实现（用于 Vibe Coding Agent）
- [x] `getActiveMemePrompt` / `incrementMemeUsage` 等热梗函数已删除
- [x] chat 路由中热梗注入逻辑已删除
- [x] `shared/agents.ts` 17 个智能体添加"原创幽默指南"
- [ ] 本地测试对话：GLM-4-Flash 回复搞笑度达标（待部署后验证）
- [ ] AI 回复不含 2008 年过时梗（待部署后验证）
- [ ] AI 回复含至少 1 个原创梗/反转/包袱（待部署后验证）
- [ ] AI 回复保持智能体人格特征（待部署后验证）

## 阶段三：视频生成（限流方案）
- [x] 保留智谱 CogVideoX 代码
- [x] 不引入 Replicate（用户选免费方案）
- [ ] 前端遇到 429 时显示"视频生成服务繁忙，请稍后重试"（待验证）
- [ ] 视频任务可正常轮询并返回结果（待部署后验证）

## 阶段四：Vibe Coding Agent
- [x] 采用 iframe srcdoc 方案（不用 WebContainer）
- [x] `server/src/routes/vibe-code.ts` 已创建
- [x] `POST /api/vibe-code/generate` SSE 流式生成代码可用
- [x] `POST /api/vibe-code/fix` SSE 流式修复可用
- [x] Agent system prompt 已配置（生成可独立运行的 HTML/JS）
- [x] `client/src/pages/studio/VibeCodePage.tsx` 已创建
- [x] 左侧需求输入框 + 示例 prompt + 生成/停止按钮 + 历史项目
- [x] 右侧上：流式代码显示（`<pre>` + 光标 + 自动滚底）
- [x] 右侧下：iframe srcDoc 实时预览（sandbox="allow-scripts allow-modals"）
- [x] 工具栏：复制 / 下载 / 修复 / 重置 / 保存
- [x] 数据库 `vibe_projects` 表（在 upgrade-v2.sql 中）
- [x] `POST /api/vibe-code/save` 保存项目可用
- [x] `GET /api/vibe-code/projects` 列表可用
- [x] `GET /api/vibe-code/projects/:id` 详情可用
- [x] `GET /api/vibe-code/explore` 公开广场可用
- [x] 旧 `GameStudioPage.tsx` 已删除
- [x] `/studio/game` 重定向到 `/studio/vibe-code`
- [ ] 测试：输入"做贪吃蛇"能生成可玩代码（待部署后验证）
- [ ] 测试：输入"做番茄钟"能生成可用工具（待部署后验证）

## 阶段五：下拉选择 + 自定义
- [x] `shared/presets.ts` 已创建（9 组预设）
- [x] `client/src/components/SelectWithCustom.tsx` 已创建
- [x] 组件支持预设选项 + "自定义..."弹出输入
- [x] `CreateAgentPage.tsx` 性格/风格/语气已改为 SelectWithCustom
- [x] 剧本生成页 文体/风格/角色数 已改为 SelectWithCustom
- [x] 文章生成页 文体/风格/字数 已改为 SelectWithCustom
- [x] 图片生成页 风格/尺寸/数量 已改为 SelectWithCustom
- [x] 视频生成页 风格/时长 已改为 SelectWithCustom

## 阶段六：新增功能
### AI 语音聊天
- [x] `useSpeechRecognition` hook 已创建（Web Speech API，zh-CN）
- [x] `useSpeechSynthesis` hook 已创建（TTS，优先中文语音）
- [x] ChatWindow 麦克风按钮可用（Mic/MicOff 图标）
- [x] ChatWindow 朗读开关可用（Volume2/VolumeX 图标）

### AI 绘画广场
- [x] 数据库 `image_gallery` 表（在 upgrade-v2.sql 中）
- [x] `GET /api/gallery/images` 分页 + 排序可用
- [x] `POST /api/gallery/images/:id/like` / `unlike` 可用
- [x] `GalleryPage.tsx` CSS columns 瀑布流 + framer-motion 点赞动画
- [x] 图片生成时"发布到广场"勾选可用

### 角色卡牌系统
- [x] `shared/agents.ts` 每个智能体有 `card` 字段（rarity/skills/combo）
- [x] 稀有度分配：传说（孔子/李白/鲁迅）、史诗（牛顿/爱因斯坦/马斯克/秦始皇）、稀有、普通
- [x] `CardsPage.tsx` 3D 翻转动画 + 收集进度
- [x] localStorage 持久化收集状态

### 提示词市场
- [x] 数据库 `prompt_market` 表（在 upgrade-v2.sql 中）
- [x] 后端 CRUD `/api/prompts/*` + 点赞 + 使用计数
- [x] `PromptMarketPage.tsx` 分类 Tabs + 搜索 + 一键复制 + 创建 Dialog

### 成就系统
- [x] 数据库 `achievements` + `user_achievements` 表（在 upgrade-v2.sql 中）
- [x] 12 条默认成就（ON CONFLICT DO NOTHING）
- [x] 后端 `checkAndGrantAchievement()` 函数，chat 路由调用
- [x] `AchievementsPage.tsx` 分类分组 + 进度条 + framer-motion 解锁动画

### 排行榜
- [x] `recharts` 已安装
- [x] `GET /api/leaderboard/agents` / `users` / `works` 可用
- [x] `LeaderboardPage.tsx` 柱状图 TOP5 + 表格 + tab 切换 + 金银铜样式

### AI 朋友圈
- [x] 数据库 `ai_posts` + `ai_post_comments` 表（在 upgrade-v2.sql 中）
- [x] `ai-feed-cron.ts` 定时任务每小时让随机智能体发动态
- [x] `/api/ai-posts` 列表 + 详情 + 评论 + 点赞 + AI 智能体评论
- [x] `AIFeedPage.tsx` 朋友圈样式 + 心情标签 + 评论展开/折叠

### 深夜emo墙
- [x] 数据库 `emo_wall` 表（在 upgrade-v2.sql 中）
- [x] `POST /api/emo-wall` 匿名发布 + AI 自动评论 + 随机昵称生成器
- [x] `EmoWallPage.tsx` 暗黑风格 + 瀑布流 + 匿名发布 + AI 评论区

## 阶段七：视觉与体验升级
- [ ] 首页 Hero 区：大图 + 标语 + CTA + framer-motion 入场动画（待优化）
- [ ] 首页智能体卡牌墙 3D 翻转 + hover 效果（待优化）
- [ ] 首页实时动态预览（最新对话/作品滚动）（待优化）
- [ ] 所有页面在 iPhone SE 上布局正常（待验证）
- [ ] 所有页面在 iPhone 14 上布局正常（待验证）
- [ ] ChatPage 输入框移动端优化（待验证）
- [ ] VibeCodePage 移动端布局（代码区可折叠）（待验证）
- [x] `react-markdown` / `remark-gfm` / `rehype-highlight` / `@tailwindcss/typography` / `highlight.js` 已安装
- [x] `client/src/components/Markdown.tsx` 已创建
- [x] ChatWindow AI 回复支持 Markdown 渲染
- [x] sonner Toaster 已在 main.tsx 配置
- [x] 收藏/签到/分享/创建作品有 Toast 反馈
- [x] shadcn skeleton 组件已安装
- [x] HomePage 加载时显示骨架屏

## 阶段八：数据库 Migration
- [x] `supabase/migrations/upgrade-v2.sql` 已创建
- [x] 包含 `image_gallery` 表 + RLS
- [x] 包含 `prompt_market` 表 + RLS
- [x] 包含 `achievements` + `user_achievements` 表 + RLS
- [x] 包含 `ai_posts` + `ai_post_comments` 表 + RLS
- [x] 包含 `emo_wall` 表 + RLS
- [x] 包含 `vibe_projects` 表 + RLS
- [x] 包含 `agent_unlocks` 表 + RLS
- [x] 27 个 RLS 策略已配置
- [x] 5 个 Realtime 表已配置（REPLICA IDENTITY FULL）
- [x] 12 条默认成就数据已插入（ON CONFLICT DO NOTHING）
- [x] 幂等设计（IF NOT EXISTS / DROP POLICY IF EXISTS）
- [ ] migration 已在 Supabase SQL Editor 执行（待用户操作）
- [ ] 所有新表创建成功验证（待执行后验证）

## 阶段九：部署与验证
- [ ] Railway 环境变量确认（AGNES_API_KEY / SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY）
- [ ] git push 后 Railway 自动部署成功
- [ ] `/api/health` 返回 `{"status":"ok"}`
- [ ] `/api/agents` 返回 18 个智能体
- [ ] 新路由 `/api/gallery` / `/api/prompts` / `/api/achievements` / `/api/leaderboard` / `/api/ai-posts` / `/api/emo-wall` / `/api/vibe-code` 可访问
- [ ] `client/shared/` 已同步（agents.ts / presets.ts / types.ts）
- [ ] `vercel --prod` 部署成功
- [ ] 首页加载无控制台错误
- [ ] 7 个新页面路由可访问（/gallery, /prompts, /achievements, /leaderboard, /ai-feed, /emo-wall, /cards）
- [ ] 对话功能：GLM-4-Flash 搞笑度达标
- [ ] Vibe Coding：贪吃蛇/番茄钟能生成并运行
- [ ] 新功能：语音/广场/卡牌/成就/排行榜/朋友圈/emo墙全部可用
- [ ] 暗色模式可切换
- [ ] 移动端体验流畅
- [ ] 全站无控制台错误
- [ ] 所有 Toast 反馈正常
