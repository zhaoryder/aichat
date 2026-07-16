# Checklist — Agent 超级大升级

> 验收清单：所有 checkbox 勾选后视为本次 spec 完整交付。

---

## Batch A：Skill 市场

- [ ] `upgrade-skills.sql` 可在 Supabase SQL Editor 成功执行，无错误
- [ ] `skills` 表存在，且 7 个内置 skill 已 seed（查询 `SELECT slug FROM skills;` 返回 7 行）
- [ ] `user_skills` 表存在，RLS 配置正确（anon 用户无法读写）
- [ ] `GET /api/skills` 返回 status=200，body 含 `skills` 数组
- [ ] 登录后 `POST /api/skills/:id/install` 返回 200，数据库 `user_skills` 新增记录
- [ ] `DELETE /api/skills/:id/install` 返回 200，记录被删除
- [ ] `POST /api/skills/:id/enable` 与 `DELETE` 配对工作，`enabled` 字段正确切换
- [x] `/skills` 页面可访问，显示卡片瀑布流
- [ ] 点击"安装"后 toast 显示成功，卡片状态变为"已安装"
- [ ] 启用/禁用 toggle 工作正常
- [x] `/skills/create` 页面可用 AI 生成 skill manifest 并发布
- [x] Sidebar 显示"Skill 市场"入口
- [x] Vibe Coding `/stream` 端点实际加载用户已启用 skill 的工具（日志确认）
- [ ] 安装 `builtin.web-search` skill 后，对话中 AI 能调用 webSearch 工具

## Batch B：Plan Mode

- [ ] `upgrade-plans.sql` 执行成功
- [ ] `plans` 表存在，RLS 配置正确
- [ ] `POST /api/vibe-code/plan` 返回结构化 plan（含 steps 数组）
- [ ] `GET /api/plans/:id` 返回 plan 详情
- [ ] `PATCH /api/plans/:id` 可编辑 steps（拖拽顺序、删除、追加）
- [ ] `POST /api/plans/:id/execute` 返回 SSE 流，按 step 推进
- [ ] `POST /api/plans/:id/pause` 可暂停
- [ ] `POST /api/plans/:id/skip/:stepId` 可跳过某步
- [ ] VibeCodePage 顶部有 "Plan Mode" 开关
- [ ] 开启 Plan Mode 后，发送需求 → Plan Panel 显示 steps
- [ ] step 状态实时更新：pending → in_progress → completed
- [ ] 用户可拖拽排序 step
- [ ] "开始执行"按钮触发流式执行
- [ ] "暂停" / "跳过此步" 按钮工作正常
- [ ] 关闭 Plan Mode 后，回到普通流式生成

## Batch C：AI Teamwork

- [ ] `upgrade-team.sql` 执行成功
- [ ] `team_sessions` 表存在，RLS 配置正确
- [ ] 6 个角色文件存在（`leader.ts` / `planner.ts` / `coder.ts` / `executor.ts` / `reviewer.ts` / `reporter.ts`）
- [ ] `POST /api/team/start` 返回 session_id
- [ ] `GET /api/team/:id/stream` 返回 SSE 流，每条事件带 `role` 字段
- [ ] TeamToggle 组件显示开关 + 角色选择 chips
- [ ] 默认选中 Leader + Coder
- [ ] 全 6 角色启用时，对话中能看到接力输出
- [ ] 每条 AI 消息显示角色徽章（正确颜色 + 图标）
- [ ] 角色配色：Leader 紫 / Planner 蓝 / Coder 绿 / Executor 橙 / Reviewer 红 / Reporter 灰
- [ ] Reviewer 输出结构化评分 JSON
- [ ] CodeReviewCard 显示三维度评分 + 雷达图
- [ ] 评分 < 60 时自动触发 Coder 修复
- [ ] 关闭 Teamwork 后回到单 agent 模式

## Batch D：WebContainer 沙箱

- [x] `@webcontainer/api` + `@xterm/xterm` + `react-arborist` 已安装
- [x] Cloudflare Pages 配置了 COOP/COEP headers（`functions/api/_middleware.ts` 或 `public/_headers`）
- [x] WebContainerSandbox 组件可成功 `boot()`（代码已实现：`static isSupported()` + `boot()` + 错误回调）
- [x] 首次进入 VibeCoding 显示 loading，boot 成功后显示沙箱（VibeCodePage boot useEffect + webcontainerReady state）
- [x] 旧浏览器（不支持 SharedArrayBuffer）显示降级提示并回退 srcDoc（sandboxError banner + srcDoc fallback）
- [x] Terminal 组件可输入命令并显示输出（xterm.js + 暗色主题 + 历史命令 + Ctrl+C/L）
- [x] AI 调用 `bash` 工具时，命令在 WebContainer 中执行（FRONTEND_TOOLS 拦截 + executeFrontendTool）
- [x] stdout/stderr 实时流回 Terminal（runCommand 读取 output 流）
- [x] FileTree 显示沙箱文件树（react-arborist + listFilesRecursive + 跳过 node_modules）
- [x] 点击文件在 CodeArea 显示内容（onFileSelect 回调）
- [x] 新建/删除/重命名文件按钮工作（FileTree 顶部工具栏 + handleCreateFile/handleDelete/handleRename）
- [x] AI 跑 `npm run dev` 后，iframe 加载 dev server URL（而非 srcDoc）（PreviewArea 优先 devServerUrl）
- [x] 文件变更时 HMR 自动生效（dev server 自带 HMR；writeFile 后自动尝试启动 dev server）
- [x] 降级模式：WebContainer 失败时 srcDoc + vm 仍可用（PreviewArea 双路径降级）
- [x] Sandbox Snapshot 可保存到 Supabase Storage（POST /api/sandbox/snapshot + upgrade-sandbox.sql）
- [x] `/share/sandbox/:id` 可访问只读分享页（GET /api/sandbox/:slug + SandboxSharePage.tsx + 路由注册）

## Batch E：自研增强

- [x] `agent_memory` 表存在，RLS 配置正确
- [x] Agent 在对话中说"我喜欢 X"后，自动调用 `save_memory`
- [x] 新对话开始时 system prompt 注入 memory 摘要
- [x] `/settings/memory` 页面可查看/删除 memory
- [x] `build_tool` 工具可让 AI 造新工具
- [x] 造出的工具立即可用（同一对话中调用）
- [x] `/skills` 中"AI 创建的"skill 显示标签
- [x] 每个 agent 的 `personality` 字段已填充
- [x] `/agents/:id` 显示 personality 卡片（MBTI + 技能矩阵）
- [x] Vibe Coding 选 agent 时显示 personality
- [x] `client/package.json` version = 4.0.0
- [x] `server/package.json` version = 4.0.0
- [x] 首页底部显示 v4.0.0

---

## 全局验收

- [x] `npx tsc --noEmit` 在 client 和 server 两端都通过
- [x] `npm run build` 在 client 端通过
- [ ] 代码已 push 到 `origin/main`，Railway 后端自动部署成功
- [ ] 前端已 `wrangler pages deploy` 到 Cloudflare Pages
- [ ] 生产环境端到端测试：
  - [ ] 首页正常加载
  - [ ] /skills 市场可访问
  - [ ] Vibe Coding 普通 mode 工作
  - [ ] Vibe Coding + Plan Mode 工作
  - [ ] Vibe Coding + Teamwork 工作
  - [ ] Vibe Coding + WebContainer 沙箱工作
  - [ ] AI 消息 markdown 正确渲染
  - [ ] 停止生成按钮工作
  - [ ] 输入框发送后清空
- [ ] 无控制台错误（开发者工具）
- [ ] 移动端响应式正常
- [ ] 暗色模式正常
