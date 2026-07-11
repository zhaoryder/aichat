# 数据库初始化指南

本文档说明如何为 **AI 智能体对话平台** 初始化 Supabase 数据库。整个流程预计 5-10 分钟。

---

## 1. 注册 Supabase 账号并创建项目

1. 打开 [https://supabase.com](https://supabase.com)，使用 GitHub 或邮箱注册账号。
2. 登录后进入 Dashboard，点击 **New Project**。
3. 填写项目信息：
   - **Name**：例如 `aichat`
   - **Database Password**：设置一个强密码并妥善保存（仅用于数据库直连，前端不会用到）
   - **Region**：选择离用户最近的区域（中国大陆用户可优先选 `Southeast Asia (Singapore)`）
4. 等待 1-2 分钟，项目创建完成后进入 Dashboard。

---

## 2. 执行 SQL 脚本

进入项目的 **SQL Editor**（左侧菜单），按以下顺序依次执行：

### 2.1 执行 schema.sql（建表 + RLS）

1. 点击 **New query**。
2. 打开项目根目录的 `supabase/schema.sql`，**全选复制**内容粘贴到查询窗口。
3. 点击 **Run**（或 `Ctrl/Cmd + Enter`）。
4. 应看到 `Success. No rows returned.` 提示，且下方 Messages 区无报错。

该脚本将：
- 创建 9 张表：`profiles`、`agents`、`conversations`、`messages`、`forum_topics`、`forum_posts`、`reports`、`moderation_keywords`、`trending_memes`
- 为所有表启用 Row Level Security（RLS）
- 创建辅助函数 `is_admin()` 用于判定管理员身份
- 为每张表配置对应的 RLS 策略（用户只能 CRUD 自己的数据，论坛公开可读，管理员全权等）

### 2.2 执行 seed.sql（预置数据）

1. 再次点击 **New query** 新建查询。
2. 打开项目根目录的 `supabase/seed.sql`，**全选复制**内容粘贴到查询窗口。
3. 点击 **Run**。
4. 该脚本将插入：
   - 7 个 AI 智能体（confucius、newton、einstein、cr7、mrbeast、jaychou、messi），含完整 system_prompt 与渐变头像配色
   - 20 个初始审核关键词（占位词，可后续在管理后台维护）
   - 15 条兜底经典热梗（`source='seed'`，`is_active=true`）

> 如果在执行 schema.sql 时已修改过结构，再次执行 seed.sql 可能产生重复数据。脚本中已使用 `ON CONFLICT DO NOTHING` 兜底，可重复执行。

---

## 3. 获取 API 密钥

进入项目 **Settings → API**（左侧菜单底部），找到以下三组信息：

| 名称 | 说明 | 用途 |
| --- | --- | --- |
| **Project URL** | 形如 `https://xxxxxxxxxxxxx.supabase.co` | 前后端客户端连接地址 |
| **anon public key** | 公开密钥，可暴露给浏览器 | 前端 anon 访问（受 RLS 保护） |
| **service_role key** | 服务端密钥，**绝对不能泄露到前端** | 服务端绕过 RLS 做管理操作 |

> ⚠️ `service_role key` 拥有完全数据库访问权限且会绕过 RLS，请勿提交到 Git 仓库或写入任何客户端可见代码（如 `NEXT_PUBLIC_*` 前缀的环境变量）。

---

## 4. 配置本地环境变量

将上一步获取的值填入项目根目录的 `.env.local`（参考 `.env.local.example`）：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Agnes AI
AGNES_API_KEY=your-agnes-api-key
AGNES_API_BASE=https://api.agnes.ai/v1

# Cron
CRON_SECRET=your-cron-secret
```

> `.env.local` 已在 `.gitignore` 中，不会被提交。

---

## 5. 关于 trending_memes 表的写入说明

`trending_memes` 表的 RLS 策略如下：

- **SELECT**：任何人可读（公开查询当前活跃热梗）
- **INSERT / UPDATE / DELETE**：仅 `is_admin()` 管理员可操作

实际项目中，**每日热梗的采集与入库**由服务端 API Route `/api/cron/fetch-memes`（配合 Vercel Cron）完成：

- 服务端调用时使用 **service_role key** 创建 Supabase 客户端
- service_role 会**自动绕过 RLS**，因此可直接执行 `INSERT` / `UPDATE`
- 这样设计的好处：前端 anon 用户无法篡改热梗数据，只能读取

如果你希望在本地测试热梗写入，可以使用 Supabase Dashboard → SQL Editor 直接执行 INSERT 语句（SQL Editor 默认使用 service_role 身份）。

---

## 6. 验证

执行完上述步骤后，可在 Supabase Dashboard → **Table Editor** 中检查：

- `agents` 表应包含 7 行记录
- `moderation_keywords` 表应包含 20 行记录
- `trending_memes` 表应包含 15 行记录

至此数据库初始化完成，可启动前端项目进行后续开发与联调：

```bash
npm run dev
```
