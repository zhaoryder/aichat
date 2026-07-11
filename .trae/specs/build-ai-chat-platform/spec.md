# AI 智能体对话平台 Spec

## Why
用户希望拥有一个可以与历史名人、明星、科学家等 AI 智能体幽默对话的 Web 平台，并通过 AI 论坛让多个智能体交叉讨论各类话题，用户也能参与其中，形成有梗、有趣、有内容的社区生态。

## What Changes
- 新建 Next.js 14 (App Router) 全栈项目作为基础框架
- 接入 Agnes 免费大模型 API（OpenAI 兼容协议）作为 AI 能力底座
- 接入 Supabase 免费版作为数据库 + 账户系统（PostgreSQL + Auth + Realtime）
- 实现 7 位预设 AI 智能体：孔子、牛顿、爱因斯坦、C罗、野兽先生（MrBeast）、周杰伦、梅西
- 实现 1v1 对话功能（用户 ↔ 单个 AI 智能体）
- 实现 AI 论坛功能（多智能体 + 用户共同发帖/回帖讨论）
- 实现账户系统（注册/登录/个人中心）
- 实现审核系统（关键词过滤 + 用户举报 + 管理员后台）
- 实现金黄主题色的现代美观 UI/UX 设计
- 聊天风格融入网络热梗、幽默搞笑表达
- **每日定时从网络搜索最新热梗**，存入数据库并动态注入 AI 智能体的 system_prompt，保证梗不落伍

## Impact
- Affected specs: 无（全新项目）
- Affected code: 全新代码库，主要目录结构：
  - `app/` - Next.js App Router 路由与页面
  - `components/` - React 组件
  - `lib/` - 工具函数、AI 客户端、Supabase 客户端
  - `agents/` - AI 智能体人格配置
  - `scripts/` - 数据库初始化脚本
  - `supabase/` - Supabase schema 与迁移

## 技术选型

### 前端
- **框架**: Next.js 14 (App Router) + TypeScript
- **样式**: Tailwind CSS + shadcn/ui
- **状态**: React Query (服务端状态) + Zustand (客户端状态)
- **图标**: lucide-react
- **动效**: Framer Motion（满足用户偏好的细腻悬停动画：scale 1.02-1.05、shadow 模糊增加 2-4px、过渡 0.3-0.5s ease-out）

### 后端
- **运行时**: Next.js API Routes (Edge/Node runtime)
- **AI API**: Agnes 免费模型（OpenAI 兼容协议）
  - Endpoint: `https://api.agnes.ai/v1/chat/completions`（待实现时确认）
  - Key: `sk-Xv54PA4B7PNE7fR2NYQs72UwO7w9gyu68wM5iqtdSBvw0j2I`
- **数据库**: Supabase 免费版（PostgreSQL 500MB + Auth + Realtime）
  - 表：users（profile）、agents、conversations、messages、forum_topics、forum_posts、reports、moderation_keywords、trending_memes
  - RLS（Row Level Security）策略保障数据安全

### 账户系统
- Supabase Auth（邮箱+密码 / OAuth 可选扩展）
- 用户资料表扩展：nickname、avatar_url、role(user/admin)、banned_until

### 审核系统
- 关键词黑名单表 + 正则匹配
- 用户举报机制（举报帖子/消息/用户）
- 管理员后台（查看举报、封禁用户、删除内容、维护关键词）

### 每日热梗采集系统
- **调度**: Vercel Cron Jobs（每日凌晨 03:00 触发 `/api/cron/fetch-memes`）
- **采集源**:
  - DuckDuckGo 搜索"今日网络热词 最新梗 热搜梗"等关键词
  - 解析搜索结果摘要，提取候选梗词
  - 备选：微博热搜页（HTML 抓取）、知乎热榜（如有公开 API）
- **存储**: `trending_memes` 表（content、source、fetched_at、is_active、used_count）
- **去重**: 与最近 30 天历史梗比对，避免重复入库
- **失效策略**: 旧梗 `is_active=false`（默认保留 7 天活跃），AI 仅引用活跃梗
- **注入**: AI 客户端调用前从 DB 拉取当前活跃梗列表，拼接到 system_prompt 末尾，提示"可自然融入以下当下热梗"

## UI/UX 设计规范

### 色彩系统
- **主色（金黄色）**: `#F5B400`（用于按钮、强调、品牌色）
- **深金色**: `#D49700`（hover/active 状态）
- **浅金色背景**: `#FFF8E1`
- **背景**: `#FAFAFA`（浅色模式）/ `#1A1A1A`（深色模式）
- **文字**: `#1F1F1F` / `#FFFFFF`
- **辅助色**: 暖灰 `#737373`、成功绿 `#22C55E`、危险红 `#EF4444`

### 视觉风格
- 现代、美观、耐看
- 圆角统一 `rounded-2xl`（卡片）/ `rounded-xl`（按钮）
- 阴影柔和：`shadow-md` 默认，`shadow-xl` hover
- 悬停动画：scale 1.02-1.05、shadow 模糊 +2-4px、过渡 0.3-0.5s ease-out
- 卡片式布局、留白充足、信息层级清晰
- AI 智能体头像采用风格化插画（首字母 + 渐变背景）

### 主页结构
1. Hero 区：平台名 + slogan + CTA 按钮
2. AI 智能体卡片网格（头像、名字、一句话介绍、对话入口）
3. 论坛热门话题预览
4. 功能特性介绍区
5. 页脚

## AI 智能体人格设计

每个智能体配置包含：
- `id`: 唯一标识
- `name`: 显示名
- `avatar`: 头像（渐变背景 + 字母）
- `era` / `title`: 时代/身份标签
- `tagline`: 一句话介绍
- `system_prompt`: 系统提示词（含幽默风格、热梗、人物特色）
- `topics`: 擅长话题

### 预设智能体
1. **孔子** - 儒家大佬，用文言+网络梗混搭讲道理
2. **牛顿** - 苹果受害者，物理学家，傲娇毒舌
3. **爱因斯坦** - 相对论祖师爷，飘逸发型，深邃幽默
4. **C罗** - 自信足球男神，"SIUUU"口头禅
5. **野兽先生（MrBeast）** - 撒钱狂魔，"今天我要..."开场
6. **周杰伦** - 周董，歌词接梗，奶茶爱好者
7. **梅西** - 谦逊球王，话少但精

## 聊天风格规范
- 融入**每日更新的网络热梗**（由热梗采集系统每日从网络搜索并入库，AI 调用时动态注入 system_prompt）
- 同时保留经典梗作为兜底（如：栓Q、芭比Q、绝绝子、emo、破防、上大分、下头、YYDS、家人们谁懂啊）
- 适度自嘲、玩梗、不冒犯
- 每个智能体保持人格特色（如 C罗 必带"SIUUU"，野兽先生必"今天我要花掉一百万"）
- 不输出违法违规、色情暴力、人身攻击内容
- 中文为主，必要时夹杂英文梗

## ADDED Requirements

### Requirement: 用户与 AI 智能体 1v1 对话
系统 SHALL 提供用户与单个 AI 智能体进行多轮对话的能力。

#### Scenario: 用户发送消息
- **WHEN** 用户在对话页输入消息并发送
- **THEN** 消息保存到数据库，调用 Agnes API 生成 AI 回复，回复带人格特色与热梗，并保存到数据库
- **AND** UI 流式/逐字显示 AI 回复

#### Scenario: 历史对话恢复
- **WHEN** 用户重新打开已有对话
- **THEN** 系统从数据库加载历史消息并按时间顺序展示

#### Scenario: 未登录访问
- **WHEN** 未登录用户尝试发起对话
- **THEN** 系统引导至登录页

### Requirement: AI 论坛功能
系统 SHALL 提供论坛，让多个 AI 智能体与用户共同发帖、回帖讨论。

#### Scenario: 用户发起新话题
- **WHEN** 登录用户在论坛创建新话题（标题、内容、@提及的 AI 智能体）
- **THEN** 话题保存到数据库，被 @的 AI 智能体在 1-3 秒内生成首条回复

#### Scenario: AI 智能体交叉讨论
- **WHEN** 话题中存在多个 AI 智能体被 @或随机参与
- **THEN** 不同智能体按人格生成回复，形成讨论氛围

#### Scenario: 用户回帖
- **WHEN** 用户在话题下回复
- **THEN** 回复保存，相关 AI 智能体可能被触发产生新回复

### Requirement: 账户系统
系统 SHALL 提供用户注册、登录、个人中心功能。

#### Scenario: 注册
- **WHEN** 用户提交邮箱、密码、昵称
- **THEN** Supabase Auth 创建账户，users 表插入 profile，跳转登录

#### Scenario: 登录
- **WHEN** 用户提交邮箱密码
- **THEN** 验证成功后建立 session，跳转主页

#### Scenario: 个人中心
- **WHEN** 用户进入个人中心
- **THEN** 显示头像、昵称、对话历史列表、论坛发帖历史

### Requirement: 审核系统
系统 SHALL 提供内容审核与管理员后台。

#### Scenario: 关键词过滤
- **WHEN** 用户提交内容（消息/帖子/回复）含黑名单关键词
- **THEN** 拦截提交并提示"内容包含敏感词，请修改"

#### Scenario: 用户举报
- **WHEN** 用户举报某条内容
- **THEN** 创建举报记录，状态为 pending

#### Scenario: 管理员处理
- **WHEN** 管理员在后台查看举报
- **THEN** 可执行：忽略 / 删除内容 / 封禁用户（设置 banned_until）

#### Scenario: 封禁用户访问
- **WHEN** 被封禁用户尝试发帖或对话
- **THEN** 拒绝并提示"账号已被封禁至 XXXX-XX-XX"

### Requirement: 现代美观的主页
系统 SHALL 提供金黄色主题、现代美观的主页。

#### Scenario: 访客访问主页
- **WHEN** 访客打开首页
- **THEN** 看到 Hero 区、AI 智能体卡片网格、论坛热门预览、特性介绍、页脚
- **AND** 卡片悬停时有 scale + shadow 动画

### Requirement: AI 智能体人格保持
系统 SHALL 通过 system_prompt 让每个智能体保持人格特色与幽默风格。

#### Scenario: 智能体回复
- **WHEN** AI 智能体生成回复
- **THEN** 回复符合该智能体的 system_prompt，融入热梗，不偏离人格

### Requirement: 每日网络热梗采集与动态注入
系统 SHALL 每日定时从网络搜索最新网络热梗，存入数据库，并在 AI 生成回复时将当前活跃热梗动态注入 system_prompt，保证梗的新鲜度。

#### Scenario: 定时采集触发
- **WHEN** 每日凌晨 03:00（北京时间）Cron 触发 `/api/cron/fetch-memes`
- **THEN** 系统调用搜索引擎查询"今日网络热词 / 最新梗 / 热搜梗"，解析结果提取候选梗词，与最近 30 天历史比对去重后存入 `trending_memes` 表（is_active=true）

#### Scenario: 旧梗失效
- **WHEN** `trending_memes` 记录的 `fetched_at` 超过 7 天
- **THEN** 系统将其 `is_active` 置为 false，AI 不再引用

#### Scenario: AI 调用注入
- **WHEN** AI 客户端构造请求调用 Agnes API
- **THEN** 从 DB 拉取所有 `is_active=true` 的热梗列表，拼接到该智能体 system_prompt 末尾，提示"可自然融入以下当下热梗（不要堆砌）"
- **AND** 每次调用后递增该梗的 `used_count`

#### Scenario: 采集失败容错
- **WHEN** 搜索源不可用或解析失败
- **THEN** 不影响 AI 主流程，沿用上一次成功采集的活跃梗
