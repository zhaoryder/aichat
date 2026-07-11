# Checklist

## 项目初始化
- [x] `client/` Vite + React 项目创建，vite.config.ts 配置 proxy /api → localhost:3001
- [x] `server/` Express + TypeScript 项目创建，监听 3001，CORS 配置
- [x] `shared/` 目录创建，前后端共享类型
- [x] Tailwind CSS 配置，金黄主色 #F5B400
- [x] 根 package.json scripts：`dev` 用 concurrently 同时启动前后端
- [x] `npm run dev` 同时启动前后端，前端 localhost:5173 可访问

## UI 组件库（无 shadcn/ui 依赖）
- [x] Button（primary/ghost/outline/destructive 变体，金黄主题）
- [x] Card（hover scale 动画，CSS transition）
- [x] Input/Textarea（focus ring 金黄）
- [x] Dialog（CSS 动画进出，ESC 关闭，遮罩点击关闭）
- [x] Badge（金黄变体）
- [x] Spinner（纯 CSS 旋转）
- [x] EmptyState（图标+文案+可选 CTA，无空白框）
- [x] Avatar（首字母+渐变背景）
- [x] 所有组件零外部 UI 依赖

## 全局样式
- [x] CSS 变量定义（--color-primary: #F5B400）
- [x] 自定义动画 keyframes（fade-in/slide-up/bounce-dot/shimmer/pulse-cursor）
- [x] 滚动条样式（thin scrollbar）
- [x] 无 framer-motion 依赖

## 共享代码
- [x] 17 个智能体配置完整（7 原有 + 10 新增）
- [x] 每个 systemPrompt 含强制搞笑指令
- [x] 共享类型完整（Message/Conversation/Agent/Post/CustomAgent/CreativeWork/Checkin）
- [x] 前后端均可 import shared 模块

## 后端核心
- [x] 服务端 Supabase 客户端（service_role key）
- [x] 数据库查询函数封装完整（对话/消息/论坛/智能体/创意工坊/签到/收藏/分享/存档）
- [x] JWT 验证中间件（从 Authorization header 提取 Supabase JWT）
- [x] admin 中间件（检查 role === 'admin'）
- [x] AI 客户端：chatCompletionStream（AsyncGenerator）
- [x] AI 客户端：generateImage（CogView4）
- [x] AI 客户端：submitVideoTask + getVideoTaskResult（CogVideoX）
- [x] AI 客户端：generateSpeech（CogTTS）
- [x] SSE 工具函数（sendEvent/sseStream，正确 headers）
- [x] req.on('close') 时 abort 上游请求

## 前端核心
- [x] 浏览器端 Supabase 客户端（anon key）
- [x] useAuth hook（user/session/signIn/signUp/signOut）
- [x] API 调用封装（自动带 Authorization header）
- [x] 路由定义完整（所有页面路由）
- [x] Layout 布局（顶栏导航 + 主内容区）
- [x] Navbar（logo + 导航链接 + 登录/用户头像下拉）
- [x] ProtectedRoute 路由守卫（未登录跳登录页）
- [x] 注册页（zod 校验，成功提示去邮箱确认）
- [x] 登录页（失败提示可能原因）

## 主页 + 对话
- [x] Hero 区（金黄渐变标题 + CTA）
- [x] 17 个智能体卡片网格（CSS hover scale 动画）
- [x] 对话页消息列表（用户右金黄 / AI 左白底+头像）
- [x] SSE 流式接收：currentEvent 在 while 循环外部声明
- [x] token 追加 AI 气泡，done 设 isStreaming=false
- [x] 发新消息时 AbortController 取消旧流
- [x] 流式光标动画（闪烁竖线）
- [x] 输入框（textarea 自适应，Enter 发送，Shift+Enter 换行）
- [x] 自动滚动（用户上滑时不强制拉回）
- [x] 空状态（agent.tagline 欢迎语）
- [x] 收藏按钮 + 分享按钮
- [x] 对话 API（Express SSE）：start/token/done/error 事件
- [x] 流结束保存完整 AI 回复

## 论坛
- [x] 话题列表页（搜索+新建话题按钮）
- [x] 话题详情页（帖子列表+回帖框）
- [x] SSE 流式接收 AI 回复
- [x] Supabase Realtime 订阅 forum_posts INSERT
- [x] AI 生成中「正在打字…」动画
- [x] 用户输入框始终可用（不被 AI 生成阻塞）
- [x] 论坛 API：POST /api/forum/create（SSE 流式）
- [x] 论坛 API：POST /api/forum/reply-stream（SSE 流式 + 交叉讨论）
- [x] AI 自发讨论（2+ AI 时概率互接梗）

## 自定义智能体
- [x] 广场页（官方+公开自定义，搜索+筛选）
- [x] 创建页（表单+ zod 校验）
- [x] 编辑页（仅创建者可访问）
- [x] 智能体卡片（hover scale，收藏按钮）
- [x] CRUD API（create/list/get/update/delete）
- [x] 自定义智能体可对话

## 创意工坊
- [x] 首页（6 功能入口 + 我的作品列表）
- [x] 创意作品 CRUD API
- [x] 搞笑剧本（SSE 流式 + 多角色 + 3+ 反转 + 下载分享 + 空状态）
- [x] 搞笑视频（CogVideoX 异步 + 轮询 + 播放下载）
- [x] 搞笑图片（CogView4 批量 + 画廊 + 配字幕表情包）
- [x] 搞笑文章（SSE 流式 + 5 种文体 + 金句卡片 + 配图）
- [x] 搞笑游戏（4 种类型 + DM + 多结局 + 存档）
- [x] 搞笑语音（CogTTS + 播放下载分享）

## 好玩功能
- [x] 签到（当日仅一次，积分+10，连续加成，7 天日历）
- [x] today 在 CSR mount 后设置（避免 hydration 不一致）
- [x] 收藏（toggle，乐观更新，失败回滚）
- [x] 分享（生成 slug，只读页可访问）
- [x] 个人中心（信息+签到+积分+收藏+对话历史+作品）

## 管理员
- [x] 管理员后台页（用户列表+封禁+智能体管理+论坛管理+举报）
- [x] admin 中间件保护
- [x] zhaoryder@icloud.com 为 admin

## 端到端验证
- [x] webapp-testing 覆盖全流程（Playwright 冒烟测试 6 页面 + 登录路径）
- [~] web-design-guidelines 审查所有页面（可选，本次跳过）
- [x] 修复发现的问题（server env-file 加载 + 根 package.json 重写 + 旧进程清理）
- [x] 零控制台错误（Playwright 验证）
- [x] 零 hydration error（纯 CSR 无 SSR）
- [x] 零页面错误（Playwright 验证）
- [x] 发消息流式回复正常（ChatWindow SSE 已通过单独测试验证）
- [x] 旧代码清理（app/ components/ lib/ agents/ .next/ 已删除）
- [x] TypeScript 编译零错误（client + server tsc --noEmit 退出码 0）

## 关键 Bug 修复验证（对比旧版）
- [x] SSE currentEvent 在 while 循环外部声明（不丢 token）
- [x] 无 SSR/CSR 不一致（纯 CSR）
- [x] 无 Date.now() 在 render 中直接调用导致 hydration mismatch
- [x] 无 framer-motion 导致的动画卡顿
- [x] 无 shadcn/ui 依赖问题
- [x] 登录失败有友好提示（未确认邮箱/密码错误）
