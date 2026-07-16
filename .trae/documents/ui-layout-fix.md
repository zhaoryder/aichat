# UI 布局乱掉修复计划

## Summary

用户反馈"UI 用着用着界面就乱了"。经深度排查，发现根因集中在 `VibeCodePage.tsx`（3074 行）这一个文件中，共 6 个高严重度问题 + 4 个中严重度问题。最关键的是：顶层高度公式错误（`100vh-4rem`，但项目早已移除 Navbar）、iframe 流式 remount 闪烁、左侧栏 mount/unmount 突变。

本计划按优先级分 3 个阶段修复，P0 修复可解决 80% 的"界面乱了"反馈。

## Current State Analysis

### 整体布局架构
```
Layout (flex min-h-dvh)
  ├─ Sidebar     (sticky top-0 z-30 h-dvh, w-16 lg:w-56)
  ├─ main        (flex-1 flex-col pb-16 lg:pb-0)  ← 注意：pb-16 给移动端 BottomTabBar 留位
  │    └─ <Outlet /> → VibeCodePage
  └─ BottomTabBar (fixed bottom-0 z-50 h-16 lg:hidden)
```

**关键事实**：项目**没有顶部 Navbar**（`Navbar.tsx` 是死代码未被 import），Sidebar 占满 `h-dvh`，main 用 `min-h-dvh` + `pb-16 lg:pb-0`。

### VibeCodePage 当前结构（问题核心）
```
div h-[calc(100vh-4rem)] flex-col overflow-hidden    ← BUG：100vh-4rem 是旧 Navbar 时代公式
  ├─ sandboxError banner (shrink-0, 条件渲染)         ← 出现/消失导致 layout shift
  ├─ AICollaboratorPicker (shrink-0)
  ├─ header 工具栏 (shrink-0)
  ├─ div flex-1 overflow-hidden
  │    ├─ Tabs (md:hidden) 移动端 4 Tab
  │    └─ div hidden md:flex h-full
  │         ├─ aside leftCollapsed && 条件渲染（无过渡）   ← mount/unmount 突变
  │         ├─ section 中栏 hidden lg:flex
  │         ├─ main 右栏 flex-1
  │         │    ├─ renderRightPanel (split/code/preview)
  │         │    └─ Terminal 抽屉 (h-0/h-[240px] transition + 内部条件渲染冲突)
  ├─ fullscreen code overlay (fixed inset-0 z-50)
  ├─ fullscreen preview overlay (fixed inset-0 z-50)
  └─ 4 个 Dialog
```

## Proposed Changes

### P0 阶段（必修，解决 80% 问题）

#### 修复 1：VibeCodePage 顶层高度公式
**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 2630 行
**当前**：
```tsx
<div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
```
**改为**：
```tsx
<div className="flex h-dvh flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
```
**原因**：
- 项目早已移除顶部 Navbar，Sidebar 用 `h-dvh` 占满视口
- `100vh - 4rem` 是旧公式，导致桌面端底部出现 4rem 空白条
- 移动端 main 已有 `pb-16` 给 BottomTabBar 留位置，VibeCodePage 再减 4rem 是双重压缩
- 改为 `h-dvh` 与 Sidebar 一致，让 Layout 的 `pb-16 lg:pb-0` 统一处理底部留白
- 同时解决 `100vh` vs `100dvh` 的 iOS Safari 地址栏遮挡问题

#### 修复 2：iframe 流式 remount 闪烁
**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 843-846 行（`iframeVersion` 状态）+ 第 529-543 行（PreviewArea iframe）
**当前**：
```tsx
const [iframeVersion, setIframeVersion] = useState(0)
useEffect(() => {
  if (code) setIframeVersion((v) => v + 1)
}, [code])
```
每次 `code` 变化（流式生成时每秒多次）→ iframeVersion++ → iframe `key` 变化 → 完全 remount → 持续闪烁。

**改为**：用 debounce 控制 iframeVersion 更新频率
```tsx
useEffect(() => {
  if (!code) return
  const timer = setTimeout(() => setIframeVersion((v) => v + 1), 500)
  return () => clearTimeout(timer)
}, [code])
```
**原因**：流式生成时 `code` 每秒变化多次，iframe remount 导致预览区持续白屏闪烁。500ms debounce 让流式过程中预览相对稳定，流结束后 500ms 内会更新到最终状态。

#### 修复 3：leftCollapsed 直接条件渲染导致 layout shift
**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 2734-2739 行
**当前**：
```tsx
{!leftCollapsed && (
  <aside className="w-[300px] lg:w-[340px] shrink-0 border-r ... overflow-hidden">
    {renderLeftPanel()}
  </aside>
)}
```
**改为**：保留 mount，用 width transition 控制可见性
```tsx
<aside className={cn(
  "shrink-0 border-r overflow-hidden transition-all duration-300 ease-out",
  leftCollapsed ? "w-0 -ml-1" : "w-[300px] lg:w-[340px]"
)}>
  {renderLeftPanel()}
</aside>
```
**原因**：mount/unmount 会让右侧 `flex-1` 瞬间扩展 300px，整页 layout 突变。改用 width transition 后平滑收缩/展开。

### P1 阶段（重要，影响特定场景）

#### 修复 4：Terminal 抽屉 transition 与条件渲染冲突
**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 2760-2785 行
**当前**：外层 `h-0/h-[240px]` transition，内层 `{showTerminal && (...)}` 直接 unmount
**改为**：内部 DOM 不条件渲染，用 `opacity` + `pointer-events-none` 控制可见性
```tsx
<div className={cn(
  "shrink-0 border-t transition-all duration-300 ease-out overflow-hidden",
  showTerminal ? "h-[240px]" : "h-0"
)}>
  <div className={cn(
    "flex h-full flex-col overflow-hidden bg-[#0f172a] transition-opacity duration-200",
    showTerminal ? "opacity-100" : "opacity-0 pointer-events-none"
  )}>
    {/* Terminal 内容常驻 */}
  </div>
</div>
```
同时在 Terminal 组件中添加 ResizeObserver 重试 fit 逻辑（容器宽度为 0 时跳过）。

**原因**：关闭瞬间 React 先 unmount 内部 DOM，再开始 height transition，期间显示空白条；开启瞬间容器 h=0，xterm fit 失败。

#### 修复 5：PlanPanel 插入挤压 Thread
**文件**：`client/src/pages/studio/VibeCodePage.tsx` + `client/src/components/PlanPanel.tsx`
**位置**：第 2162-2181 行（leftPanel 容器）+ PlanPanel.tsx:297（`max-h-72`）
**改动**：
1. PlanPanel 容器加 `shrink-0`
2. PlanPanel 内部 `max-h-72` → `max-h-60`（减小占位）
3. 给 Thread 设置 `min-h-[200px]` 防止被压缩到 0
4. "历史项目"和"版本历史"默认折叠

**原因**：PlanPanel + 历史项目 + 版本历史总高度可能超过 leftPanel，导致 Thread 被压缩到 0、Composer 消失。

#### 修复 6：z-index 冲突（VibeCodePage 全屏 vs BottomTabBar）
**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 2792、2809 行（全屏覆盖）
**当前**：`fixed inset-0 z-50`
**改为**：`fixed inset-0 z-[60]`
**原因**：BottomTabBar 也是 `z-50`，在 768-1024px 平板宽度下全屏时 BottomTabBar 会浮在覆盖层之上遮挡底部。

#### 修复 7：sandboxError banner 导致 layout shift
**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 2632-2655 行
**当前**：`{sandboxError && <div className="shrink-0 ...">}`
**改为**：保留占位，banner 改为 `absolute` 浮层不占文档流
```tsx
{sandboxError && (
  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[55] rounded-full ...">
    ...
  </div>
)}
```
**原因**：banner 出现/消失会让主内容区 `flex-1` 高度变化，三栏内部重新计算导致抖动。

### P2 阶段（体验优化）

#### 修复 8：FileTree height 硬编码
**文件**：`client/src/components/FileTree.tsx`
**位置**：第 285-298 行（`height={400}`）
**改为**：用 useRef + ResizeObserver 动态获取容器高度

#### 修复 9：主题切换无 disableTransitionOnChange
**文件**：`client/src/main.tsx`
**位置**：第 15 行
**改为**：`<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>`

#### 修复 10：移动端 Tabs 切换后触发 resize
**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 2685-2731 行（Tabs onValueChange）
**改动**：切到 preview/terminal Tab 后 `window.dispatchEvent(new Event('resize'))`，触发 iframe/xterm 重新计算尺寸

#### 修复 11：删除死代码 Navbar.tsx
**文件**：`client/src/components/layout/Navbar.tsx`
**操作**：直接删除（确认无任何 import 引用后）

#### 修复 12：dev server URL 切换时 iframe 显示 loading 蒙层
**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 528-543 行
**改动**：devServerUrl 从 null → URL 期间显示 loading 蒙层，避免 srcDoc/src 模式切换时的白屏闪烁

## Assumptions & Decisions

1. **假设**：用户主要使用桌面端，但也需要移动端可用
2. **决策**：P0 阶段必修（3 个修复），P1 阶段建议修（4 个修复），P2 阶段可选（5 个修复）
3. **决策**：不重写整个 VibeCodePage 布局，只针对性修复问题点（避免引入新 bug）
4. **假设**：WebContainer 在生产环境可能不可用（COOP/COEP 配置问题），因此 srcDoc 降级路径必须稳定
5. **决策**：所有修复保持向后兼容，不改变现有 API/路由
6. **决策**：不修改 Tailwind 配置或全局 CSS（避免连锁反应）

## Verification Steps

### P0 验证
1. 桌面端进入 `/studio/vibe-code`，观察页面底部：不应有 4rem 空白条
2. 移动端进入 `/studio/vibe-code`，Composer 输入框不应被 BottomTabBar 遮挡
3. iOS Safari 滚动触发地址栏显隐，底部内容不应被遮挡
4. 发送需求触发流式生成，右侧预览区：不应持续白屏闪烁（500ms debounce 后相对稳定）
5. 点击"收起左侧"按钮：三栏 → 两栏过渡平滑，不应突变

### P1 验证
6. 开启 Terminal 抽屉：展开/收起无空白条残留，xterm 尺寸正常
7. 开启 Plan Mode 生成 5+ step plan：Thread 区域不应被压缩到 0，Composer 可见
8. 平板宽度（768-1024px）点击全屏：底部不应被 BottomTabBar 遮挡
9. WebContainer boot 失败时 banner 出现/消失：主内容区不应抖动

### P2 验证
10. 不同视口高度下 FileTree 不被裁剪/留白
11. 切换暗色模式：无全屏闪烁
12. 移动端切换 Tab 后 iframe/xterm 尺寸正常
13. 确认 `Navbar.tsx` 删除后无 import 报错

### 全局验证
14. `cd client && npx tsc --noEmit` 通过
15. `cd client && npm run build` 通过
16. `cd client && npx wrangler pages deploy dist --project-name aichat --commit-dirty=true` 部署成功
17. 生产环境 https://aichat-dgl.pages.dev/studio/vibe-code 硬刷新后所有修复生效
