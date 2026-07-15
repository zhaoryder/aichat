# 社媒化改版：AI 开发者社区 Spec

## Why
当前产品定位为"AI 搞笑工坊"——纯娱乐向的 AI 角色对话平台，首页是 Hero 落地页 + 智能体卡片，功能散落在顶部 Navbar + "探索"下拉菜单中。用户需要将其改造为**社媒式平台**：以信息流为核心，面向开发者和 AI 创作者，普通用户也能消费内容和使用基础功能。

## What Changes
- **首页重构**：Hero 落地页 → 信息流首页（类似 Twitter/X + Dev.to），展示混合内容流
- **导航重构**：顶部 Navbar → 左侧 Sidebar（社媒式布局），桌面端固定左侧导航 + 右侧推荐栏
- **个人主页重构**：从趣味主页 → 创作者社交主页（作品展示 + 关注/粉丝 + 活动时间线）
- **内容动态系统**：新增"动态"（Post）概念，统一聚合 AI 对话分享、Vibe Code 项目、提示词、AI 生成作品
- **关注系统**：用户可关注其他用户、关注智能体
- **互动系统**：点赞、评论、转发
- **通知中心**：新粉丝、评论、点赞通知
- **品牌调整**：从"AI 搞笑工坊" → "AI Lab"（开发者社区感），保留娱乐性但弱化纯搞笑定位
- 智能体广场、创意工坊、联机房间等功能保留，但从主导航降级为 Sidebar 子入口

## Impact
- Affected specs: upgrade-v3-leisure, build-ai-chat-platform
- Affected code:
  - `client/src/App.tsx`（路由重构）
  - `client/src/pages/HomePage.tsx`（完全重写为信息流）
  - `client/src/components/layout/`（Navbar → Sidebar 布局）
  - `client/src/pages/ProfilePageV3.tsx`（重写为社交主页）
  - 新增 `client/src/pages/FeedPage.tsx`（信息流）
  - 新增 `client/src/pages/ExplorePage.tsx`（探索/发现页）
  - 新增 `client/src/pages/NotificationsPage.tsx`（通知中心）
  - 新增 `client/src/components/Sidebar.tsx`（左侧导航）
  - 新增 `client/src/components/RightSidebar.tsx`（右侧推荐栏）
  - 新增 `client/src/components/PostCard.tsx`（动态卡片）
  - 新增 `client/src/components/PostComposer.tsx`（发布动态）
  - 后端新增 `server/src/routes/feed.ts`、`server/src/routes/follow.ts`、`server/src/routes/post.ts`
  - 数据库新增 `posts`、`follows`、`likes`、`comments`、`notifications` 表

## ADDED Requirements

### Requirement: 信息流首页
系统 SHALL 提供基于信息流的首页，登录用户看到关注者动态 + 推荐内容的混合流，未登录用户看到热门公开内容。

#### Scenario: 登录用户查看首页
- **WHEN** 用户已登录并访问首页 `/`
- **THEN** 显示信息流，包含关注的用户和智能体的动态、推荐 AI 作品、热门 Vibe Code 项目
- **AND** 信息流按时间倒序排列，支持无限滚动加载

#### Scenario: 未登录用户查看首页
- **WHEN** 未登录用户访问首页 `/`
- **THEN** 显示热门公开动态流 + 登录引导
- **AND** 可浏览内容但互动时引导登录

### Requirement: 社媒式侧边栏导航
系统 SHALL 使用左侧固定侧边栏作为主导航，替代当前的顶部 Navbar。

#### Scenario: 桌面端导航
- **WHEN** 用户在桌面端访问任意页面
- **THEN** 左侧显示固定 Sidebar，包含：首页（信息流）、探索、对话、创意工坊、通知、个人主页
- **AND** 右侧显示推荐栏（热门智能体、推荐用户、热门话题）

#### Scenario: 移动端导航
- **WHEN** 用户在移动端访问
- **THEN** 底部 Tab Bar 导航（首页、探索、发布、通知、我的）

### Requirement: 动态发布系统
系统 SHALL 允许用户发布动态（Post），支持纯文本、分享 AI 对话片段、分享 Vibe Code 项目、分享 AI 生成作品。

#### Scenario: 发布纯文本动态
- **WHEN** 用户在发布框输入文本并点击发布
- **THEN** 创建一条 Post，显示在首页信息流和个人主页中
- **AND** 关注该用户的用户可在信息流中看到此动态

#### Scenario: 分享 AI 对话片段
- **WHEN** 用户在对话页点击"分享"，选择部分对话内容
- **THEN** 创建一条 Post，类型为 `conversation_share`，展示对话气泡预览卡片

#### Scenario: 分享 Vibe Code 项目
- **WHEN** 用户在 Vibe Code 页面点击"分享到社区"
- **THEN** 创建一条 Post，类型为 `project_share`，展示项目预览（截图/标题/描述）+ 可运行链接

### Requirement: 关注系统
系统 SHALL 允许用户关注其他用户和智能体。

#### Scenario: 关注用户
- **WHEN** 用户点击某创作者主页的"关注"按钮
- **THEN** 建立关注关系，该创作者的动态出现在关注者的首页信息流中
- **AND** 被关注者收到新粉丝通知

#### Scenario: 关注智能体
- **WHEN** 用户在智能体卡片上点击"关注"
- **THEN** 该智能体的新对话分享和活动出现在用户信息流中

### Requirement: 互动系统
系统 SHALL 允许用户对动态进行点赞、评论和转发。

#### Scenario: 点赞动态
- **WHEN** 用户点击动态卡片的爱心图标
- **THEN** 切换点赞状态，点赞数实时更新，动态作者收到点赞通知

#### Scenario: 评论动态
- **WHEN** 用户在动态卡片下输入评论并发送
- **THEN** 评论显示在动态下方，动态作者收到评论通知

#### Scenario: 转发动态
- **WHEN** 用户点击动态卡片的转发图标
- **THEN** 创建一条转发 Post，引用原动态，显示在转发者的个人主页和信息流中

### Requirement: 通知中心
系统 SHALL 提供通知中心，集中展示新粉丝、点赞、评论、系统通知。

#### Scenario: 查看通知
- **WHEN** 用户点击 Sidebar 的"通知"入口
- **THEN** 显示通知列表，按时间倒序，区分已读/未读
- **AND** 未读通知数显示为 Sidebar 角标

### Requirement: 探索页
系统 SHALL 提供探索页面，展示热门内容、推荐创作者、热门智能体。

#### Scenario: 浏览探索页
- **WHEN** 用户访问探索页 `/explore`
- **THEN** 显示分区内容：热门动态、推荐 Vibe Code 项目、热门提示词、热门智能体、推荐创作者
- **AND** 支持按 Tab 切换分区

### Requirement: 创作者社交主页
系统 SHALL 将个人主页重构为创作者社交主页。

#### Scenario: 查看创作者主页
- **WHEN** 用户访问 `/profile/:userId`
- **THEN** 显示：头像 + 昵称 + 简介 + 关注/粉丝数 + 关注按钮
- **AND** Tab 切换：动态、项目、收藏、创建的智能体
- **AND** 动态 Tab 显示该用户发布的所有 Post
- **AND** 项目 Tab 显示 Vibe Code 项目和 Studio 作品

## MODIFIED Requirements

### Requirement: 首页
原首页为 Hero 落地页 + 智能体网格。修改为信息流首页，Sidebar 布局，信息流为主内容区。

### Requirement: 导航
原顶部 Navbar 布局。修改为左侧 Sidebar（桌面端）+ 底部 Tab Bar（移动端）。

### Requirement: 个人主页
原趣味个人主页（装扮徽章 + 作品网格 + 收藏）。修改为创作者社交主页（动态时间线 + 关注/粉丝 + 作品 Tab）。

### Requirement: 品牌定位
原"AI 搞笑工坊"（纯娱乐向）。修改为"AI Lab"（开发者社区），保留娱乐性但提升技术/创作属性。

## REMOVED Requirements

### Requirement: Hero 落地页
**Reason**: 社媒平台首页应以信息流为主，不再需要 Hero 落地页
**Migration**: 原 Hero 内容（品牌介绍 + CTA）整合到未登录用户的顶部引导条

### Requirement: 顶部 Navbar 下拉菜单
**Reason**: 社媒布局使用 Sidebar，"探索"下拉菜单被探索页替代
**Migration**: 各功能入口迁移到 Sidebar 和探索页
