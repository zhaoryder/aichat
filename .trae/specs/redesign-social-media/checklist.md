# Checklist

## 数据库
- [x] posts / follows / likes / comments / notifications 五张表已创建
- [x] 所有新表有 RLS 策略（用户可 CRUD 自己的数据，可读公开数据）
- [x] posts 表的 type 字段支持 text / conversation_share / project_share / image_share / repost
- [ ] **待执行**：在 Supabase SQL Editor 运行 `upgrade-social.sql` 迁移

## 后端 API
- [x] `GET /api/feed` 返回混合信息流（关注 + 推荐），分页正常
- [x] `GET /api/feed/explore` 返回探索页内容（热门动态 + 项目 + 智能体）
- [x] `POST /api/posts` 可发布动态，支持不同 type
- [x] `GET /api/posts/:id` 返回动态详情
- [x] `DELETE /api/posts/:id` 仅作者本人可删除
- [x] `GET /api/posts/user/:userId` 返回用户主页动态列表
- [x] `POST /api/follow/:targetId` 关注 / 取关用户正常
- [x] `POST /api/follow/agent/:agentId` 关注 / 取关智能体正常
- [x] `POST /api/likes/:postId` 点赞 / 取消点赞正常
- [x] `POST /api/comments` 发表评论正常
- [x] `GET /api/comments/:postId` 返回评论列表
- [x] `POST /api/posts/:id/repost` 转发正常
- [x] `GET /api/notifications` 返回通知列表 + 未读数
- [x] `PATCH /api/notifications/read` 标记已读正常

## 前端布局
- [x] 桌面端左侧 Sidebar 固定导航，包含 6 个入口
- [x] 移动端底部 Tab Bar 导航，包含 5 个入口
- [x] 桌面端右侧推荐栏展示热门智能体 / 推荐用户 / 热门话题
- [x] 品牌名已从「AI 搞笑工坊」改为「AI Lab」
- [x] Layout.tsx 使用三栏布局（Sidebar + 主内容 + 右侧推荐栏）
- [x] 移动端右侧推荐栏隐藏

## 信息流首页
- [x] 登录用户看到关注 + 推荐混合信息流
- [x] 未登录用户看到热门公开流 + 登录引导条
- [x] PostCard 支持渲染 text / conversation_share / project_share / image_share 四种类型
- [x] PostCard 显示作者头像 / 昵称 / 时间 / 内容 / 互动栏（点赞 / 评论 / 转发）
- [x] PostComposer 发布框可输入文本发布动态
- [x] 无限滚动加载正常

## 探索页
- [x] 4 个 Tab（热门动态 / Vibe Code 项目 / 智能体 / 创作者）切换正常
- [x] 热门动态 Tab 调用 explore API
- [x] Vibe Code 项目 Tab 展示公开项目
- [x] 智能体 Tab 复用广场列表
- [x] 创作者 Tab 展示推荐用户

## 创作者社交主页
- [x] Banner + 头像 + 昵称 + 简介布局正常
- [x] 关注 / 粉丝数显示正确
- [x] 关注按钮可切换状态
- [x] 动态 Tab 展示用户发布的动态
- [x] 项目 Tab 展示 Vibe Code 项目和 Studio 作品（使用 result.url 作缩略图）
- [x] 收藏 Tab 保留收藏智能体列表（Set<string> 转数组遍历）
- [x] 创建的智能体 Tab 占位（开发中）

## 通知中心
- [x] 通知列表按时间倒序
- [x] 未读通知有视觉区分
- [x] Sidebar 通知角标显示未读数
- [x] 点击通知跳转到对应页面
- [x] 标记已读功能正常

## 分享整合
- [x] ChatWindow 对话页分享按钮创建 conversation_share Post（含对话预览 + agentId 元数据）
- [x] VibeCodePage 分享按钮创建 project_share Post（含代码 + 标题 + 描述）
- [x] Studio 作品页分享按钮创建 image_share Post（每张图独立分享，含 url + prompt + style）

## 路由
- [x] 新增 `/explore`、`/notifications`、`/post/:id` 路由
- [x] 原 `/gallery`、`/prompts`、`/ai-feed` 整合到探索页 Tab 或保留独立路由
- [x] 所有 Layout 页面使用新 Sidebar 布局

## 深色模式
- [x] Sidebar / BottomTabBar 深色模式适配
- [x] PostCard / PostComposer 深色模式适配
- [x] 探索页 / 通知页深色模式适配
- [x] 新 ProfilePage 深色模式适配
- [x] RightSidebar 深色模式适配

## TypeScript / 构建
- [x] `tsc --noEmit` 通过无错误
- [x] 前端 `vite build` 成功（2.46MB / gzip 806KB）
- [x] 后端 `esbuild` 构建成功（1.6MB）

## 部署（待执行）
- [ ] 提交代码到 GitHub
- [ ] Railway 后端自动部署
- [ ] Cloudflare Pages 前端部署
- [ ] 在 Supabase SQL Editor 执行 `upgrade-social.sql` 迁移
