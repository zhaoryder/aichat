# 两个代码页面 + Teamwork 布局错乱修复计划

## 当前进度（2026-07-17）

| 修复 | 状态 | 说明 |
|---|---|---|
| 修复 1：中栏 CodeArea 条件渲染 | ✅ 已应用 | VibeCodePage.tsx 第 2772-2792 行 |
| 修复 2：TeamToggle 改为 Popover | ✅ 已应用 | TeamToggle.tsx 已重写为 Popover 版本 |
| 修复 3：header 容器防御性样式 | ⬜ 待应用 | header 第 2684 行 + renderToolbar 第 2468 行 |
| 编译验证 | ⬜ 待执行 | tsc --noEmit + vite build |
| 部署 | ⬜ 待执行 | Cloudflare Pages + git push |

**待执行步骤**：
1. 应用修复 3（2 处 Edit）
2. `cd client && npx tsc --noEmit`
3. `cd client && npm run build`
4. `cd client && npx wrangler pages deploy dist --project-name aichat --commit-dirty=true`
5. `git add -A && git commit && git push origin main`

## Summary

用户反馈两个问题：
1. **会有两个代码页面** — 桌面 lg+ 屏幕下，中栏 `<section>` 无条件渲染 CodeArea，同时右栏 `renderRightPanel()` 在 split/code 模式也渲染 CodeArea，导致两个 CodeArea 同时显示
2. **打开 teamwork 就乱了** — TeamToggle 开启后从 80px Switch 暴增到 480-560px（6 角色 chips + 摘要），但 toolbar 和 header 无 `flex-wrap`、无 `overflow-hidden`，横向挤压导致整页布局错乱

## Current State Analysis

### 问题 1 根因（确定性）

桌面 lg+ 屏幕下渲染矩阵：

| viewMode | 中栏 (2781行) | 右栏 renderRightPanel | 视觉结果 |
|---|---|---|---|
| `'split'`（默认） | CodeArea（无条件渲染） | split = CodeArea + PreviewArea | **两个 CodeArea 同时显示** |
| `'code'` | CodeArea（无条件渲染） | CodeArea | **两个 CodeArea 同时显示** |
| `'preview'` | CodeArea（无条件渲染） | PreviewArea | 正常互补 |

**根因**：`<section className="hidden lg:flex ...">`（第 2773-2787 行）在中栏无条件渲染 `<CodeArea .../>`，完全无视 `viewMode` 状态。而右栏 `<main>`（第 2790 行）调用 `renderRightPanel()`，后者在 `viewMode === 'code'` 或 `viewMode === 'split'`（默认）时也渲染 CodeArea。

**触发条件**：
- 屏幕宽度 ≥ 1024px (lg 断点)
- `viewMode` 是 `'split'`（默认值，持久化到 localStorage）或 `'code'`
- 用户首次访问和回访都会触发

### 问题 2 根因（确定性）

**TeamToggle 开启后宽度暴增**：
- 关闭时：约 80px（Switch + "Teamwork" 文本）
- 开启时：约 480-560px（Switch + 6 角色 chips + "N/6" 摘要）

**布局容器无防御**：
- `renderToolbar` 根 div（第 2468 行）：`<div className="flex items-center gap-2">` — 无 `flex-wrap`、无 `min-w-0`、无 `max-w`
- header 容器（第 2685 行）：`<div className="flex items-center justify-between gap-2 px-3 py-2">` — 无 `flex-wrap`、无 `overflow-hidden`
- TeamToggle 内层（TeamToggle.tsx 第 167 行）：`flex items-center gap-1` — 无 `flex-wrap`

**后果**：
1. toolbar 横向挤压左侧标题区（被压到极窄）
2. toolbar 自身溢出 header 右边界
3. header 无 `overflow-hidden`，溢出内容影响下方三栏布局视觉对齐
4. layout shift 导致三栏宽度计算被打乱，整体"乱了"

## Proposed Changes

### 修复 1：中栏 CodeArea 条件渲染（解决问题 1）

**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 2773-2787 行（中栏 `<section className="hidden lg:flex">`）
**当前**：
```tsx
<section className="hidden lg:flex w-[260px] xl:w-[300px] shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden">
  <div className="flex h-[40%] flex-col overflow-hidden border-b border-gray-200 dark:border-gray-700">
    <FileTree ... />
  </div>
  <div className="flex-1 overflow-hidden">
    <CodeArea ... />  ← 无条件渲染，与右栏重复
  </div>
</section>
```
**改为**：仅在 `viewMode === 'preview'` 时渲染 CodeArea（与右栏互补）
```tsx
<section className="hidden lg:flex w-[260px] xl:w-[300px] shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden">
  <div className={cn("flex flex-col overflow-hidden border-b border-gray-200 dark:border-gray-700", viewMode === 'preview' ? "h-[40%]" : "h-full")}>
    <FileTree ... />
  </div>
  {viewMode === 'preview' && (
    <div className="flex-1 overflow-hidden">
      <CodeArea ... />
    </div>
  )}
</section>
```
**效果**：
- `viewMode === 'code'`：中栏无 CodeArea（避免重复） + 右栏 CodeArea ✅
- `viewMode === 'split'`：中栏无 CodeArea（避免重复） + 右栏 split (CodeArea + PreviewArea) ✅
- `viewMode === 'preview'`：中栏 CodeArea + 右栏 PreviewArea（完美互补）✅
- FileTree 在非 preview 模式下占满中栏全高度，更合理

### 修复 2：TeamToggle 改为 Popover 弹出层（解决问题 2）

**文件**：`client/src/components/TeamToggle.tsx`
**位置**：第 145-205 行
**当前**：开启后 inline 展开 6 角色 chips + 摘要，横向占 480-560px
**改为**：toolbar 中只保留 Switch + 紧凑摘要（如 "Team 6/6"），点击摘要按钮弹出 Popover 显示角色选择面板

```tsx
<div className="flex items-center gap-1.5">
  <Switch checked={enabled} onCheckedChange={...} />
  {enabled && (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ...">
          <Users className="h-3 w-3" />
          <span>{selectedRoles.length}/6</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        {/* 6 角色 chips 网格布局，2 列 x 3 行 */}
        <div className="grid grid-cols-2 gap-2">
          {TEAM_ROLES.map(role => (
            <button onClick={toggleRole(role)} className="...">
              {role.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )}
</div>
```
**效果**：
- toolbar 中 TeamToggle 占用从 480-560px 降到约 120px
- 角色选择面板在 Popover 中弹出，不挤压 toolbar
- 桌面/移动端体验一致

### 修复 3：header 容器防御性样式（加固问题 2）

**文件**：`client/src/pages/studio/VibeCodePage.tsx`
**位置**：第 2684-2703 行（header 容器）
**当前**：
```tsx
<header className="shrink-0 border-b ...">
  <div className="flex items-center justify-between gap-2 px-3 py-2">
    <div className="flex items-center gap-2 min-w-0">...</div>
    {renderToolbar()}
  </div>
</header>
```
**改为**：
```tsx
<header className="shrink-0 border-b ... overflow-hidden">
  <div className="flex items-center justify-between gap-2 px-3 py-2">
    <div className="flex items-center gap-2 min-w-0">...</div>
    {renderToolbar()}
  </div>
</header>
```
同时在 `renderToolbar` 根 div（第 2468 行）加 `flex-wrap` + `min-w-0`：
```tsx
<div className="flex items-center gap-2 flex-wrap min-w-0 justify-end">
```
**效果**：即使 toolbar 内容过多，也会换行而非挤压标题区；header overflow-hidden 防止溢出影响下方布局

## Assumptions & Decisions

1. **决策**：修复 1 采用"中栏仅在 preview 模式渲染 CodeArea"方案，而非"右栏在 lg+ 跳过 CodeArea"方案（前者侵入性更小，FileTree 在非 preview 模式下占满中栏更合理）
2. **决策**：修复 2 采用 Popover 方案而非 flex-wrap 保底方案（Popover 从根本解决宽度问题，flex-wrap 只是缓解）
3. **假设**：Popover 组件已在项目中可用（shadcn/ui 标准组件，应已存在）
4. **决策**：保留 TeamToggle 的 Switch 开关在 toolbar 中，仅将角色 chips 移到 Popover
5. **假设**：用户主要使用桌面端，但移动端也需可用（Popover 在移动端也能正常弹出）

## Verification Steps

### 问题 1 验证
1. 桌面 lg+（≥1024px）进入 `/studio/vibe-code`，默认 viewMode 为 `split`：**只有一个 CodeArea**（在右栏 split 中）
2. 切换 viewMode 到 `code`：**只有一个 CodeArea**（在右栏）
3. 切换 viewMode 到 `preview`：中栏显示 CodeArea + 右栏显示 PreviewArea（互补）
4. 平板（768-1024px）：中栏 `hidden lg:flex` 不显示，只有右栏 CodeArea
5. 移动端（<768px）：使用 Tabs，单 CodeArea

### 问题 2 验证
6. 桌面端开启 Teamwork：toolbar 中只显示 Switch + "N/6" 摘要按钮（约 120px）
7. 点击摘要按钮：弹出 Popover 显示 6 角色 chips（2 列 x 3 行网格）
8. 选择/取消角色：Popover 中实时更新，关闭后摘要更新
9. 移动端开启 Teamwork：toolbar 不挤压标题区，Popover 正常弹出
10. 开启 Teamwork + Plan Mode 共存：toolbar 不溢出，布局稳定

### 全局验证
11. `cd client && npx tsc --noEmit` 通过
12. `cd client && npm run build` 通过
13. `cd client && npx wrangler pages deploy dist --project-name aichat --commit-dirty=true` 部署成功
14. 生产环境 https://aichat-dgl.pages.dev/studio/vibe-code 硬刷新后两个问题都消失
