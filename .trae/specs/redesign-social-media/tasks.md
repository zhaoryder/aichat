# Tasks

## Phase 1: 数据库与后端 API

- [x] Task 1: 创建数据库表结构
  - [x] SubTask 1.1: 创建 `posts` 表（id, user_id, type, content, metadata, parent_id, repost_of, created_at）
  - [x] SubTask 1.2: 创建 `follows` 表（follower_id, followee_id, followee_type, created_at）
  - [x] SubTask 1.3: 创建 `likes` 表（user_id, post_id, created_at）
  - [x] SubTask 1.4: 创建 `comments` 表（id, post_id, user_id, content, created_at）
  - [x] SubTask 1.5: 创建 `notifications` 表（id, user_id, type, actor_id, target_id, target_type, read, created_at）
  - [x] SubTask 1.6: 为所有新表添加 RLS 策略

- [x] Task 2: 后端动态（Post）API
  - [x] SubTask 2.1: `GET /api/feed` — 首页信息流（关注 + 推荐，分页）
  - [x] SubTask 2.2: `GET /api/feed/explore` — 探索页内容（热门动态 + 项目 + 智能体）
  - [x] SubTask 2.3: `POST /api/posts` — 发布动态
  - [x] SubTask 2.4: `GET /api/posts/:id` — 动态详情
  - [x] SubTask 2.5: `DELETE /api/posts/:id` — 删除动态
  - [x] SubTask 2.6: `GET /api/posts/user/:userId` — 用户主页动态列表

- [x] Task 3: 后端关注 / 互动 API
  - [x] SubTask 3.1: `POST /api/follow/:targetId` — 关注 / 取关用户
  - [x] SubTask 3.2: `POST /api/follow/agent/:agentId` — 关注 / 取关智能体
  - [x] SubTask 3.3: `GET /api/follow/followers/:userId` — 粉丝列表
  - [x] SubTask 3.4: `GET /api/follow/following/:userId` — 关注列表
  - [x] SubTask 3.5: `POST /api/likes/:postId` — 点赞 / 取消点赞
  - [x] SubTask 3.6: `POST /api/comments` — 发表评论
  - [x] SubTask 3.7: `GET /api/comments/:postId` — 评论列表
  - [x] SubTask 3.8: `POST /api/posts/:id/repost` — 转发

- [x] Task 4: 后端通知 API
  - [x] SubTask 4.1: `GET /api/notifications` — 通知列表（分页，含未读数）
  - [x] SubTask 4.2: `PATCH /api/notifications/read` — 标记已读

## Phase 2: 前端布局重构

- [x] Task 5: Sidebar 布局组件
  - [x] SubTask 5.1: 创建 `Sidebar.tsx`（桌面端左侧导航：首页、探索、对话、创意工坊、通知、个人主页）
  - [x] SubTask 5.2: 创建 `BottomTabBar.tsx`（移动端底部导航：首页、探索、发布、通知、我的）
  - [x] SubTask 5.3: 创建 `RightSidebar.tsx`（桌面端右侧推荐栏：热门智能体、推荐用户、热门话题）
  - [x] SubTask 5.4: 重写 `Layout.tsx` 为三栏布局（左 Sidebar + 主内容 + 右推荐栏）
  - [x] SubTask 5.5: 更新品牌名「AI 搞笑工坊」→「AI Lab」

- [x] Task 6: 信息流首页
  - [x] SubTask 6.1: 重写 `HomePage.tsx` 为信息流布局
  - [x] SubTask 6.2: 创建 `PostCard.tsx` 动态卡片组件（支持 text / conversation_share / project_share / image_share 类型）
  - [x] SubTask 6.3: 创建 `PostComposer.tsx` 发布框组件（顶部发布框）
  - [x] SubTask 6.4: 实现无限滚动加载（IntersectionObserver）
  - [x] SubTask 6.5: 未登录用户展示热门公开流 + 登录引导条

- [x] Task 7: 探索页
  - [x] SubTask 7.1: 创建 `ExplorePage.tsx`，Tab 分区：热门动态、Vibe Code 项目、智能体、创作者
  - [x] SubTask 7.2: 热门动态 Tab 调用 `/api/feed/explore`
  - [x] SubTask 7.3: Vibe Code 项目 Tab 复用 `exploreVibeProjects` API
  - [x] SubTask 7.4: 智能体 Tab 复用智能体广场列表
  - [x] SubTask 7.5: 创作者 Tab 展示推荐用户列表

## Phase 3: 社交功能

- [x] Task 8: 创作者社交主页
  - [x] SubTask 8.1: 重写 `ProfilePageV3.tsx` 为社交主页布局（Banner + 头像 + 简介 + 关注/粉丝数 + 关注按钮）
  - [x] SubTask 8.2: 动态 Tab：调用 `/api/posts/user/:userId` 展示用户发布的动态
  - [x] SubTask 8.3: 项目 Tab：展示 Vibe Code 项目和 Studio 作品
  - [x] SubTask 8.4: 收藏 Tab：保留收藏智能体列表
  - [x] SubTask 8.5: 创建的智能体 Tab：展示用户创建的自定义智能体

- [x] Task 9: 通知中心
  - [x] SubTask 9.1: 创建 `NotificationsPage.tsx`，通知列表（新粉丝 / 点赞 / 评论 / 转发 / 系统）
  - [x] SubTask 9.2: Sidebar 通知角标（未读数）
  - [x] SubTask 9.3: 点击通知跳转到对应动态 / 主页

- [ ] Task 10: 分享功能整合（下一阶段实现）
  - [ ] SubTask 10.1: ChatWindow 对话页"分享"按钮 → 创建 conversation_share 类型 Post
  - [ ] SubTask 10.2: VibeCodePage"分享到社区"按钮 → 创建 project_share 类型 Post
  - [ ] SubTask 10.3: Studio 作品页"分享"按钮 → 创建 image_share Post

## Phase 4: 路由与收尾

- [x] Task 11: 路由更新
  - [x] SubTask 11.1: 更新 `App.tsx` 路由（新增 `/explore`、`/notifications`、`/post/:id`）
  - [x] SubTask 11.2: 原 `/gallery`、`/prompts`、`/ai-feed` 等页面整合到探索页 Tab
  - [x] SubTask 11.3: 移除旧 Navbar 引用，所有 Layout 页面使用新 Sidebar 布局

- [x] Task 12: 深色模式适配
  - [x] SubTask 12.1: Sidebar 组件深色模式
  - [x] SubTask 12.2: PostCard / PostComposer 深色模式
  - [x] SubTask 12.3: 探索页 / 通知页深色模式
  - [x] SubTask 12.4: 新 ProfilePage 深色模式

## Phase 5: 构建与部署

- [x] Task 13: 修复 TypeScript 编译错误
  - [x] SubTask 13.1: 修复 `@/shared/agents` → `@shared/agents` 路径别名
  - [x] SubTask 13.2: 修复 `user.nickname` → `profile?.nickname`（useAuth hook 返回结构）
  - [x] SubTask 13.3: 修复 `favorites` Set 类型用法（`favorites.size` 和 `[...favorites]`）
  - [x] SubTask 13.4: 移除 `CreativeWork.thumbnail_url` 引用（使用 result.url 替代）
  - [x] SubTask 13.5: 清理未使用的 import
- [x] Task 14: 前后端构建验证
  - [x] SubTask 14.1: 前端 `tsc --noEmit` 通过无错误
  - [x] SubTask 14.2: 前端 `vite build` 成功（2.46MB / gzip 806KB）
  - [x] SubTask 14.3: 后端 `esbuild` 构建成功（1.6MB）
- [ ] Task 15: 部署
  - [ ] SubTask 15.1: 提交代码到 GitHub
  - [ ] SubTask 15.2: Railway 后端自动部署
  - [ ] SubTask 15.3: Cloudflare Pages 前端部署
  - [ ] SubTask 15.4: 在 Supabase SQL Editor 执行 `upgrade-social.sql` 迁移

# Task Dependencies
- [Task 6] depends on [Task 5]（信息流需要 Sidebar 布局）
- [Task 7] depends on [Task 5]（探索页需要 Sidebar 布局）
- [Task 8] depends on [Task 2]（主页动态需要 Post API）
- [Task 9] depends on [Task 4]（通知页需要通知 API）
- [Task 10] depends on [Task 2]（分享需要 Post API）
- [Task 11] depends on [Task 5] [Task 6] [Task 7] [Task 8] [Task 9]（路由更新依赖所有新页面）
- [Task 12] depends on [Task 11]（深色模式在所有新组件完成后统一适配）
- [Task 13] depends on [Task 11] [Task 12]（构建前需所有代码就绪）
- [Task 14] depends on [Task 13]（构建依赖类型修正）
- [Task 15] depends on [Task 14]（部署依赖构建成功）
