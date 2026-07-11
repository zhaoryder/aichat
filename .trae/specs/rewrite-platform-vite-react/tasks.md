# Tasks

## 阶段一：项目初始化

- [x] Task 1: 初始化 Vite + React + Express 项目结构
  - [x] SubTask 1.1: 创建 `client/` 目录，`npm create vite@latest client -- --template react-ts`，配置 `vite.config.ts`（proxy /api → localhost:3001，port 5173）
  - [x] SubTask 1.2: 创建 `server/` 目录，初始化 Express + TypeScript（`server/src/index.ts`，监听 3001，CORS，JSON body parser）
  - [x] SubTask 1.3: 创建 `shared/` 目录，`shared/types.ts` 导出前后端共享类型（Message/Conversation/Agent/Post 等）
  - [x] SubTask 1.4: 配置 Tailwind CSS（`client/tailwind.config.ts`，金黄主色 #F5B400，自定义动画）
  - [x] SubTask 1.5: 配置 `client/tsconfig.json` 的 path alias（`@/` → `client/src/`）
  - [x] SubTask 1.6: 根 `package.json` 统一 scripts（`dev` 同时启动 client+server，用 concurrently）
  - [x] SubTask 1.7: 验证：`npm run dev` 同时启动前后端，访问 localhost:5173 显示空白 React 页

- [x] Task 2: 自写轻量 UI 组件库
  - [x] SubTask 2.1: `client/src/components/ui/Button.tsx`（variants: primary/ghost/outline/destructive，sizes: sm/md/lg，金黄主题）
  - [x] SubTask 2.2: `client/src/components/ui/Card.tsx`（Card/Header/Body/Footer，hover scale 动画）
  - [x] SubTask 2.3: `client/src/components/ui/Input.tsx`（Input/Textarea，focus ring 金黄）
  - [x] SubTask 2.4: `client/src/components/ui/Dialog.tsx`（Modal 弹窗，CSS 动画进出，ESC 关闭，遮罩点击关闭）
  - [x] SubTask 2.5: `client/src/components/ui/Badge.tsx`（标签徽章，金黄变体）
  - [x] SubTask 2.6: `client/src/components/ui/Spinner.tsx`（加载旋转图标，纯 CSS）
  - [x] SubTask 2.7: `client/src/components/ui/EmptyState.tsx`（空状态占位，图标+文案+可选 CTA）
  - [x] SubTask 2.8: `client/src/components/ui/Avatar.tsx`（智能体头像，首字母+渐变背景）
  - [x] SubTask 2.9: 验证：组件可渲染，样式正确，零外部 UI 依赖

- [x] Task 3: 全局样式 + 主题
  - [x] SubTask 3.1: `client/src/styles/globals.css`（Tailwind directives + CSS 变量 + 自定义动画 keyframes）
  - [x] SubTask 3.2: 定义 CSS 变量：`--color-primary: #F5B400`，hover/active 状态
  - [x] SubTask 3.3: 自定义动画：`@keyframes fade-in`、`slide-up`、`bounce-dot`、`shimmer`、`pulse-cursor`
  - [x] SubTask 3.4: 滚动条样式（thin scrollbar）
  - [x] SubTask 3.5: 验证：全局样式生效，动画流畅

## 阶段二：共享代码与后端核心

- [x] Task 4: 智能体配置 + 共享类型
  - [x] SubTask 4.1: `shared/agents.ts` 导出 17 个 AgentConfig（7 原有 + 10 新增），含 id/name/era/title/tagline/avatarGradient/systemPrompt/topics
  - [x] SubTask 4.2: 每个 systemPrompt 含人格+口头禅+热梗+强制搞笑约束
  - [x] SubTask 4.3: `shared/types.ts` 导出 Message/Conversation/Agent/Post/CustomAgent/CreativeWork/Checkin 等接口
  - [x] SubTask 4.4: 验证：类型完整，前后端可 import

- [x] Task 5: 后端 Supabase + Auth 中间件
  - [x] SubTask 5.1: `server/src/lib/supabase.ts` 创建服务端 Supabase 客户端（用 service_role key，绕过 RLS 用于服务端操作）
  - [x] SubTask 5.2: `server/src/lib/queries.ts` 封装数据库查询（createConversation/addMessage/listMessages/createForumTopic/createForumPost/listForumTopics/listForumPosts/createCustomAgent/listCustomAgents/getCustomAgentById/updateCustomAgent/deleteCustomAgent/listPublicCustomAgents/createCreativeWork/listCreativeWorks/getCreativeWorkById/updateCreativeWork/createGameSave/listGameSaves/getGameSaveById/updateGameSave/deleteGameSave/checkin/listCheckins/toggleFavorite/listFavorites/isFavorited/createShare/getShare）
  - [x] SubTask 5.3: `server/src/middleware/auth.ts` JWT 验证中间件（从 Authorization header 提取 Supabase JWT，验证用户，注入 req.user）
  - [x] SubTask 5.4: 可选 admin 中间件（检查 req.user.role === 'admin'）
  - [x] SubTask 5.5: 验证：中间件能验证有效/无效 token

- [x] Task 6: 后端 AI 客户端
  - [x] SubTask 6.1: `server/src/lib/ai-client.ts` 封装智谱 GLM 调用（OpenAI 兼容协议）
  - [x] SubTask 6.2: `chatCompletionStream(messages, agentId, options)` 返回 AsyncGenerator<string>，用 OpenAI SDK stream:true
  - [x] SubTask 6.3: 调用前注入 systemPrompt + 强制搞笑基准指令 + 热梗提示
  - [x] SubTask 6.4: `generateImage(prompt, options)` 调用 CogView4
  - [x] SubTask 6.5: `submitVideoTask(prompt, options)` + `getVideoTaskResult(id)` 调用 CogVideoX 异步
  - [x] SubTask 6.6: `generateSpeech(text, options)` 调用 CogTTS
  - [x] SubTask 6.7: 错误分类（超时/限流/API 错误）
  - [x] SubTask 6.8: 验证：脚本调用 chatCompletionStream 能逐块产出 token

- [x] Task 7: 后端 SSE 工具
  - [x] SubTask 7.1: `server/src/lib/sse.ts` 导出 `sseStream(res, generator)` 工具函数
  - [x] SubTask 7.2: 设置 SSE headers（Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive）
  - [x] SubTask 7.3: `sendEvent(res, event, data)` 函数（`event: xxx\ndata: JSON\n\n`）
  - [x] SubTask 7.4: 支持 AbortController（req.on('close') 时 abort）
  - [x] SubTask 7.5: 验证：curl 调用能收到逐块 SSE 事件

## 阶段三：前端核心

- [x] Task 8: 前端 Supabase 客户端 + Auth Context
  - [x] SubTask 8.1: `client/src/lib/supabase.ts` 创建浏览器端 Supabase 客户端（用 anon key）
  - [x] SubTask 8.2: `client/src/hooks/useAuth.ts` Auth Context（提供 user/session/signIn/signUp/signOut/loading）
  - [x] SubTask 8.3: `client/src/lib/api.ts` 封装 API 调用（fetch wrapper，自动带 Authorization header，错误处理）
  - [x] SubTask 8.4: `client/src/App.tsx` 包裹 AuthProvider + Router
  - [x] SubTask 8.5: 验证：Auth Context 能获取登录状态

- [x] Task 9: 路由 + 布局 + 导航
  - [x] SubTask 9.1: `client/src/App.tsx` 定义路由（/ /chat/:agentId /agents /agents/create /agents/:id/edit /forum /forum/topic/:id /studio /studio/script /studio/video /studio/image /studio/article /studio/game /studio/voice /profile /share/:slug /auth/login /auth/register /admin）
  - [x] SubTask 9.2: `client/src/components/layout/Layout.tsx` 主布局（顶栏导航 + 主内容区，金黄 logo，导航链接高亮当前页）
  - [x] SubTask 9.3: `client/src/components/layout/Navbar.tsx` 顶部导航栏（logo + 导航链接 + 登录/用户头像下拉）
  - [x] SubTask 9.4: `client/src/components/layout/ProtectedRoute.tsx` 路由守卫（未登录跳 /auth/login，带 redirect 参数）
  - [x] SubTask 9.5: 验证：路由切换正常，守卫生效

- [x] Task 10: 注册 + 登录页
  - [x] SubTask 10.1: `client/src/pages/auth/RegisterPage.tsx`（邮箱+密码+昵称，zod 校验，调 Supabase signUp，成功提示去邮箱确认）
  - [x] SubTask 10.2: `client/src/pages/auth/LoginPage.tsx`（邮箱+密码，调 Supabase signIn，成功跳转，失败友好提示）
  - [x] SubTask 10.3: 注册成功提示「请去邮箱点确认链接，确认后再登录」
  - [x] SubTask 10.4: 登录失败提示可能原因（未确认邮箱/密码错误）
  - [x] SubTask 10.5: 验证：注册→确认→登录→跳转首页 全流程

## 阶段四：主页 + 对话

- [x] Task 11: 主页
  - [x] SubTask 11.1: `client/src/pages/HomePage.tsx`（Hero 区 + 智能体卡片网格）
  - [x] SubTask 11.2: Hero 区（金黄渐变标题 + 副标题 + CTA 按钮「开始对话」）
  - [x] SubTask 11.3: 智能体卡片网格（17 个，CSS hover scale 动画，点击进对话）
  - [x] SubTask 11.4: 卡片含头像/名字/头衔/标签/口头禅
  - [x] SubTask 11.5: 验证：主页渲染 17 智能体，hover 动画流畅，零控制台错误

- [x] Task 12: 1v1 对话页（SSE 流式）
  - [x] SubTask 12.1: `client/src/pages/ChatPage.tsx`（获取 agent + 历史 messages，渲染 ChatWindow）
  - [x] SubTask 12.2: `client/src/components/chat/ChatWindow.tsx` 消息列表（用户靠右金黄/AI 靠左白底+头像）
  - [x] SubTask 12.3: SSE 流式接收：fetch /api/chat，ReadableStream reader 解析 event/data 行
  - [x] SubTask 12.4: **currentEvent 在 while 循环外部声明**（修复旧 bug）
  - [x] SubTask 12.5: token 追加 AI 气泡，done 设 isStreaming=false
  - [x] SubTask 12.6: 发新消息时 AbortController 取消旧流
  - [x] SubTask 12.7: 流式光标动画（AI 气泡底部闪烁竖线）
  - [x] SubTask 12.8: 输入框（textarea 自适应高度，Enter 发送，Shift+Enter 换行）
  - [x] SubTask 12.9: 自动滚动底部（用户手动上滑时不强制拉回）
  - [x] SubTask 12.10: 空状态（agent.tagline 欢迎语）
  - [x] SubTask 12.11: 收藏按钮 + 分享按钮
  - [x] SubTask 12.12: 验证：发消息→流式回复→无卡顿→零错误

- [x] Task 13: 对话 API（Express SSE）
  - [x] SubTask 13.1: `server/src/routes/chat.ts` POST /api/chat（鉴权→校验→封禁→敏感词→创建/获取对话→保存用户消息→拉历史→SSE 流式）
  - [x] SubTask 13.2: 事件格式：start/token/done/error
  - [x] SubTask 13.3: 流结束保存完整 AI 回复
  - [x] SubTask 13.4: req.on('close') 时 abort 上游请求
  - [x] SubTask 13.5: 验证：curl 看到 token 逐个推送

## 阶段五：论坛

- [x] Task 14: 论坛前端（流式 + Realtime + 插话）
  - [x] SubTask 14.1: `client/src/pages/ForumPage.tsx`（话题列表，搜索，新建话题按钮）
  - [x] SubTask 14.2: `client/src/pages/ForumTopicPage.tsx`（话题详情 + 帖子列表 + 回帖框）
  - [x] SubTask 14.3: SSE 流式接收 AI 回复（fetch /api/forum/create 或 /api/forum/reply-stream）
  - [x] SubTask 14.4: Supabase Realtime 订阅 forum_posts INSERT（其他用户实时看到新帖）
  - [x] SubTask 14.5: AI 生成中显示「正在打字…」动画（三个跳动圆点）
  - [x] SubTask 14.6: 用户输入框始终可用（不被 AI 生成阻塞）
  - [x] SubTask 14.7: 验证：发起话题→AI 流式回复→插话→实时同步

- [x] Task 15: 论坛 API（Express SSE）
  - [x] SubTask 15.1: `server/src/routes/forum.ts` GET /api/forum/topics（列表+分页）
  - [x] SubTask 15.2: POST /api/forum/create（SSE：创建话题→保存用户帖→流式推送各 AI 首条回复→保存）
  - [x] SubTask 15.3: POST /api/forum/reply-stream（SSE：保存回帖→流式推送 AI 回复+交叉讨论→保存）
  - [x] SubTask 15.4: AI 自发讨论（2+ AI 时 50% 概率互接梗）
  - [x] SubTask 15.5: 验证：发起话题后 AI 流式生成，多用户 Realtime 同步

## 阶段六：自定义智能体 + 广场

- [x] Task 16: 自定义智能体前端
  - [x] SubTask 16.1: `client/src/pages/AgentsSquarePage.tsx`（官方+公开自定义，搜索+筛选 tab）
  - [x] SubTask 16.2: `client/src/pages/CreateAgentPage.tsx`（表单：名称/描述/性格/systemPrompt/头像渐变6选1/可见性，zod 校验）
  - [x] SubTask 16.3: `client/src/pages/EditAgentPage.tsx`（仅创建者可访问，预填表单）
  - [x] SubTask 16.4: 智能体卡片（头像/名字/描述/创建者/收藏按钮，hover scale）
  - [x] SubTask 16.5: 验证：创建→广场可见→能对话

- [x] Task 17: 自定义智能体 API
  - [x] SubTask 17.1: `server/src/routes/agents.ts` POST /api/agents/create（鉴权→校验→插入 custom_agents）
  - [x] SubTask 17.2: GET /api/agents（列表，含官方+公开自定义）
  - [x] SubTask 17.3: GET /api/agents/:id（详情，含自定义智能体解析）
  - [x] SubTask 17.4: PUT /api/agents/:id（仅创建者可改）
  - [x] SubTask 17.5: DELETE /api/agents/:id（仅创建者可删）
  - [x] SubTask 17.6: 验证：CRUD 全流程，RLS 生效

## 阶段七：创意工坊

- [x] Task 18: 创意工坊首页 + API 基础
  - [x] SubTask 18.1: `client/src/pages/StudioPage.tsx`（6 功能入口卡片 + 我的作品列表）
  - [x] SubTask 18.2: `server/src/routes/studio.ts` 基础 CRUD（createCreativeWork/listCreativeWorks/getCreativeWorkById/updateCreativeWork）
  - [x] SubTask 18.3: 验证：作品 CRUD 正常

- [x] Task 19: 搞笑剧本 `/studio/script`
  - [x] SubTask 19.1: `client/src/pages/studio/ScriptStudioPage.tsx`（表单：主题/场景/角色多选/时长）
  - [x] SubTask 19.2: `server/src/routes/studio.ts` POST /api/studio/script（SSE 流式生成多角色剧本）
  - [x] SubTask 19.3: 剧本排版渲染（场景描述+角色对白高亮+舞台指示）
  - [x] SubTask 19.4: 复制/下载 txt/分享
  - [x] SubTask 19.5: agents 为空时有空状态提示
  - [x] SubTask 19.6: idle 状态有空状态占位
  - [x] SubTask 19.7: 验证：生成剧本完整含 3+ 反转

- [x] Task 20: 搞笑视频 `/studio/video`
  - [x] SubTask 20.1: `client/src/pages/studio/VideoStudioPage.tsx`（表单：主题/风格/时长）
  - [x] SubTask 20.2: `server/src/routes/studio.ts` POST /api/studio/video/create（提交 CogVideoX 异步任务）
  - [x] SubTask 20.3: GET /api/studio/video/status/:id（轮询任务状态）
  - [x] SubTask 20.4: 前端轮询 + 进度条 + 完成后 video 播放 + 下载
  - [x] SubTask 20.5: 失败重试 + 超时处理
  - [x] SubTask 20.6: 验证：真实生成 mp4 可播放下载

- [x] Task 21: 搞笑图片 `/studio/image`
  - [x] SubTask 21.1: `client/src/pages/studio/ImageStudioPage.tsx`（表单：描述/风格/数量 1-4）
  - [x] SubTask 21.2: `server/src/routes/studio.ts` POST /api/studio/image（调 CogView4 批量）
  - [x] SubTask 21.3: 画廊网格 + 点击放大 + 单独/全部下载 + 分享
  - [x] SubTask 21.4: 配字幕做表情包（输入字幕→合成图片）
  - [x] SubTask 21.5: 验证：真实生成图片可下载

- [x] Task 22: 搞笑文章 `/studio/article`
  - [x] SubTask 22.1: `client/src/pages/studio/ArticleStudioPage.tsx`（表单：主题/文体 5 种/字数）
  - [x] SubTask 22.2: `server/src/routes/studio.ts` POST /api/studio/article（SSE 流式生成结构化文章）
  - [x] SubTask 22.3: 富文本排版 + 金句卡片 + 一键生成配图（调 CogView4）
  - [x] SubTask 22.4: 复制/下载 md/分享
  - [x] SubTask 22.5: 验证：文章文体鲜明含 3+ 金句

- [x] Task 23: 搞笑游戏 `/studio/game`
  - [x] SubTask 23.1: `client/src/pages/studio/GameStudioPage.tsx`（4 种类型选择：文字冒险/海龟汤/情景选择/接梗大战）
  - [x] SubTask 23.2: `server/src/routes/studio.ts` POST /api/studio/game/start（开局生成剧情+选项）
  - [x] SubTask 23.3: POST /api/studio/game/choice（用户选选项→AI 生成下一段+新选项，多结局）
  - [x] SubTask 23.4: 存档/读档（game_saves 表）
  - [x] SubTask 23.5: 游戏界面（剧情文本+选项按钮+存档栏+结局回顾）
  - [x] SubTask 23.6: 验证：完整一局游戏可玩多结局

- [x] Task 24: 搞笑语音 `/studio/voice`
  - [x] SubTask 24.1: `client/src/pages/studio/VoiceStudioPage.tsx`（表单：文本/音色选择）
  - [x] SubTask 24.2: `server/src/routes/studio.ts` POST /api/studio/voice（调 CogTTS）
  - [x] SubTask 24.3: 在线播放 + 下载 mp3 + 分享
  - [x] SubTask 24.4: 验证：真实生成 mp3 可播放下载

## 阶段八：好玩功能 + 管理员

- [x] Task 25: 签到 + 收藏 + 分享
  - [x] SubTask 25.1: `client/src/components/CheckinCard.tsx`（签到按钮+积分+7 天日历，today 用 useState 延迟到 mount）
  - [x] SubTask 25.2: `server/src/routes/checkin.ts` POST /api/checkin（当日仅一次，积分+10，连续加成）
  - [x] SubTask 25.3: `client/src/components/FavoriteButton.tsx`（toggle 收藏，乐观更新）
  - [x] SubTask 25.4: `server/src/routes/favorite.ts` POST /api/favorite（toggle）
  - [x] SubTask 25.5: `server/src/routes/share.ts` POST /api/share（生成 slug）/ GET /api/share/:slug（只读）
  - [x] SubTask 25.6: `client/src/pages/SharePage.tsx`（只读对话页）
  - [x] SubTask 25.7: 验证：签到/收藏/分享全流程

- [x] Task 26: 个人中心
  - [x] SubTask 26.1: `client/src/pages/ProfilePage.tsx`（用户信息 + 签到卡片 + 积分 + 收藏列表 + 对话历史 + 我的作品）
  - [x] SubTask 26.2: 修改昵称功能
  - [x] SubTask 26.3: 验证：个人中心展示完整

- [x] Task 27: 管理员后台
  - [x] SubTask 27.1: `client/src/pages/AdminPage.tsx`（用户列表+封禁/解封+智能体管理+论坛管理+举报处理）
  - [x] SubTask 27.2: `server/src/routes/admin.ts`（admin 中间件保护，用户列表/封禁/举报列表/处理举报）
  - [x] SubTask 27.3: 验证：admin 可管理用户和内容

## 阶段九：端到端验证

- [x] Task 28: 端到端验证
  - [x] SubTask 28.1: webapp-testing 覆盖全流程（Playwright headless 冒烟测试 6 页面 + 登录失败路径，零控制台错误）
  - [~] SubTask 28.2: web-design-guidelines 审查所有页面（跳过：可选项目，本次重写以稳定 SSE/消除 hydration 为首要目标）
  - [x] SubTask 28.3: 修复发现的问题（server/package.json 添加 --env-file 加载 .env.local；根 package.json 重写移除 Next.js 依赖；旧 Next.js 进程残留清理）
  - [x] SubTask 28.4: 最终回归测试（client + server TypeScript 编译零错误；Playwright 冒烟测试零控制台错误、零 hydration error、零页面错误）
  - [x] SubTask 28.5: 旧代码清理（已删除：app/、components/、lib/、agents/、.next/、middleware.ts、next.config.mjs、next-env.d.ts、vercel.json、components.json、postcss.config.mjs、tailwind.config.ts、tsconfig.json、.eslintrc.json、tsconfig.tsbuildinfo；测试脚本与截图：.smoke_test.py、.smoke_login_test.py、smoke_*.png）

# Task Dependencies
- Task 1、2、3 并行（项目初始化+UI 组件+样式）
- Task 4 依赖 Task 1（shared 目录）
- Task 5、6、7 依赖 Task 4（后端核心库）
- Task 8 依赖 Task 5（前端 Supabase 客户端）
- Task 9 依赖 Task 8（路由+布局）
- Task 10 依赖 Task 9（注册登录页）
- Task 11 依赖 Task 9（主页）
- Task 12、13 依赖 Task 6、7（对话前端+API）
- Task 14、15 依赖 Task 6、7（论坛前端+API）
- Task 16、17 依赖 Task 5（自定义智能体前端+API）
- Task 18 依赖 Task 5（创意工坊基础）
- Task 19-24 依赖 Task 18（创意工坊子功能，可并行）
- Task 25 依赖 Task 5（签到/收藏/分享）
- Task 26 依赖 Task 25（个人中心）
- Task 27 依赖 Task 5（管理员）
- Task 28 依赖所有
