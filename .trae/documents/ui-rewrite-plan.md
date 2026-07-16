# UI/UX 全面重构实施计划

> **目标**：将 GitHub Dark 风格重构为极简白底高级风格，导航精简为 5 项（首页/特色功能/+/聊天/我），新增"每日灵感"特色功能，整合 AI 聊天入口。

> **风格参考**：Linear / Vercel / Notion — 大面积留白、克制配色、精致动画、sans-serif 字体、白底为主但完美支持深色模式

---

## 核心决策

### 1. 设计风格：极简白底（Light-first）
- **主背景**：`#ffffff` 纯白
- **次级背景**：`#fafafa` 浅灰
- **卡片背景**：`#ffffff` + 细边框 `#e5e5e5`
- **主文字**：`#171717`（near-black）
- **次级文字**：`#737373`
- **主色**：`#171717`（黑色按钮，极简高级感）
- **强调色**：`#6366f1`（indigo，用于链接/聚焦/活跃态）
- **圆角**：`0.5rem`（8px）统一
- **字体**：`Inter` 优先 + `SF Pro Text` + `PingFang SC`（不再用 mono）
- **深色模式**：完美支持，`#0a0a0a` 背景 + `#fafafa` 文字
- **动画**：200-300ms ease-out，hover scale 1.02，shadow 细腻变化

### 2. 导航精简（5 项）
| 项 | 图标 | 路由 | 说明 |
|----|------|------|------|
| 首页 | Home | `/` | 信息流 |
| 灵感 | Sparkles | `/daily` | 每日 AI 创作挑战（特色功能） |
| + | Plus | `/publish` | 发布作品（中间凸起按钮） |
| 聊天 | MessageCircle | `/chat` | 聊天列表（AI 智能体 + 后续 IM） |
| 我 | User | `/profile` | 个人主页 |

### 3. 特色功能："每日灵感"（Daily）
- 每天系统生成一个创作主题（如"画一只在月球上喝咖啡的猫"）
- 展示今日挑战 + 倒计时 + 参与作品
- 一键跳转到创作工坊参与
- 展示往期精选作品画廊
- 简单实现：前端页面 + 后端 1 个 API 端点（基于日期 seed 生成主题）

### 4. 聊天整合
- `/chat` 新增聊天列表页：展示所有 AI 智能体 + 最近会话
- 点击智能体进入 `/chat/:agentId`（复用现有 ChatPage）
- 后续 IM 私信作为第二批，复用列表页结构

---

## 实施步骤

### 第一批：设计系统 + 导航 + 核心页面（本次执行）

#### Step 1: 重写设计系统（globals.css + tailwind.config）
- `client/src/styles/globals.css`：重写所有 CSS 变量为白底极简风
- `client/tailwind.config.ts`：更新颜色映射、字体、动画
- 深色模式通过 `.dark` 类切换（不再强制 dark）

#### Step 2: 重写导航（Sidebar + BottomTabBar + Layout）
- `client/src/components/layout/Sidebar.tsx`：精简为 5 项，白底风格
- `client/src/components/layout/Layout.tsx`：移除 RightSidebar（极简风格不需要三栏）
- 移动端 BottomTabBar：5 项 + 中间凸起 + 按钮

#### Step 3: 创建"每日灵感"页面
- `client/src/pages/DailyInspirationPage.tsx`：今日挑战 + 参与入口 + 往期精选
- `server/src/routes/daily.ts`：GET /api/daily/today 返回基于日期的主题
- `server/src/index.ts`：注册 dailyRouter
- `client/src/App.tsx`：添加 /daily 路由

#### Step 4: 创建聊天列表页
- `client/src/pages/ChatListPage.tsx`：AI 智能体列表 + 搜索 + 最近会话
- `client/src/App.tsx`：添加 /chat 路由（指向列表页，/chat/:agentId 保留）

#### Step 5: 重构 HomePage（首页信息流）
- `client/src/pages/HomePage.tsx`：白底卡片流 + 精致排版

#### Step 6: 构建验证 + 部署
- server build + client build
- 提交 + 推送 + 部署

---

## 详细规格

### globals.css 新色板

```css
:root {
  --background: 0 0% 100%;           /* #ffffff */
  --foreground: 0 0% 9%;             /* #171717 */
  --card: 0 0% 100%;                 /* #ffffff */
  --popover: 0 0% 100%;
  --primary: 0 0% 9%;                /* #171717 黑色按钮 */
  --primary-foreground: 0 0% 98%;    /* #fafafa */
  --secondary: 0 0% 96%;             /* #f5f5f5 */
  --secondary-foreground: 0 0% 9%;
  --muted: 0 0% 96%;                 /* #f5f5f5 */
  --muted-foreground: 0 0% 45%;      /* #737373 */
  --accent: 239 84% 67%;             /* #6366f1 indigo */
  --accent-foreground: 0 0% 98%;
  --destructive: 0 84% 60%;          /* #e11d48 */
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 90%;                /* #e5e5e5 */
  --input: 0 0% 90%;
  --ring: 239 84% 67%;              /* #6366f1 */
  --radius: 0.5rem;                  /* 8px */
}

.dark {
  --background: 0 0% 4%;             /* #0a0a0a */
  --foreground: 0 0% 98%;            /* #fafafa */
  --card: 0 0% 7%;                   /* #121212 */
  --popover: 0 0% 7%;
  --primary: 0 0% 98%;              /* #fafafa 白色按钮 */
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14%;             /* #242424 */
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14%;
  --muted-foreground: 0 0% 64%;
  --accent: 239 84% 67%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 72% 51%;
  --border: 0 0% 14%;
  --input: 0 0% 14%;
  --ring: 239 84% 67%;
}
```

### 字体
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', Menlo, monospace; /* 仅代码块用 */
body { font-family: var(--font-sans); } /* 不再用 mono */
```

### 导航结构（桌面端 Sidebar）
```
┌──────────────────┐
│  AI Lab          │  ← Logo（极简文字）
│                  │
│  🏠 首页         │  ← NavLink
│  ✨ 灵感         │  ← 每日灵感
│  ➕              │  ← 凸起的发布按钮
│  💬 聊天         │  ← 聊天列表
│  👤 我           │  ← 个人主页
│                  │
│                  │
│  [头像]          │  ← 底部用户区
└──────────────────┘
宽度: w-16 (图标) / lg:w-56 (展开)
```

### 移动端 BottomTabBar
```
┌──────────────────────────────┐
│  🏠    ✨   [➕]   💬    👤  │
│ 首页  灵感  发布  聊天   我  │
└──────────────────────────────┘
中间 + 按钮凸起，圆形，黑色背景
```

### 每日灵感页面布局
```
┌────────────────────────────────────┐
│         ✨ 每日灵感               │
│                                    │
│   ┌──────────────────────────┐    │
│   │  今日挑战                 │    │
│   │  "画一只在月球上喝咖啡的猫" │    │
│   │                          │    │
│   │  剩余时间: 14:32:10      │    │
│   │  [立即参与 →]            │    │
│   └──────────────────────────┘    │
│                                    │
│   往期精选                         │
│   ┌────┐ ┌────┐ ┌────┐          │
│   │作品1│ │作品2│ │作品3│          │
│   └────┘ └────┘ └────┘          │
└────────────────────────────────────┘
```

### 聊天列表页布局
```
┌────────────────────────────────────┐
│  聊天                    [🔍]     │
├────────────────────────────────────┤
│  ┌──────────────────────────┐    │
│  │ 🤖 AI 智能体              │    │
│  │ C罗  爱因斯坦  苏格拉底... │    │
│  └──────────────────────────┘    │
│                                    │
│  最近会话                          │
│  ┌──────┐ ┌──────┐ ┌──────┐     │
│  │C罗 12h│ │爱因1d│ │苏格2d│     │
│  └──────┘ └──────┘ └──────┘     │
└────────────────────────────────────┘
```

---

## 文件清单

### 修改文件
1. `client/src/styles/globals.css` — 重写色板
2. `client/tailwind.config.ts` — 更新配色映射 + 字体
3. `client/src/components/layout/Sidebar.tsx` — 精简为 5 项导航
4. `client/src/components/layout/Layout.tsx` — 移除 RightSidebar
5. `client/src/App.tsx` — 添加 /daily + /chat 路由
6. `client/src/pages/HomePage.tsx` — 白底风格
7. `client/src/components/ui/button.tsx` — 更新 variant 样式
8. `client/src/components/ui/card.tsx` — 更新边框/阴影

### 新建文件
1. `client/src/pages/DailyInspirationPage.tsx` — 每日灵感页
2. `client/src/pages/ChatListPage.tsx` — 聊天列表页
3. `server/src/routes/daily.ts` — 每日灵感 API
