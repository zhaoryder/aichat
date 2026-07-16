# Tasks — Agent 超级大升级

> 分 5 个 Batch，每个 Batch 可独立交付并验证。建议按顺序执行，B/C/D 有依赖关系。

---

## Batch A：Skill 市场后端 + 前端市场页

- [x] Task A1：数据库迁移 `upgrade-skills.sql`
  - [x] A1.1 创建 `skills` 表（id, name, slug, description, category, manifest JSONB, author_id, version, status, install_count, created_at）
  - [x] A1.2 创建 `user_skills` 表（user_id, skill_id, enabled, config JSONB, installed_at, PK(user_id, skill_id)）
  - [x] A1.3 RLS：skills 表 publicly readable（status='published'）；user_skills 仅本人可读写
  - [x] A1.4 索引：skills.slug 唯一、skills.category、user_skills.user_id
  - [x] A1.5 Seed 内置 skills：`builtin.web-search` / `builtin.image-gen` / `builtin.video-gen` / `builtin.code-exec` / `builtin.bash`（占位，实际由前端 WebContainer 实现）/ `builtin.file-io` / `builtin.memory`

- [x] Task A2：共享类型 `shared/types.ts`
  - [x] A2.1 新增 `Skill`、`SkillManifest`（name, description, tools, systemPrompt）、`UserSkill` 类型
  - [x] A2.2 新增 `SkillCategory = 'search' | 'media' | 'code' | 'data' | 'utility' | 'custom'`

- [x] Task A3：后端 skill 注册表 `server/src/lib/skill-registry.ts`
  - [x] A3.1 `listInstalledSkills(userId)` → 返回 enabled skills
  - [x] A3.2 `loadSkillTools(userId)` → 聚合所有 enabled skill 的工具，返回 Vercel AI SDK tools 格式
  - [x] A3.3 `loadSkillSystemPrompt(userId)` → 拼接所有 skill 的 systemPrompt 片段
  - [x] A3.4 内置 skill 工具实现（从 `vibe-tools.ts` 抽取）

- [x] Task A4：后端 API `server/src/routes/skills.ts`
  - [x] A4.1 `GET /api/skills` 列表（支持 `?category=` 筛选、`?q=` 搜索、分页）
  - [x] A4.2 `GET /api/skills/:slug` 详情
  - [x] A4.3 `POST /api/skills` 发布新 skill（仅登录用户，status='pending'）
  - [x] A4.4 `POST /api/skills/:id/install` 安装到当前用户
  - [x] A4.5 `DELETE /api/skills/:id/install` 卸载
  - [x] A4.6 `POST /api/skills/:id/enable` + `DELETE /api/skills/:id/enable` 启用/禁用
  - [x] A4.7 `GET /api/users/me/skills` 我的已安装 skill
  - [x] A4.8 管理员 `POST /api/admin/skills/:id/publish` 审核

- [x] Task A5：前端 SkillsMarketPage `/skills`
  - [x] A5.1 路由注册 `client/src/App.tsx`
  - [x] A5.2 卡片瀑布流布局（复用 PostCard 样式）+ 分类 tabs + 搜索框
  - [x] A5.3 卡片显示：名称、描述、作者、安装数、版本、安装/启用 toggle
  - [x] A5.4 已安装置顶 + "我的"过滤
  - [x] A5.5 toast 提示安装成功/失败

- [x] Task A6：前端 SkillStudioPage `/skills/create`
  - [x] A6.1 用 AI 帮用户写 skill manifest（聊天界面）
  - [x] A6.2 实时预览工具签名
  - [x] A6.3 发布按钮（调 `POST /api/skills`）

- [x] Task A7：Sidebar 集成入口
  - [x] A7.1 在 `client/src/components/layout/Sidebar.tsx` 添加 "Skill 市场" 入口

- [x] Task A8：vibe-code 集成 skill 加载
  - [x] A8.1 `/stream` 端点改用 `loadSkillTools(userId)` 替代硬编码 `vibeCodeTools`
  - [x] A8.2 system prompt 拼接 `loadSkillSystemPrompt(userId)`

**验证**：能浏览市场、安装 skill、在 Vibe Coding 中调用 skill 提供的工具

---

## Batch B：Plan Mode 规划执行

- [x] Task B1：数据库迁移 `upgrade-plans.sql`
  - [x] B1.1 `plans` 表（id, user_id, project_id, goal, steps JSONB, current_step, status, mode, created_at, updated_at）
  - [x] B1.2 RLS：仅本人可读写
  - [x] B1.3 索引：plans.user_id、plans.status

- [x] Task B2：共享类型 `shared/types.ts`
  - [x] B2.1 新增 `Plan`、`PlanStep`（id, title, type, status, agent_role, result, started_at, completed_at）
  - [x] B2.2 `PlanStepType = 'code' | 'design' | 'test' | 'research' | 'deploy'`
  - [x] B2.3 `PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed'`

- [x] Task B3：后端 plan 生成 `server/src/lib/agents/planner.ts`
  - [x] B3.1 `generatePlan(goal, context)` → 调用 Agnes 返回结构化 steps
  - [x] B3.2 使用 `openai.chat` + JSON mode（response_format: json_object）
  - [x] B3.3 Prompt 模板：要求输出 `{ goal, steps: [{id, title, type, estimated_minutes}] }`

- [x] Task B4：后端 API `server/src/routes/plans.ts`
  - [x] B4.1 `POST /api/vibe-code/plan` 生成 plan（保存到 plans 表）
  - [x] B4.2 `GET /api/plans/:id` 查询
  - [x] B4.3 `PATCH /api/plans/:id` 编辑 steps
  - [x] B4.4 `POST /api/plans/:id/execute` 流式执行（SSE，按 step 推进）
  - [x] B4.5 `POST /api/plans/:id/pause` 暂停
  - [x] B4.6 `POST /api/plans/:id/skip/:stepId` 跳过某步

- [x] Task B5：后端 vibe-code `/stream` 改造支持 mode
  - [x] B5.1 请求体新增 `mode: 'single' | 'plan' | 'team'`，默认 `single`
  - [x] B5.2 `mode='plan'` 时先调 `generatePlan` 返回 plan 事件，等待客户端确认
  - [x] B5.3 接收 `planId` 参数时按 plan steps 流式执行

- [x] Task B6：前端 PlanPanel 组件
  - [x] B6.1 新增 `client/src/components/PlanPanel.tsx`
  - [x] B6.2 step 列表显示：序号 + 标题 + 类型图标 + 状态徽章
  - [x] B6.3 当前 step 高亮 + 进度条
  - [x] B6.4 编辑模式：拖拽排序、删除、追加 step
  - [x] B6.5 "开始执行" / "暂停" / "跳过此步" 按钮

- [x] Task B7：VibeCodePage 集成 Plan Mode
  - [x] B7.1 顶部添加 "Plan Mode" 开关（与 Teamwork 开关并列）
  - [x] B7.2 启用时，左侧消息流上方显示 PlanPanel
  - [x] B7.3 SSE `plan` 事件 → PlanPanel 渲染
  - [x] B7.4 SSE `step_start` / `step_done` 事件 → 更新 step 状态

**验证**：开启 Plan Mode，发送"做一个贪吃蛇"，能看到 5 步 plan 并按步执行

---

## Batch C：AI Teamwork 多角色协作

- [x] Task C1：数据库迁移 `upgrade-team.sql`
  - [x] C1.1 `team_sessions` 表（id, user_id, plan_id, roles JSONB, current_role, status, transcript JSONB, created_at）
  - [x] C1.2 RLS：仅本人可读写
  - [x] C1.3 索引：team_sessions.user_id

- [x] Task C2：共享类型 `shared/types.ts`
  - [x] C2.1 新增 `TeamRole = 'leader' | 'planner' | 'coder' | 'executor' | 'reviewer' | 'reporter'`
  - [x] C2.2 `TeamSession`、`TeamMessage`（role, content, timestamp, agent_role）
  - [x] C2.3 `TeamConfig`（roles: TeamRole[], leader_model, member_model）

- [x] Task C3：后端角色实现 `server/src/lib/agents/roles/`
  - [x] C3.1 `leader.ts`：拆解任务、分配、汇总（system prompt + 工具集）
  - [x] C3.2 `planner.ts`：复用 Batch B planner，作为团队成员时输出更细
  - [x] C3.3 `coder.ts`：纯写代码（writeFile / bash 工具）
  - [x] C3.4 `executor.ts`：跑 bash 命令、跑测试、捕获错误
  - [x] C3.5 `reviewer.ts`：输出结构化评分 JSON（security / maintainability / performance + issues）
  - [x] C3.6 `reporter.ts`：汇总阶段进度、向用户输出最终总结

- [x] Task C4：后端 team orchestrator `server/src/lib/agents/team-orchestrator.ts`
  - [x] C4.1 `startTeamSession(userId, goal, config)` 创建 session
  - [x] C4.2 `runTeamStep(sessionId)` 异步状态机：Leader → Planner → Coder → Executor → Reviewer → Reporter
  - [x] C4.3 SSE 推流：每条事件带 `role` 字段
  - [x] C4.4 失败处理：Executor 报错 → 回到 Coder 修复（最多 3 轮）

- [x] Task C5：后端 API `server/src/routes/team.ts`
  - [x] C5.1 `POST /api/team/start` 创建会话
  - [x] C5.2 `POST /api/team/:id/message` 发送用户消息
  - [x] C5.3 `GET /api/team/:id/stream` SSE 流
  - [x] C5.4 `POST /api/team/:id/stop` 停止

- [x] Task C6：前端 TeamToggle 组件
  - [x] C6.1 新增 `client/src/components/TeamToggle.tsx`
  - [x] C6.2 开关 + 角色选择（多选 chips，默认 Leader + Coder）
  - [x] C6.3 显示团队配置摘要

- [x] Task C7：前端消息流显示角色徽章
  - [x] C7.1 修改 `AssistantMessage` 组件，根据 `message.role` 显示角色徽章（颜色 + 图标）
  - [x] C7.2 角色配色：Leader 紫 / Planner 蓝 / Coder 绿 / Executor 橙 / Reviewer 红 / Reporter 灰
  - [x] C7.3 多角色接力时按时间线展开（类似 git log）

- [x] Task C8：前端 Review 卡片 + 雷达图
  - [x] C8.1 新增 `client/src/components/CodeReviewCard.tsx`
  - [x] C8.2 显示三维度评分（雷达图，使用 recharts）
  - [x] C8.3 显示 issues 列表 + 严重程度标签

- [x] Task C9：VibeCodePage 集成 Teamwork
  - [x] C9.1 顶部添加 TeamToggle（与 Plan Mode 并列）
  - [x] C9.2 启用时 `mode='team'` 发送 `/stream`
  - [x] C9.3 SSE `role` 事件 → 渲染角色徽章

**验证**：启用 Teamwork（全 6 角色），发送"做一个 Todo App"，能看到 6 个角色接力输出，最后有评分卡片

---

## Batch D：WebContainer 沙箱

- [x] Task D1：安装依赖
  - [x] D1.1 `@webcontainer/api`（核心）
  - [x] D1.2 `xterm` + `xterm-addon-fit`（Terminal）
  - [x] D1.3 `@xterm/xterm`（新包名）+ `@xterm/addon-fit`
  - [x] D1.4 `react-arborist`（File Tree 虚拟滚动）

- [x] Task D2：WebContainerSandbox 组件 `client/src/components/WebContainerSandbox.tsx`
  - [x] D2.1 `boot()` 异步初始化（loading 状态 + 错误降级提示）
  - [x] D2.2 挂载到 React ref，全局单例
  - [x] D2.3 初始项目模板：package.json + index.html + src/index.js
  - [x] D2.4 `mountFiles(files)` 写入文件树
  - [x] D2.5 `runCommand(cmd)` 执行 shell，返回 stdout/stderr
  - [x] D2.6 `startDevServer()` 启动 dev server，返回 url
  - [x] D2.7 Cross-origin isolation 配置：Cloudflare Pages 需配置 COOP/COEP headers（在 `functions/_middleware.ts` 中加）

- [x] Task D3：Terminal 组件 `client/src/components/Terminal.tsx`
  - [x] D3.1 xterm.js 集成
  - [x] D3.2 用户输入 → WebContainer shell
  - [x] D3.3 输出流式显示
  - [x] D3.4 历史命令（↑↓ 切换）

- [x] Task D4：FileTree 组件 `client/src/components/FileTree.tsx`
  - [x] D4.1 react-arborist 集成
  - [x] D4.2 显示 WebContainer 根目录文件树
  - [x] D4.3 点击文件 → 在 CodeArea 显示内容
  - [x] D4.4 新建/删除/重命名文件按钮

- [x] Task D5：前端 bash 工具桥接
  - [x] D5.1 新增 `client/src/lib/webcontainer-tools.ts`
  - [x] D5.2 `bash` / `writeFile` / `readFile` / `listFiles` / `install` 工具实现（本地执行，不经过后端）
  - [x] D5.3 SSE 流中 `tool_call` 事件若 name 在 webcontainer-tools 中，由前端执行 + 注入 `tool_result` 事件

- [x] Task D6：VibeCodePage 集成沙箱
  - [x] D6.1 三栏布局：左 chat / 中 file tree + code / 右 preview + terminal
  - [x] D6.2 iframe srcDoc 改为 dev server URL（WebContainer 启动后）
  - [x] D6.3 Terminal 底部抽屉（可折叠）
  - [x] D6.4 降级：WebContainer boot 失败 → 显示提示 + 回退 srcDoc

- [x] Task D7：Cloudflare Pages COOP/COEP 配置
  - [x] D7.1 修改 `client/functions/api/_middleware.ts` 添加 headers
  - [x] D7.2 或在 `client/public/_headers` 文件配置

- [x] Task D8：Sandbox Snapshot 分享
  - [x] D8.1 新增 `sandbox_snapshots` 表
  - [x] D8.2 前端打包 WebContainer 文件为 zip 上传到 Supabase Storage
  - [x] D8.3 `/share/sandbox/:id` 只读分享页

**验证**：在 Vibe Coding 发送"创建 React 项目并跑 npm run dev"，能看到 Terminal 显示 npm install 输出，右侧 iframe 加载 dev server URL

---

## Batch E：自研增强功能

- [x] Task E1：Agent Memory 长期记忆
  - [x] E1.1 数据库 `agent_memory` 表（id, user_id, key, value, source, created_at）
  - [x] E1.2 `save_memory` / `recall_memory` / `list_memory` 工具
  - [x] E1.3 对话开始时自动注入 memory 摘要到 system prompt
  - [x] E1.4 前端 `/settings/memory` 页面查看/删除 memory

- [x] Task E2：Tool Builder AI 造工具
  - [x] E2.1 `build_tool` 工具实现：name + description + implementation（JS 代码）
  - [x] E2.2 工具实现走 `new Function()` 沙箱（带超时 + 限制 API）
  - [x] E2.3 造出的工具立即注册到 skill `user.dynamic-tools`
  - [x] E2.4 用户可在 `/skills` 看到"AI 创建的"标签

- [x] Task E3：Agent Personality Profile
  - [x] E3.1 `shared/agents/*.ts` 每个 agent 增加 `personality` 字段（MBTI, skills[], languages[]）
  - [x] E3.2 `/agents/:id` 详情页显示 personality 卡片（MBTI 配色 + 技能矩阵）
  - [x] E3.3 Vibe Coding 选 agent 时显示其 personality

- [x] Task E4：版本号升级 4.0.0
  - [x] E4.1 `client/package.json` version → 4.0.0
  - [x] E4.2 `server/package.json` version → 4.0.0
  - [x] E4.3 首页底部显示版本号

---

# Task Dependencies

- **Batch A**（Skill 市场）：独立，可最先执行
- **Batch B**（Plan Mode）：依赖 A 的 skill 注册表（plan tool 作为 builtin skill）
- **Batch C**（Teamwork）：依赖 B 的 plan 结构（团队围绕 plan 协作）
- **Batch D**（WebContainer）：依赖 A 的 skill（bash 工具作为 builtin skill）；与 B/C 解耦，可并行
- **Batch E**（增强）：E1 依赖 A；E2 依赖 A + D；E3 独立；E4 最后
- **并行建议**：A → (B + D 并行) → C → E

---

# 实施原则

1. 每个 Batch 完成后必须本地端到端验证 + 部署到生产
2. 严格遵循 project_memory 中的约束：
   - AI 调用使用 Agnes API（agnes-2.0-flash 文本 / agnes-image-2.1-flash 图像）
   - Cloudflare Pages + Railway + Supabase 部署链路
   - 不要删除已有的关键约束（如视频端点单数 video）
3. 新增的数据库表必须配 RLS
4. 前端必须支持暗色模式 + 移动端响应式
5. UI/UX 遵循用户偏好：卡片式布局、细腻动画（scale 1.02-1.05、阴影、ease-out 0.3-0.5s）
6. 不使用子编码代理时由 sub-agent 实现，但每个 Task 必须有明确的验收标准
