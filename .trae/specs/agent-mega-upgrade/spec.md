# Agent 超级大升级 Spec：Skill 市场 + Plan Mode + AI Teamwork + WebContainer 沙箱

> **范围**：对 Vibe Coding Agent 及普通对话 Agent 进行重度升级，引入 Skill 市场插件化、Plan Mode 规划执行、AI Teamwork 多角色协作、WebContainer 浏览器内完整 bash 沙箱，以及若干自研增强功能。
>
> **目标用户**：在 https://aichat-dgl.pages.dev 上使用 Vibe Coding 的所有登录用户。
>
> **版本**：aichat `4.0.0`（从 3.0.0 升级）。

---

## Why

当前 Agent 存在四大短板：
1. **能力固定**：工具写死在 `vibe-tools.ts`，无法让用户自由组合 / 扩展；
2. **无规划**：AI 直接写代码，复杂需求容易走偏，用户无法干预；
3. **单兵作战**：单个 agent 既要想又要做还要查，质量不可控；
4. **沙箱残缺**：仅用 `vm.createContext` 跑纯计算，不能 `npm install`、不能跑 Node、不能 `git init`，AI 想做真实项目时束手束脚。

本次升级把 Agent 从"流式代码生成器"升级为"可规划、可协作、可装插件、可在浏览器内跑 bash 的完整 AI 工程团队"。

---

## What Changes

### 一、Skill 市场（插件化 Agent）
- 新增 `skills` 表：官方/社区/用户自建 skill 的元数据仓库
- 新增 `user_skills` 表：用户安装与启用状态
- **BREAKING**：`vibe-tools.ts` 中 `webSearch / generateImage / generateVideo / executeCode` 抽取为内置 skill（`builtin.web-search` / `builtin.image-gen` / `builtin.video-gen` / `builtin.code-exec`）
- 新增 `POST /api/skills`、`GET /api/skills`、`POST /api/skills/:id/install`、`DELETE /api/skills/:id/install`、`POST /api/skills/:id/enable` 等 API
- 新增前端 `/skills` 市场页（卡片瀑布流 + 分类筛选 + 一键安装）
- 新增 `SkillStudioPage`：用户用 AI 帮自己写新 skill 并发布

### 二、Plan Mode（规划先行）
- 新增 `plans` 表：保存 plan + steps + 执行状态
- Plan 数据结构：
  ```json
  {
    "goal": "做一个贪吃蛇游戏",
    "steps": [
      { "id": 1, "title": "创建 HTML 骨架", "type": "code", "status": "pending" },
      { "id": 2, "title": "实现蛇的移动", "type": "code", "status": "pending" },
      { "id": 3, "title": "添加食物与碰撞检测", "type": "code", "status": "pending" },
      { "id": 4, "title": "美化 UI + 计分", "type": "design", "status": "pending" },
      { "id": 5, "title": "本地测试与修复", "type": "test", "status": "pending" }
    ]
  }
  ```
- 新增 API：`POST /api/vibe-code/plan`（生成 plan）、`GET /api/plans/:id`、`POST /api/plans/:id/execute`（按 step 执行）
- 前端 VibeCodePage 新增 **Plan Panel**：左侧消息流上方显示 step 列表，AI 执行时高亮当前 step，已完成打勾
- 用户可编辑 plan（拖拽排序、删除 step、追加 step）

### 三、AI Teamwork（多角色协作，可开关）
- 6 个内置角色：
  - **Leader**：拆解任务、分配给其他角色、汇总结果
  - **Planner**：细化步骤、估时、识别依赖
  - **Coder**：写代码（调用 writeFile / bash 工具）
  - **Executor**：在沙箱中运行代码、跑测试、捕获错误
  - **Reviewer**：审查代码（安全 / 可维护 / 性能）、提改进意见
  - **Reporter**：向用户汇报阶段进度、总结
- 用户可在 VibeCoding 顶部开关 Teamwork，可自定义启用哪些角色（默认 Leader + Coder）
- 实现：使用 async/await 状态机 + SSE 接力流（每个角色输出 `role: 'leader' | 'planner' | ...` 事件）
- 新增 `team_sessions` 表：保存协作会话、当前角色、完整 transcript
- 新增 API：`POST /api/team/start`、`POST /api/team/:id/message`、`GET /api/team/:id/stream`
- 前端消息流中每个 AI 消息显示角色徽章（颜色 + 图标），多角色接力时按时间线展开

### 四、WebContainer 沙箱（浏览器内完整 bash）
- **方案选型**：采用 **StackBlitz WebContainer API**（开源、免费、无需后端容器、支持 Node.js + npm + git）
- 备选：WebVM（wasmer）— 性能更强但体积大，作为 v4.1 备选
- 在 VibeCoding 页面挂载 WebContainer 实例，首次进入时 `boot()` + 初始化基础项目（package.json + index.html）
- 新增前端工具（通过 `postMessage` 桥接，由 WebContainer 在浏览器内执行，不经过后端）：
  - `bash(command)`：执行任意 shell 命令（ls / cd / mkdir / npm / git / node / python-wasi 等）
  - `writeFile(path, content)`：写入文件（实际写入 WebContainer）
  - `readFile(path)`：读取文件
  - `listFiles(path)`：列目录
  - `install(pkg)`：`npm install`
- 新增 **Terminal 组件**（基于 xterm.js）：显示 bash 输出，用户也可手动输入命令
- 新增 **File Tree 组件**：左侧显示沙箱内文件结构，点击切换查看
- 与现有 iframe 预览打通：AI 跑 `npm run dev` → WebContainer 提供 dev server URL → iframe 加载该 URL（替代旧的 srcDoc 方案）
- **降级方案**：WebContainer 不可用时（如旧浏览器），fallback 到旧的 srcDoc + Node `vm` 沙箱

### 五、自研增强功能（额外发明）
1. **Agent Memory**（长期记忆）：新增 `agent_memory` 表，agent 记住用户偏好、历史决策、技术栈，后续对话自动引用
2. **Tool Builder**：AI 可在对话中"造工具"——描述工具签名 + 实现，保存为 skill，立即生效
3. **Code Review Pipeline**：Reviewer 角色输出结构化评分（安全 / 可维护 / 性能，各 0-100），前端显示雷达图
4. **Sandbox Snapshot**：WebContainer 状态可保存到云端（`sandbox_snapshots` 表），生成只读分享链接
5. **Agent Personality Profile**：每个 agent 拥有 MBTI、技能矩阵、擅长语言标签，显示在 `/agents/:id` 详情页

---

## Impact

### 受影响的 Spec
- `v3-upgrade` 中 Vibe Coding 章节（§6）：本 spec 全面重写 Vibe Coding Agent
- `extend-agents-and-streaming`：普通对话 Agent 也支持 skill 加载

### 受影响的关键代码
- 后端
  - `server/src/routes/vibe-code.ts`：新增 `/plan` 端点、改写 `/stream` 支持 team 接力
  - `server/src/lib/vibe-tools.ts`：工具改为从 skill 注册表动态加载
  - `server/src/lib/agents/`：新增 `team-orchestrator.ts`、`planner.ts`、`reviewer.ts`
  - 新增 `server/src/routes/skills.ts`、`plans.ts`、`team.ts`
  - 新增 `server/src/lib/skill-registry.ts`、`agent-memory.ts`
- 前端
  - `client/src/pages/studio/VibeCodePage.tsx`：集成 WebContainer + Terminal + FileTree + Plan Panel + Team Toggle
  - 新增 `client/src/components/WebContainerSandbox.tsx`、`Terminal.tsx`、`FileTree.tsx`、`PlanPanel.tsx`、`TeamToggle.tsx`
  - 新增 `client/src/pages/SkillsMarketPage.tsx`、`SkillStudioPage.tsx`
  - 新增路由 `/skills`、`/skills/:id`、`/skills/create`
- 数据库：新增 6 张表 + RLS + 索引（见 tasks）
- 共享类型：`shared/types.ts` 新增 `Skill`、`Plan`、`PlanStep`、`TeamSession`、`TeamRole`、`AgentMemory` 等

---

## ADDED Requirements

### Requirement: Skill 市场与插件化 Agent

The system SHALL provide a skill marketplace where users can browse, install, enable, disable, and uninstall skills (plugins) that extend Agent capabilities.

#### Scenario: 用户安装 skill
- **WHEN** 用户在 `/skills` 页面点击"安装"按钮
- **THEN** skill 被加入 `user_skills` 表，默认 enabled=true
- **AND** 后续 Vibe Coding 对话中 Agent 自动获得该 skill 提供的工具

#### Scenario: 用户禁用 skill
- **WHEN** 用户在个人中心或 `/skills` 关闭某个已安装 skill
- **THEN** 该 skill 提供的工具从 Agent 工具集中移除
- **AND** 当前进行中的对话不中断（下次对话生效）

#### Scenario: 用户发布自建 skill
- **WHEN** 用户在 `SkillStudioPage` 用 AI 帮忙生成 skill manifest + 实现代码
- **AND** 点击"发布"
- **THEN** skill 进入 `skills` 表（status='pending'，管理员审核后变为 'published'）
- **AND** 其他用户可在市场看到并安装

### Requirement: Plan Mode 规划执行

The system SHALL allow the Agent to generate a structured plan before writing code, and execute the plan step by step with user visibility.

#### Scenario: 用户请求生成 plan
- **WHEN** 用户在 Vibe Coding 输入框发送需求
- **AND** 勾选了"Plan Mode"（顶部开关）
- **THEN** Agent 调用 `generate_plan` 工具返回结构化 steps
- **AND** 前端在 Plan Panel 显示 steps 列表（可编辑）
- **AND** 不立即写代码，等待用户确认或修改

#### Scenario: 用户确认 plan 并执行
- **WHEN** 用户点击 Plan Panel 上的"开始执行"
- **THEN** Agent 按 step 顺序执行，每个 step 完成后更新状态为 `completed`
- **AND** 前端实时高亮当前 step，已完成打勾
- **AND** 中途用户可点击"暂停"或"跳过此步"

### Requirement: AI Teamwork 多角色协作

The system SHALL support an optional multi-agent team mode with 6 built-in roles (Leader, Planner, Coder, Executor, Reviewer, Reporter) that collaborate via SSE relay.

#### Scenario: 用户启用 Teamwork
- **WHEN** 用户在 VibeCoding 顶部打开"Teamwork"开关
- **AND** 选择启用角色（如 Leader + Planner + Coder + Reviewer）
- **THEN** 发送消息后由 Leader 接收，分配给其他角色接力
- **AND** 每个 AI 消息显示角色徽章
- **AND** SSE 事件流中每条事件带 `role` 字段

#### Scenario: 关闭 Teamwork
- **WHEN** 用户关闭 Teamwork 开关
- **THEN** 回到单 agent 模式（Leader 兼任所有角色），保持向后兼容

### Requirement: WebContainer 浏览器内 bash 沙箱

The system SHALL mount a WebContainer instance in the Vibe Coding page, providing a complete Node.js + npm + git + bash environment running entirely in the browser.

#### Scenario: AI 调用 bash 工具
- **WHEN** Agent 调用 `bash` 工具，传入 `command: "npm install lodash"`
- **THEN** 前端通过 postMessage 把命令转发到 WebContainer
- **AND** WebContainer 在浏览器内执行该命令
- **AND** stdout / stderr 实时流回 Terminal 组件
- **AND** 工具结果返回给 Agent（作为 tool_result 事件）

#### Scenario: 用户手动输入 bash 命令
- **WHEN** 用户在 Terminal 组件输入 `git init && git add . && git commit -m "init"`
- **THEN** 命令在 WebContainer 中执行，输出实时显示
- **AND** 该操作不经过 AI（直接用户控制）

#### Scenario: iframe 预览对接 dev server
- **WHEN** AI 运行 `npm run dev` 启动 dev server
- **THEN** WebContainer 提供 `url` 给前端
- **AND** 右侧 Preview iframe 加载该 URL（而非旧的 srcDoc）
- **AND** 文件变更时 HMR 自动生效

#### Scenario: 降级到旧沙箱
- **WHEN** WebContainer boot 失败（如浏览器不支持 SharedArrayBuffer）
- **THEN** 前端显示提示"当前浏览器不支持完整沙箱，已降级到基础预览"
- **AND** 回退到 srcDoc + Node vm 方案

### Requirement: Agent Memory 长期记忆

The system SHALL allow the Agent to remember user preferences, technical stack, and historical decisions across sessions.

#### Scenario: Agent 记住用户偏好
- **WHEN** 用户在对话中说"我喜欢用 Tailwind"
- **THEN** Agent 调用 `save_memory` 工具，保存到 `agent_memory` 表（key='ui_framework', value='tailwind'）
- **AND** 后续新对话开始时，Agent 自动加载 memory 注入 system prompt

### Requirement: Tool Builder AI 造工具

The system SHALL allow the Agent to create new tools dynamically during a conversation, which are immediately available as skills.

#### Scenario: AI 造工具并使用
- **WHEN** Agent 判断需要"翻译 API 调用"工具，但当前没有
- **AND** 用户同意让 AI 造工具
- **THEN** Agent 调用 `build_tool` 工具，传入 name + description + implementation
- **AND** 工具立即注册到 skill 注册表
- **AND** Agent 可以在后续对话中调用该新工具

### Requirement: Code Review Pipeline

The system SHALL have the Reviewer role output structured code review scores.

#### Scenario: Reviewer 评分
- **WHEN** Coder 完成代码后，Reviewer 角色被触发
- **THEN** Reviewer 输出结构化 JSON：`{ security: 85, maintainability: 90, performance: 78, issues: [...] }`
- **AND** 前端显示评分卡片 + 雷达图
- **AND** 若任一维度 < 60，自动触发 Coder 修复

### Requirement: Sandbox Snapshot 分享

The system SHALL allow users to snapshot the WebContainer state and generate a read-only share link.

#### Scenario: 保存沙箱快照
- **WHEN** 用户点击"保存快照"按钮
- **THEN** 前端打包 WebContainer 文件树为 zip 上传到 Supabase Storage
- **AND** 在 `sandbox_snapshots` 表创建记录
- **AND** 生成只读分享链接 `/share/sandbox/:id`

---

## MODIFIED Requirements

### Requirement: Vibe Coding Agent 系统提示词

原 `STREAM_SYSTEM_PROMPT` 升级为：
- 默认包含已安装 skill 的工具能力说明
- 启用 Teamwork 时，追加角色职责说明
- 启用 Plan Mode 时，追加"先规划后执行"指令
- 启用 Memory 时，自动追加用户历史 memory 摘要

### Requirement: Vibe Code `/stream` 端点

原 `/api/vibe-code/stream` 改造：
- 请求体新增 `mode: 'single' | 'plan' | 'team'`
- 响应新增事件类型：`plan`（steps 数组）、`role`（角色切换）、`review`（评分）
- 工具集改为从 skill 注册表动态加载

---

## REMOVED Requirements

### Requirement: Node `vm` 作为主沙箱
**Reason**：改用 WebContainer 提供完整 bash + Node.js 环境
**Migration**：`executeCode` 工具降级为内置 skill `builtin.code-exec`，仍用 `vm.createContext`，仅在 WebContainer 不可用时启用

### Requirement: iframe srcDoc 作为唯一预览方式
**Reason**：改用 WebContainer dev server URL 作为主预览
**Migration**：srcDoc 保留作为降级方案，当 WebContainer boot 失败时使用
