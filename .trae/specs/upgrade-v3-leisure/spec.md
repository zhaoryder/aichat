# aichat v3.0 休闲向高阶升级 Spec（详细实现版）

> **本 spec 为实现级规格**：每个改动都精确到文件路径、函数名、参数、返回值、SQL 语句、组件 Props、SSE 事件格式、错误码、grep 验证模式。sub-agent 据此可直接编码。
>
> **强制约定**：每完成一个小任务后，必须重新读取 `spec.md` 对应章节、`tasks.md` 对应小任务、`checklist.md` 对应验证项，并勾选完成项。如发现偏差，立即修正后才能进入下一任务。

## Why

当前 v2.x 平台存在多个阻断性 bug（语音状态错乱、论坛 AI 静默失败、收藏刷新丢失、广场智能体无法加入主页）、UI 新旧两套并存未完成迁移（`ui-legacy/*` 仍未删除）、Vibe Coding 无真正 Agent 能力（仅包装 vibeChat 非流式 tool calling）、创意工坊体验单薄、智能体仅 17 个、模型停留在 `glm-4-flash` / `cogview-4` / `cogvideox-3`，且缺少休闲向的多人协作、项目快照、多媒体流水线、社区复刻、联机共聊、个性化装扮等高阶功能。

v3.0 将进行 **全面重构**：统一技术栈、修复所有阻断性 bug、升级模型为 `agens-2.0-flash` / `agnes-image-2.1-flash` / `agnes-video-2.0`、引入 Vercel AI SDK + assistant-ui 实现真正 Agent、扩展 300+ 智能体、重构创意工坊，并新增 6 大休闲向高阶功能。版本号将更新为 `3.0.0`。

---

## 一、Bug 修复详细方案（实现级）

### Bug 1：语音输入状态错乱 + 麦克风持续占用 ✅ 已完成（Task 1.1）

**当前状态**：已修复并验证。

**已修改文件**：
- `client/src/hooks/useSpeechRecognition.ts`
- `client/src/components/chat/ChatWindow.tsx`

**修复后契约（不可破坏）**：
1. `useSpeechRecognition()` 返回 `{ transcript, interimTranscript, isListening, isSupported, startListening, stopListening, resetTranscript, cleanup }`
2. `stopListening()` 必须先调用 `recognitionRef.current?.stop()` 再 `setIsListening(false)`
3. `onerror` 回调对 `event.error === 'no-speech' || event.error === 'aborted'` 提前 return 不报错
4. unmount effect cleanup 调用 `recognition.abort()` + `recognitionRef.current = null`
5. `ChatWindow.tsx` 麦克风按钮：`isListening===true` → `<Mic className="text-primary" />` + `animate-ping` 环；`isListening===false` → `<MicOff className="text-gray-400" />`；`onClick={isListening ? stopListening : startListening}`

### Bug 2：论坛 AI 无回复 ✅ 已完成（Task 1.2）

**当前状态**：sub-agent 已完成代码修改，待回看勾选。

**已修改文件**：
- `server/src/lib/sse.ts`（添加 flush）
- `server/src/routes/forum.ts`（streamAgentReply 发送 agent_start / agent_done + 最终 done 事件）
- `client/src/pages/ForumTopicPage.tsx`（done 事件处理 + 重试按钮）

**论坛 SSE 事件契约（最终版，不可破坏）**：
- `event: start` → `data: { userPostId: string }` 或 `data: { topicId: string }`
- `event: agent_start` → `data: { agentId: string }`（前端据此创建流式占位帖）
- `event: token` → `data: { c: string, agentId: string }`（增量文本，前端按 agentId 追加到对应占位帖）
- `event: agent_done` → `data: { agentId: string }`（前端停止该 agent 占位帖流式状态）
- `event: done` → `data: {}`（所有 AI 回复结束，前端停止整个 SSE）
- `event: error` → `data: { message: string }`

**后端必须保证**：
- `streamAgentReply` 内部 try-catch，失败也必须发送 `agent_done` 以释放前端占位帖
- 所有 AI 流式调用结束后才发送最终 `sendEvent(res, 'done', {})` + `res.end()`
- `sendEvent` 后必须 flush：优先 `res.flush?.()`（压缩中间件场景），否则 `res.flushHeaders()`

**前端必须保证**：
- 收到 `done` 事件后将所有仍在流式的占位帖标记为完成
- 网络错误（fetch reject）时停止所有占位帖流式状态，显示重试按钮
- 重试按钮调用 `handleReply({ isRetry: true })` 重新发起 SSE

### Bug 3：收藏刷新丢失 ✅ 已完成（Task 1.3）

**当前状态**：sub-agent 已完成代码修改，待回看勾选。

**已修改文件**：
- `client/src/hooks/useFavorites.tsx`（新建，注意是 `.tsx` 不是 `.ts`，因为含 JSX）
- `client/src/App.tsx`（在 `AuthProvider` 内、`BrowserRouter` 外包裹 `FavoritesProvider`）
- `client/src/components/FavoriteButton.tsx`（删除本地 `useState`，改用 `useFavorites()`）

**useFavorites 契约（不可破坏）**：
```typescript
interface FavoritesContextValue {
  favorites: Set<string>              // agent_id 集合
  isFavorited: (id: string) => boolean
  toggleFavorite: (id: string, agentType: 'official' | 'custom') => Promise<void>
  refresh: () => Promise<void>
  loading: boolean
}
```

**关键实现约束**：
- `FavoritesProvider` 在 `AuthProvider` 内部（依赖 auth token）
- `refresh()` 调用 `GET /api/favorite/list`，返回 `{ favorites: Array<{ agent_id: string; agent_type: string }> }`
- `toggleFavorite` 必须先 `await apiFetch('/favorite', { method: 'POST', body: JSON.stringify({ agentId, agentType }) })`，**API 成功后才更新本地 Set**；API 失败则状态不变（toast 报错）
- `FavoriteButton` 不再接受 `initialFavorited` prop（状态来自全局 Context）

### Bug 4：广场智能体无法添加到主页 ⏳ 待验证（Task 1.4）

**根因**：与 Bug 3 同源，收藏功能修复后只需验证 HomePage 已正确读取 `useFavorites()` 显示已收藏智能体。

**验证步骤**：
1. 打开 `/agents` 广场页 → 任意点击收藏按钮 → toast 提示"收藏成功！"
2. 刷新页面 → 收藏按钮仍为已收藏状态
3. 跳转 `/` 主页 → 主页应显示已收藏的智能体卡片（如已实现"我的收藏"区块）或在导航栏出现快捷入口
4. 若主页无"我的收藏"区块，需在 `HomePage.tsx` 增加：已登录用户 + 收藏列表非空时显示"我的收藏"区块，未收藏时显示"去广场逛逛"空状态引导

**实现要点（如需补充）**：
```typescript
// HomePage.tsx
const { favorites } = useFavorites()
const favoriteAgents = agents.filter(a => favorites.has(a.id))
// 渲染：favoriteAgents.length > 0 ? 卡片网格 : EmptyState 引导去广场
```

---

## 二、功能删除：积分 & 签到 ✅ 已完成（Task 1.5）

**当前状态**：已删除路由、组件、查询函数。

**残留清理（在 UI 重构阶段一并完成）**：
- `shared/types.ts` 中 `Profile.points` 字段与 `UserProfile.points` 字段保留（避免影响其他模块），但在 UI 重构时移除所有展示
- `AdminPage.tsx` 中积分管理列在阶段 3 UI 重构时一并移除

**验证 grep 命令**（应返回 0 行除注释外的引用）：
```bash
grep -rn "checkin\|CheckinCard" client/src server/src --include="*.ts" --include="*.tsx" | grep -v "^.*://.*" | grep -v "lessons\|lessons learned"
```

---

## 三、模型升级（实现级）

### 3.1 文本模型：`glm-4-flash` → `agens-2.0-flash`

**文件**：`server/src/lib/ai-client.ts`

**修改点**：
- 第 30 行：`const AGNES_MODEL = process.env.AGNES_MODEL || 'glm-4-flash'` → `'agens-2.0-flash'`
- 9 个导出函数自动继承新模型：`chatCompletion`、`chatCompletionStream`、`chatCompletionStreamWithSystemPrompt`、`polishAgentPrompt`、`chatWithTools`、`generateImage`、`submitVideoTask`、`getVideoTaskResult`、`generateSpeech`

**保留逻辑**（不可破坏）：
- `DEFAULT_TIMEOUT_MS = 30_000`（30 秒超时）
- 内部 `AbortController` + 外部 signal 合并
- `classifyError` 错误分类：429 → `AIRateLimitError`，超时 → `AIRequestTimeoutError`，用户取消 → `AIRequestError('请求已被取消')`
- `getClient()` 单例 + 启动时 warn 检查

**验证命令**：
```bash
curl -X POST https://aichat-production-0db9.up.railway.app/api/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"confucius","message":"你好"}' --no-buffer
# 期望：SSE 流式返回 token
```

### 3.2 图片模型：`cogview-4` → `agnes-image-2.1-flash`

**文件**：`server/src/lib/ai-client.ts` `generateImage` 函数

**修改点**：
- 第 435 行：`model: 'cogview-4'` → `model: 'agnes-image-2.1-flash'`
- 默认 size 保留 `'1024x1024'`
- 返回值契约不变：`Promise<string>`（图片 URL）

**API 调用形式**（OpenAI 兼容）：
```typescript
const response = await client.images.generate({
  model: 'agnes-image-2.1-flash',
  prompt,
  size: options?.size ?? '1024x1024',
})
const url = response.data?.[0]?.url
```

### 3.3 视频模型：`cogvideox-3` → `agnes-video-2.0`

**文件**：`server/src/lib/ai-client.ts` `submitVideoTask` / `getVideoTaskResult` 函数

**修改点**：
- 第 471 行：`model: 'cogvideox-3'` → `model: 'agnes-video-2.0'`
- 提交端点：`POST {AGNES_API_BASE}/videos/generations`
- 查询端点：`GET {AGNES_API_BASE}/async-result/{taskId}`
- 请求体不变：`{ model, prompt, with_audio: true, duration: 5 | 10 }`

**保留逻辑**：
- 429 自动重试 3 次，指数退避 2s/4s/8s
- `duration` 仅允许 5 或 10
- 返回 `{ status: 'processing' | 'SUCCESS' | 'FAIL', videoUrl?, coverUrl? }`

---

## 四、UI/UX 全面重构（实现级）

### 4.1 技术栈

- **shadcn/ui**：已配置，已安装 14 个组件（avatar/badge/button/card/dialog/dropdown-menu/input/label/popover/select/separator/skeleton/sonner/tabs/tooltip）
- **assistant-ui**：`@assistant-ui/react` + `@assistant-ui/react-ai-sdk`（用于 Thread 组件 + AI SDK streaming adapter）
- **TailwindCSS**：已配置，扩展休闲向主题

### 4.2 待补 shadcn 组件

| 组件 | 文件路径 | 实现要点 |
|---|---|---|
| `EmptyState` | `client/src/components/ui/empty-state.tsx` | export `EmptyState({ icon?, title, description, action? })` |
| `Spinner` | `client/src/components/ui/spinner.tsx` | `<Loader2 className={cn('animate-spin', sizeClass)} />`，size: 'sm' \| 'md' \| 'lg' |
| `Textarea` | `client/src/components/ui/textarea.tsx` | shadcn 标准 textarea |
| `Switch` | `client/src/components/ui/switch.tsx` | 主题切换用 |
| `Slider` | `client/src/components/ui/slider.tsx` | 装扮系统自定义颜色用 |

### 4.3 ui-legacy 删除清单

**待删除**：`client/src/components/ui-legacy/Avatar.tsx`、`Badge.tsx`、`Button.tsx`、`Card.tsx`、`Dialog.tsx`、`EmptyState.tsx`、`Input.tsx`、`Spinner.tsx` 共 8 个文件

#### 4.3.1 完整 API 差异表（实现级，逐组件对照）

| 组件 | ui-legacy API | shadcn API | 迁移操作 |
|---|---|---|---|
| **Button** | `variant: 'primary' \| 'ghost' \| 'outline' \| 'destructive'`，`size: 'sm' \| 'md' \| 'lg'` | `variant: 'default' \| 'destructive' \| 'outline' \| 'secondary' \| 'ghost' \| 'link'`，`size: 'default' \| 'sm' \| 'lg' \| 'icon'` | `variant="primary"` → 不传 variant 或 `variant="default"`；`size="md"` → `size="default"` 或不传；其他 variant 名字兼容 |
| **Card** | `<Card hoverScale>`、`<CardHeader>`、`<CardBody>`、`<CardFooter>`（named） | `<Card>`、`<CardHeader>`、`<CardContent>`、`<CardFooter>`、`<CardTitle>`、`<CardDescription>` | `<CardBody>` → `<CardContent>`；移除 `hoverScale` prop，用 className `hover-lift` 替代 |
| **Input** | `import { Input, Textarea } from '@/components/ui-legacy/Input'`（同文件双导出） | `import { Input } from '@/components/ui/input'` + `import { Textarea } from '@/components/ui/textarea'`（拆分到两个文件） | 拆分 import；移除 Textarea 的 `autoResize` prop（ChatWindow 已自己实现 height 逻辑） |
| **Dialog** | `<Dialog open={open} onClose={onClose} title="标题" footer={<Button>确定</Button>}>children</Dialog>`（单组件 + props） | `<Dialog open={open} onOpenChange={(v) => !v && onClose()}><DialogContent><DialogHeader><DialogTitle>标题</DialogTitle></DialogHeader>{children}<DialogFooter><Button>确定</Button></DialogFooter></DialogContent></Dialog>`（组合式 + 子组件） | **完全重写**，所有 Dialog 调用都要重构；`onClose` 改为 `onOpenChange` |
| **EmptyState** | `<EmptyState icon={...} title="..." description="..." action={...} className="..." />` | 同左（API 完全兼容，仅 import 路径变化） | 仅改 import 路径 |
| **Badge** | `variant: 'default' \| 'primary' \| 'secondary'` | `variant: 'default' \| 'secondary' \| 'destructive' \| 'outline'` | `variant="primary"` → 自定义 `className="bg-primary/15 text-primary"` 或改 `variant="default"`；其他兼容 |
| **Avatar** | `<Avatar name="孔子" gradient="from-red-500 to-amber-500" size="md" />`（自渲染首字母+渐变） | `<Avatar><AvatarImage src={url} /><AvatarFallback>XX</AvatarFallback></Avatar>`（Radix 组合式，需要 src 或 fallback） | **完全重写**：因为 ChatWindow 已经有 `AgentAvatar` helper 组件（在 [ChatWindow.tsx#L56-L71](file:///Users/ryder/Desktop/games/aichat/client/src/components/chat/ChatWindow.tsx#L56-L71) 中定义），所有使用 legacy Avatar 的地方应该改为复用 `AgentAvatar` helper，或直接用 div + 渐变 |
| **Spinner** | `<Spinner size="sm\|md\|lg" className="..." />` | 同左（API 完全兼容） | 仅改 import 路径 |

#### 4.3.2 Per-file 迁移清单（21 个文件，逐文件精确映射）

每个文件需要替换的 import 与 JSX 改造点（grep `from '@/components/ui-legacy/'` 共 91 处，分布在 21 个文件中）：

**A. 仅改 import 路径（API 完全兼容，0 JSX 改动）**：
1. `client/src/components/FavoriteButton.tsx`（line 14）— Spinner 1 个 import
2. `client/src/components/layout/ProtectedRoute.tsx`（line 3）— Spinner 1 个 import
3. `client/src/pages/studio/ScriptStudioPage.tsx`（line 8-12）— Card/Input/Button/Spinner/EmptyState 5 个 import
4. `client/src/pages/studio/ArticleStudioPage.tsx`（line 9-12）— Card/Input/Button/EmptyState 4 个 import
5. `client/src/pages/studio/VoiceStudioPage.tsx`（line 8-12）— Card/Textarea/Button/Spinner/EmptyState 5 个 import（注意：Textarea 需改 import 路径到 `@/components/ui/textarea`）
6. `client/src/pages/studio/VideoStudioPage.tsx`（line 9-14）— Card/Input/Button/Spinner/EmptyState/Badge 6 个 import
7. `client/src/pages/studio/ImageStudioPage.tsx`（line 8-13）— Card/Input+Textarea/Button/Spinner/EmptyState/Dialog 7 个 import（注意：Dialog 需重写、Textarea 需拆分）
8. `client/src/pages/HomePage.tsx`（line 7-10）— Button/Card/Badge/EmptyState 4 个 import
9. `client/src/pages/ChatPage.tsx`（line 6-7）— Spinner/Button 2 个 import
10. `client/src/pages/SharePage.tsx`（line 16-18）— Button/Spinner/EmptyState 3 个 import
11. `client/src/pages/EditAgentPage.tsx`（line 10-12）— Button/Input+Textarea/Spinner 3 个 import（Textarea 拆分）
12. `client/src/pages/CreateAgentPage.tsx`（line 10-12）— Button/Input+Textarea/Spinner 3 个 import（Textarea 拆分）

**B. 需重构 JSX（API 不兼容）**：
13. `client/src/pages/AgentsSquarePage.tsx`（line 9-14）— 6 个 import + `EmptyState` 用法、可能的 Card 改造
14. `client/src/pages/ForumPage.tsx`（line 8-14）— 7 个 import + Dialog 重写
15. `client/src/pages/ForumTopicPage.tsx`（line 13-16）— 4 个 import + 可能的 Textarea 重构
16. `client/src/pages/StudioPage.tsx`（line 6-10）— 5 个 import + 可能的 Card hoverScale 移除
17. `client/src/pages/AdminPage.tsx`（line 17-23）— 7 个 import + Dialog 重写 + **移除积分管理列**
18. `client/src/pages/ProfilePage.tsx`（line 16-23）— 8 个 import + Dialog 重写 + Avatar 重写 + **移除积分行残留**
19. `client/src/pages/auth/LoginPage.tsx`（line 4-6）— 3 个 import + Card/CardBody/CardHeader → CardContent/CardHeader 重构
20. `client/src/pages/auth/RegisterPage.tsx`（line 6-8）— 3 个 import + Card/CardBody/CardHeader 重构
21. `client/src/pages/studio/VibeCodePage.tsx`（line 52-56）— 5 个 import + Dialog 重写（此文件在 Task 5.2 会被完全重写，本 Task 仅做最小化迁移以删除 ui-legacy）

#### 4.3.3 迁移映射（精确到 import 行）

**通用替换规则**（适用所有 21 个文件）：
```typescript
// BEFORE（ui-legacy）
import { Button } from '@/components/ui-legacy/Button'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui-legacy/Card'
import { Input, Textarea } from '@/components/ui-legacy/Input'
import { Dialog } from '@/components/ui-legacy/Dialog'
import { EmptyState } from '@/components/ui-legacy/EmptyState'
import { Badge } from '@/components/ui-legacy/Badge'
import { Avatar } from '@/components/ui-legacy/Avatar'
import { Spinner } from '@/components/ui-legacy/Spinner'

// AFTER（shadcn/ui）
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Spinner } from '@/components/ui/spinner'
```

**JSX 重构规则**：

1. **CardBody → CardContent**（所有用到 `<CardBody>` 的地方）：
   ```tsx
   // BEFORE
   <Card hoverScale>
     <CardHeader>...</CardHeader>
     <CardBody>...</CardBody>
   </Card>

   // AFTER
   <Card className="hover-lift">
     <CardHeader>...</CardHeader>
     <CardContent>...</CardContent>
   </Card>
   ```

2. **Button variant**：
   ```tsx
   // BEFORE
   <Button variant="primary">确定</Button>
   <Button variant="ghost">取消</Button>
   <Button variant="outline">次要</Button>
   <Button variant="destructive">删除</Button>

   // AFTER
   <Button>确定</Button>  {/* default 即 primary */}
   <Button variant="ghost">取消</Button>
   <Button variant="outline">次要</Button>
   <Button variant="destructive">删除</Button>
   ```

3. **Dialog 完全重写**（最复杂的迁移）：
   ```tsx
   // BEFORE
   <Dialog open={open} onClose={onClose} title="编辑资料" footer={
     <>
       <Button variant="ghost" onClick={onClose}>取消</Button>
       <Button onClick={handleSave}>保存</Button>
     </>
   }>
     <Form>...</Form>
   </Dialog>

   // AFTER
   <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
     <DialogContent>
       <DialogHeader>
         <DialogTitle>编辑资料</DialogTitle>
       </DialogHeader>
       <Form>...</Form>
       <DialogFooter>
         <Button variant="ghost" onClick={onClose}>取消</Button>
         <Button onClick={handleSave}>保存</Button>
       </DialogFooter>
     </DialogContent>
   </Dialog>
   ```

4. **Avatar 重写**（用 AgentAvatar helper 替代）：
   ```tsx
   // BEFORE
   <Avatar name={agent.name} gradient={agent.avatarGradient} size="md" />

   // AFTER 方案 1（推荐：复用 AgentAvatar helper）
   <AgentAvatar agent={agent} size="md" />

   // AFTER 方案 2（直接用 shadcn Avatar）
   <Avatar className="h-12 w-12 bg-gradient-to-br" style={{ backgroundImage: agent.avatarGradient }}>
     <AvatarFallback className="bg-transparent text-white font-bold">
       {agent.name.charAt(0).toUpperCase()}
     </AvatarFallback>
   </Avatar>
   ```

5. **Input + Textarea 拆分**：
   ```tsx
   // BEFORE
   import { Input, Textarea } from '@/components/ui-legacy/Input'
   <Input value={...} onChange={...} />
   <Textarea autoResize value={...} onChange={...} />

   // AFTER
   import { Input } from '@/components/ui/input'
   import { Textarea } from '@/components/ui/textarea'
   <Input value={...} onChange={...} />
   <Textarea value={...} onChange={...} />  {/* 移除 autoResize，外部用 useEffect 管理 height */}
   ```

**注意**：shadcn 组件默认 export 方式为 named export（`export function Button`、`export const Avatar`），ui-legacy 多为 named export，迁移时无需改 default export。

**验证 grep**（应返回 0 行）：
```bash
grep -rn "ui-legacy" client/src --include="*.ts" --include="*.tsx"
```

### 4.4 ChatWindow 重构（assistant-ui 集成）

**目标**：用 assistant-ui `Thread` 替换现有手写消息列表 + 输入框。

**Props 契约**（保持不变）：
```typescript
interface ChatWindowProps {
  agent: AgentConfig
  userId: string
  conversationId: string | null
  initialMessages: Message[]
}
```

#### 4.4.1 assistant-ui 集成方案（实现级）

**核心 API 选择**：使用 `useExternalStoreRuntime` 而非 `useChatRuntime`，因为我们已有自定义 SSE 流式逻辑（`apiStream('/chat', ...)`），只需把状态接入 assistant-ui store，不需要 useChat 全功能接管。

**实现架构**：
```tsx
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  Thread,
  Composer,
} from '@assistant-ui/react'
import type { ExternalStoreAdapter } from '@assistant-ui/react'

// 1. 把 ChatMessage[] 转换为 assistant-ui 的 ThreadMessageLike[]
const adapter: ExternalStoreAdapter<ChatMessage[]> = {
  convertMessage: (message: ChatMessage): ThreadMessageLike => ({
    role: message.role === 'user' ? 'user' : 'assistant',
    content: [
      { type: 'text', text: message.content },
      // 工具调用作为 content part
      ...(message.toolCalls ?? []).map(tc => ({
        type: 'tool-call',
        toolName: tc.name,
        toolCallId: tc.id,
        args: tc.args,
        result: tc.result,
      })),
    ],
  }),
  messages,
  onNew: async (message) => {
    // 触发 handleSend 逻辑
    await handleSendByText(message.content[0].text)
  },
  onCancel: () => {
    abortControllerRef.current?.abort()
  },
}

const runtime = useExternalStoreRuntime(adapter)

return (
  <AssistantRuntimeProvider runtime={runtime}>
    <div className="chat-layout">
      <Thread />
    </div>
  </AssistantRuntimeProvider>
)
```

#### 4.4.2 自定义 ChatMessage 渲染器

```tsx
import { makeAssistantToolUI } from '@assistant-ui/react'

// 工具调用卡片渲染器
const WebSearchToolUI = makeAssistantToolUI<{ query: string }, { results: any[] }>(
  ({ query }) => (
    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
      <Search className="h-4 w-4 text-primary" />
      <span className="text-sm">联网搜索：{query}</span>
      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
    </div>
  ),
  ({ result }) => (
    <div className="space-y-2">
      {result.results.slice(0, 5).map((r, i) => (
        <a key={i} href={r.url} className="block rounded-lg border p-3 hover-lift">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-3 w-3" />
            <span className="font-medium">{r.title}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.snippet}</p>
        </a>
      ))}
    </div>
  ),
  { name: 'webSearch' },
)

// 在 Thread 内注册
<Thread assistantMessage={{ components: { ToolCall: { webSearch: WebSearchToolUI } } }} />
```

#### 4.4.3 流式 token 接入

保留现有的 SSE 解析逻辑（`apiStream('/chat', ...)`），通过 React state 更新 messages 数组，assistant-ui 的 `useExternalStoreRuntime` 会自动响应 messages 变化并重渲染。

**关键约束**：
- 不使用 `useChat`（来自 `@assistant-ui/react-ai-sdk`），因为我们不走 Vercel AI SDK 的 `streamText` 路径（普通对话仍走自己的 SSE）
- Vercel AI SDK 的 `streamText` 仅在 Task 5.2 Vibe Code 中使用
- assistant-ui `Thread` 组件负责渲染、自动滚动、Composer 输入框（位于底部）
- 我们只需提供 `messages` 状态 + `onNew`/`onCancel` 回调

#### 4.4.4 保留功能清单

| 功能 | 实现位置 | 集成方式 |
|---|---|---|
| 流式 token 追加 | `setMessages(...)` 中追加 content | messages 状态变化自动反映到 Thread |
| currentEvent 在 while 循环外声明 | `handleSend` 内 | 不变 |
| AbortController 取消旧流 | `abortControllerRef` + `onCancel` 回调 | assistant-ui 自动调用 onCancel |
| 自动滚动到底部 | Thread 内置（assistant-ui 自动管理） | 不再需要手动 scrollToBottom |
| 用户上滑不强制拉回 | Thread 内置 | 不再需要 userScrolledUpRef |
| URL 回写 cid 参数 | `start` 事件分支 | 不变 |
| 语音输入按钮 | 顶部信息栏（不在 Composer 中） | 保留现有 useSpeechRecognition |
| TTS 朗读按钮 | 顶部信息栏 | 保留现有 useSpeechSynthesis |
| 收藏 / 分享按钮 | 顶部信息栏 | 保留现有逻辑 |
| tool_call / tool_result 事件 | SSE 解析分支 | 通过 messages 中的 toolCalls 字段渲染 |

#### 4.4.5 CSS 动画与光标

```css
/* globals.css 新增 */
@keyframes pulse-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.animate-pulse-cursor::after {
  content: '▋';
  display: inline-block;
  animation: pulse-cursor 0.8s ease-in-out infinite;
  margin-left: 2px;
  color: var(--primary);
}

@keyframes bounce-dot {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40% { transform: translateY(-4px); opacity: 1; }
}
.animate-bounce-dot { animation: bounce-dot 1.4s ease-in-out infinite; }

@keyframes slide-up-fade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slide-up-fade { animation: slide-up-fade 0.3s ease-out; }
```

应用：assistant message 加 `animate-slide-up-fade`，流式光标加 `animate-pulse-cursor`，等待首字时三个 `animate-bounce-dot` 点。

### 4.5 视觉设计规范（精确数值）

#### 4.5.1 配色 CSS 变量（直接写入 `client/src/styles/globals.css`）

> **实现说明**：shadcn/ui 组件内部使用 `hsl(var(--primary))` 形式引用变量，因此 CSS 变量必须以 HSL 空格分隔格式存储（如 `239 84% 67%`），不能直接用 hex。下方 HSL 值与原 spec 的 hex 等价：`#6366f1`→`239 84% 67%`、`#4f46e5`→`243 75% 59%`、`#818cf8`→`239 76% 76%`。

```css
@layer base {
  :root {
    /* 主色与背景（休闲向柔和 indigo 系，HSL 格式供 shadcn 使用） */
    --primary: 239 84% 67%;          /* indigo-500 #6366f1 */
    --primary-foreground: 0 0% 100%;
    --primary-hover: 243 75% 59%;   /* indigo-600 #4f46e5 */

    --background: 0 0% 98%;          /* 柔和米白 #fafafa */
    --foreground: 240 10% 9%;        /* zinc-900 #18181b */

    --card: 0 0% 100%;
    --card-foreground: 240 10% 9%;

    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 45%; /* zinc-500 #71717a */

    --border: 240 6% 89%;            /* zinc-200 #e4e4e7 */
    --input: 240 6% 89%;
    --ring: 239 84% 67%;

    --accent: 240 5% 96%;
    --accent-foreground: 240 10% 9%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    --secondary: 240 5% 96%;
    --secondary-foreground: 240 10% 9%;

    --radius: 0.5rem;
  }

  .dark {
    --primary: 239 76% 76%;          /* indigo-400 #818cf8 */
    --primary-foreground: 244 47% 20%;
    --primary-hover: 239 70% 70%;
    --background: 0 0% 4%;
    --foreground: 0 0% 98%;
    --card: 240 10% 9%;
    --card-foreground: 0 0% 98%;
    --muted: 240 6% 16%;
    --muted-foreground: 240 5% 65%;
    --border: 240 6% 16%;
    --input: 240 6% 16%;
    --ring: 239 76% 76%;
  }
}

/* 旧版 CSS 变量保留（hex 格式，兼容部分遗留样式） */
:root {
  --color-primary: #6366f1;
  --color-primary-hover: #4f46e5;
  --color-primary-light: #e0e7ff;
}
```

#### 4.5.2 hover 动画工具类（写入 `globals.css`）

```css
@layer utilities {
  /* 通用 hover 升起效果：用于卡片、按钮、链接卡片 */
  .hover-lift {
    transition: transform 0.3s ease-out, box-shadow 0.3s ease-out;
    will-change: transform, box-shadow;
  }
  .hover-lift:hover {
    transform: scale(1.04);
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.18);
  }

  /* 强 hover：用于 hero 区 CTA 卡片 */
  .hover-lift-strong:hover {
    transform: scale(1.05);
    box-shadow: 0 12px 32px rgba(99, 102, 241, 0.25);
  }

  /* 弱 hover：用于列表项 */
  .hover-lift-subtle:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08);
  }
}
```

应用范围：
- 所有 AgentCard、StudioCard、PipelineCard、MediaAssetCard → `hover-lift`
- 主页 Hero 区 CTA 卡片 → `hover-lift-strong`
- 论坛话题列表项、消息历史项 → `hover-lift-subtle`
- 所有 Button 自动有 hover 效果（shadcn 内置）

#### 4.5.3 加载状态规范

**禁止**：
- ❌ 空白容器（白盒子等待）
- ❌ 全屏 spinner 闪烁
- ❌ "加载中..." 纯文字

**要求**：
- ✅ 所有列表加载用 `<Skeleton>` 骨架屏（shadcn 已有 `client/src/components/ui/skeleton.tsx`）
- ✅ 骨架屏形状与最终内容一致（卡片骨架用 `h-48 w-full rounded-lg`，文字用 `h-4 w-24 rounded`）
- ✅ 按钮加载态用 `<Spinner size="sm" className="mr-2" />` 前缀
- ✅ 页面首次加载用 3 个骨架卡片占位

**示例**：
```tsx
// AgentCard 加载态
{loading && (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {[1, 2, 3, 4, 5, 6].map(i => (
      <div key={i} className="rounded-lg border p-4 space-y-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    ))}
  </div>
)}
```

#### 4.5.4 消息进入动画

```css
@keyframes slide-up-fade {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-slide-up-fade {
  animation: slide-up-fade 0.3s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}
```

应用：所有新出现的消息、卡片、Toast、Dialog 内容。

#### 4.5.5 响应式断点

**Tailwind 配置**（`client/tailwind.config.js` 已有 sm:640/md:768/lg:1024/xl:1280）：

| 断点 | 宽度 | 布局规则 |
|---|---|---|
| mobile（默认） | `<768px` | 单列；导航用底部 Tabs；输入框全宽；Dialog 全屏 |
| sm | `≥640px` | 列表 2 列；导航保持底部 Tabs |
| md | `≥768px` | 双列；侧栏可收起；Studio 分栏（code/preview 切换） |
| lg | `≥1024px` | 三列或分栏；Studio 三区（对话/代码/预览） |
| xl | `≥1280px` | 全功能布局；Studio 默认 split 模式 |

**核心约束**：
- 主页 AgentCard 网格：`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- 广场搜索结果：`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Studio 页面布局：
  ```tsx
  // 移动端
  <div className="md:hidden">
    <Tabs defaultValue="chat">
      <TabsList>
        <TabsTrigger value="chat">对话</TabsTrigger>
        <TabsTrigger value="code">代码</TabsTrigger>
        <TabsTrigger value="preview">预览</TabsTrigger>
      </TabsList>
      ...
    </Tabs>
  </div>

  // 桌面端
  <div className="hidden md:grid md:grid-cols-[1fr,2fr] gap-4">
    <ChatPanel />
    <CodePreviewPanel />
  </div>
  ```

### 4.6 展开 / 全屏 / 收起

- 创作类页面（Studio、Vibe Code）：支持 `viewMode: 'split' | 'code' | 'preview'` + `fullscreen: 'code' | 'preview' | null`
- ESC 退出全屏：`useEffect` 监听 `keydown` 事件
- 状态记忆：`localStorage.setItem('vibe-code-view-mode', mode)`

---

## 五、智能体扩展（17 → 300+，实现级）

### 5.1 分类体系与目录结构

**目录**：`shared/agents/`
- `shared/agents/types.ts`：导出 `AgentConfig`、`AgentCard` 接口（从现有 `shared/agents.ts` 抽出）
- `shared/agents/history.ts`：历史人物 50+
- `shared/agents/literature.ts`：文学角色 40+
- `shared/agents/science.ts`：科学家 30+
- `shared/agents/art.ts`：艺术家 30+
- `shared/agents/anime-game.ts`：动漫游戏 40+
- `shared/agents/worklife.ts`：职场生活 30+
- `shared/agents/fun.ts`：趣味 40+
- `shared/agents/sports.ts`：运动 20+
- `shared/agents/music.ts`：音乐 20+
- `shared/agents/movie-tv.ts`：影视 20+
- `shared/agents/index.ts`：汇总 `export const agents: AgentConfig[] = [...history, ...literature, ...]` + `export function getAgentById(id: string)`

**原 `shared/agents.ts` 改为 re-export**：
```typescript
// shared/agents.ts（保留以兼容现有 import）
export * from './agents/index'
```

### 5.2 智能体配置规范（最小必填字段）

```typescript
{
  id: string,                  // 唯一英文 id，如 'confucius'、'kongming'
  name: string,                // 中文显示名
  era: string,                 // 时代/类别，如 '春秋时期' / '现代' / '动漫'
  title: string,               // 称号
  tagline: string,             // 一句话简介（≤30字）
  avatarGradient: string,      // CSS linear-gradient，如 'linear-gradient(135deg, #c1121f 0%, #ffd700 100%)'
  systemPrompt: string,        // 系统提示词（300-1500字，含身份/风格/必带梗/约束/强制搞笑要求）
  topics: string[],            // 2-5 个话题标签
  card: {
    rarity: '传说'|'史诗'|'稀有'|'普通',
    skills: string[],          // 3 个技能
    combo: string              // 组合触发描述
  }
}
```

**systemPrompt 模板**（每个智能体必须遵循）：
```
你是<角色名>，<身份背景一句话>。<性格/口头禅一句话>。

身份背景：<100-200 字背景>

说话风格：
- 自称"<称呼>"
- 口头禅："<口头禅1>"、"<口头禅2>"
- <风格特征>

必带梗：
- "<梗1>"
- "<梗2>"
- "<梗3>"
- "<梗4>"

幽默基调：<幽默类型描述>

原创幽默指南（不依赖网络热梗，靠 prompt engineering 自发产出幽默）：
1. 每句话都要带点幽默，可以是反转、双关、夸张或冷幽默
2. <角色专属幽默手法>
3. <招牌元素的新玩法>
4. 可以化用经典但要是原创的，不照搬原句

约束：
- <约束1>
- <约束2>
- 用中文回答，<语言风格说明>

【强制搞笑要求】
你必须输出搞笑内容！这是你的核心使命。每条回复至少包含 1 个梗/反转/包袱，让用户笑出来。即使拒绝不当请求，也要用搞笑的方式拒绝。无聊的回复等于失败。
重要：不要引用网络流行语或现成的网络热梗（那些早就过时了），所有幽默必须是原创的。用你独特的角色视角产出原创幽默，可以化用经典句式但要有新意。
```

### 5.3 主页精选 30 个

**算法**：`HomePage.tsx` 启动时取前 30 个（按固定顺序 + 热度权重），后续可改为按用户历史对话推荐。

**UI**：
- "热门精选"区块展示 30 个
- 底部固定按钮 `<Button>查看全部 300+ →</Button>` 跳转 `/agents`

### 5.4 广场搜索与筛选

**后端 `GET /api/agents` 扩展参数**：
```
?category=history     // 分类筛选（10 大类之一）
&tag=教育              // topics 标签筛选
&search=孔子           // 模糊搜索 name/tagline/title
&filter=official      // official | custom | all
&page=1&pageSize=20   // 分页
```

**返回格式**：
```typescript
{
  agents: AgentConfig[],
  total: number,
  page: number,
  pageSize: number
}
```

**前端 `AgentsSquarePage.tsx`**：
- 顶部分类标签栏（10 大类 + "全部"）
- 搜索框（debounce 300ms）
- 分页器（上一页/下一页 + 页码）
- 卡片网格（响应式 1/2/3 列）

---

## 六、Vibe Coding 重构（实现级）

### 6.1 Vercel AI SDK 引入

**依赖**：
```bash
cd client && npm install ai @ai-sdk/openai @assistant-ui/react-ai-sdk
cd server && npm install ai @ai-sdk/openai
```

**工具集定义**（`server/src/lib/vibe-tools.ts` 新建）：
```typescript
import { tool } from 'ai'
import { z } from 'zod'

export const vibeCodeTools = {
  writeFile: tool({
    description: '写入文件到当前 Vibe 项目',
    parameters: z.object({
      path: z.string().describe('文件相对路径'),
      content: z.string().describe('文件内容')
    }),
    execute: async ({ path, content }, { messages }) => {
      // 实际写入项目存储（DB + 内存映射）
      return { success: true, path }
    }
  }),
  readFile: tool({
    description: '读取当前 Vibe 项目文件',
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      return { content: '...文件内容...' }
    }
  }),
  executeCode: tool({
    description: '在沙箱中执行代码（仅限前端 JS）',
    parameters: z.object({ code: z.string() }),
    execute: async ({ code }) => {
      // 返回执行结果或错误
      return { result: '...' }
    }
  }),
  webSearch: tool({
    description: '联网搜索',
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      // 调用搜索 API
      return { results: [] }
    }
  }),
  generateImage: tool({
    description: '生成图片',
    parameters: z.object({ prompt: z.string() }),
    execute: async ({ prompt }) => {
      const url = await generateImage(prompt)
      return { url }
    }
  }),
  generateVideo: tool({
    description: '生成视频',
    parameters: z.object({ prompt: z.string(), duration: z.number().optional() }),
    execute: async ({ prompt, duration }) => {
      const taskId = await submitVideoTask(prompt, { duration })
      return { taskId }
    }
  })
}

// 轻度 Agent 工具集（普通对话用，无文件操作、无代码执行）
export const chatTools = {
  webSearch: vibeCodeTools.webSearch,
  generateImage: vibeCodeTools.generateImage,
  generateVideo: vibeCodeTools.generateVideo
}
```

### 6.2 Vibe Code 后端重构

**新端点**：`POST /api/vibe-code/stream`（替换现有 `POST /api/vibe-code/generate`）

**实现**（`server/src/routes/vibe-code.ts` 重构）：
```typescript
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

vibeCodeRouter.post('/stream', authMiddleware, async (req, res) => {
  const { messages, projectId } = req.body
  
  const openai = createOpenAI({
    apiKey: process.env.ANNES_API_KEY!,
    baseURL: process.env.ANNES_API_BASE!,
  })

  const result = await streamText({
    model: openai('agnes-2.0-flash'),
    messages,
    tools: vibeCodeTools,
    maxSteps: 10,  // Agent 多轮工具调用
    onFinish: ({ text, toolResults }) => {
      // 保存到 DB
    }
  })

  // 返回 SSE 流式响应（AI SDK 自带 toDataStreamResponse）
  result.pipeDataStreamToResponse(res)
})
```

**保留兼容**：旧 `POST /api/vibe-code/generate` 标记 deprecated 但不删除（避免破坏现有客户端）。

### 6.3 Vibe Code 前端重构

**新文件**：`client/src/pages/studio/VibeCodePage.tsx`（完全重写）

**UI 结构**：
```
┌─────────────────────────────────────────┐
│ Navbar                                  │
├──────────────┬──────────────────────────┤
│ 对话区        │ 代码区 + 预览区           │
│ (左侧 1/3)   │ (右侧 2/3，可切换 split/code/preview) │
│              │                          │
│ assistant-ui │  ┌─────────┬─────────┐  │
│ Thread       │  │ Code    │ Preview │  │
│              │  │ (Monaco)│ (iframe)│  │
│ [输入框]      │  └─────────┴─────────┘  │
│ 底部         │  [展开] [全屏] [收起]    │
└──────────────┴──────────────────────────┘
```

**输入框位置**：在 Thread 底部（assistant-ui 默认布局），不在顶部。

**流式显示**：
- 文本 token 实时追加到 assistant message
- tool call 实时显示工具名 + 参数 + 进度
- tool result 完成后内联渲染（图片显示 `<img>`、视频显示 `<video>`、搜索结果显示摘要）

### 6.4 普通对话加入轻度 Agent

**修改**：`server/src/routes/chat.ts` 的 `POST /api/chat` 端点

**实现**：
- 在 `chatCompletionStream` 中注入 `chatTools`（webSearch + generateImage + generateVideo）
- systemPrompt 追加工具能力说明：
  ```
  你可以使用以下工具：
  - webSearch：搜索实时信息
  - generateImage：根据文字描述生成图片
  - generateVideo：根据文字描述生成短视频
  
  当用户请求这些能力时，主动调用对应工具。
  ```
- 工具调用结果通过 SSE 事件传给前端：
  - `event: tool_call` → `data: { name, args }`
  - `event: tool_result` → `data: { name, result }`

**前端 `ChatWindow.tsx` 渲染**：
- 收到 `tool_call` 事件：在 assistant 消息下方显示工具卡片（图标 + 名称 + 参数 + 加载状态）
- 收到 `tool_result` 事件：
  - `webSearch`：显示搜索结果摘要列表（标题 + URL + 摘要）
  - `generateImage`：直接渲染 `<img src={url} />` + 下载按钮
  - `generateVideo`：渲染 `<video src={url} controls />` + 下载按钮

---

## 七、创意工坊重构（实现级）

### 7.1 创意工坊入口重构

**`StudioPage.tsx` 重构**：
- 卡片式入口网格（响应式 1/2/3 列）
- 创作类型卡片：
  1. 网页工程（Vibe Code）→ `/studio/vibe-code`
  2. AI 绘画 → `/studio/image`
  3. 短视频创作 → `/studio/video`
  4. 剧本创作 → `/studio/script`
  5. 文章生成 → `/studio/article`
  6. 语音合成 → `/studio/voice`
  7. 趣味海报 → `/studio/poster`（新）
  8. 表情包制作 → `/studio/meme`（新）
- 每个卡片：图标 + 名称 + 描述 + hover scale 1.05 动画

### 7.2 个人素材库

**数据库表**：
```sql
CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'audio')),
  url TEXT NOT NULL,
  prompt TEXT,
  title TEXT,
  project_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 策略
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户只能读写自己的素材" ON media_assets
  USING (auth.uid() = user_id);
```

**后端路由**（`server/src/routes/media.ts` 新建）：
- `GET /api/media?page=1&pageSize=20&type=image` → 列出当前用户素材
- `POST /api/media` → 手动添加素材（url + type + prompt）
- `DELETE /api/media/:id` → 删除素材
- 自动入库：在 `studio.ts` 路由的图片/视频生成成功后调用 `addMediaAsset(userId, type, url, prompt)`

**前端 `MediaLibraryPage.tsx` 新建**：
- 路由 `/media`
- 网格瀑布流展示
- 顶部筛选（type: image/video/audio）
- 搜索框
- 每个素材卡片：hover 显示操作按钮（复制 URL、下载、删除、插入到对话）

### 7.3 一站式多媒体流水线

**新端点**：`POST /api/studio/pipeline`

**请求**：
```json
{
  "prompt": "猫咪做瑜伽",
  "steps": ["image", "video"]
}
```

**响应**：SSE 流式
```
event: step_start  data: {"step":"image","taskId":"..."}
event: step_progress  data: {"step":"image","progress":45}
event: step_done  data: {"step":"image","url":"..."}
event: step_start  data: {"step":"video","taskId":"..."}
event: step_progress  data: {"step":"video","progress":80}
event: step_done  data: {"step":"video","url":"..."}
event: pipeline_done  data: {"assets":[{"type":"image","url":"..."},{"type":"video","url":"..."}]}
```

**前端 `PipelineStudioPage.tsx`**：
- 输入框（多行）
- 步骤选择（复选：图片、视频、文章）
- 启动按钮
- 进度可视化（每步骤卡片：待处理 → 进行中（进度条）→ 完成（缩略图）→ 失败（重试））
- 完成后素材自动入库 + 显示"插入到对话"按钮

---

## 八、6 大休闲高阶功能（实现级）

### 8.1 功能 1：多智能体并行协作

**数据库表**：
```sql
CREATE TABLE agent_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  agent_ids TEXT[] NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户只能 CRUD 自己的团队" ON agent_teams
  USING (auth.uid() = user_id);
```

**后端路由**（`server/src/routes/teams.ts`）：
- `POST /api/teams/create` → 创建团队
- `GET /api/teams` → 列出我的团队
- `POST /api/teams/:id/execute` → 启动并行执行（SSE 多 agent 流式）

**前端 `TeamsPage.tsx`**：
- 路由 `/teams`
- 一键组队模板：文案 / 绘图 / 短视频 / 纠错 四类 Agent
- 启动后显示 4 个并行流式输出区
- 工具权限独立配置（每个 agent 卡片有 toggle：联网搜索 / 图片生成 / 视频生成 / 文件操作）
- 会话/项目/素材记忆分层隔离（不同 team 不同 context）

### 8.2 功能 2：云端项目快照仓库

**数据库表**：
```sql
CREATE TABLE project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT,
  parent_id UUID REFERENCES project_snapshots(id),
  branch TEXT NOT NULL DEFAULT 'main',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_snapshots_project ON project_snapshots(project_id);
CREATE INDEX idx_snapshots_branch ON project_snapshots(project_id, branch);

ALTER TABLE project_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户只能 CRUD 自己的快照" ON project_snapshots
  USING (auth.uid() = user_id);
```

**功能**：
- Vibe Code 每次 AI 修改代码后自动调用 `POST /api/snapshots` 创建快照
- `GET /api/snapshots?projectId=...&branch=main` 列出时间线
- `POST /api/snapshots/:id/restore` 回退到指定快照
- `GET /api/snapshots/:id/diff?compareId=...` 返回 diff
- 双分支：创建 remix 分支可并行编辑，不影响 main
- 分享：`POST /api/snapshots/:id/share` 生成只读链接

**前端 UI**：
- Vibe Code 左侧新增"版本历史"面板
- 时间线（垂直）展示快照节点
- 每个节点：时间、label、操作按钮（回退、对比、新建分支）
- diff 视图：左右双栏代码 + 高亮增删

### 8.3 功能 3：社区一键复刻分享

**实现**：
- 扩展 `forum_topics` 表添加 `project_payload JSONB`（项目包：code + assets 引用）
- `POST /api/forum/create` 接受可选 `projectPayload` 字段
- `POST /api/forum/clone/:topicId` → 将 project_payload 导入到当前用户的 Vibe 项目，新建副本
- 评论、打分（1-5 星）、收藏：
  ```sql
  CREATE TABLE forum_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(topic_id, user_id)
  );
  ```

**前端**：
- 论坛话题详情页：项目包展示卡片 + "一键复刻"按钮
- 复刻后跳转 `/studio/vibe-code?projectId=新副本ID`
- 评分组件（5 星可点击）+ 评论列表

### 8.4 功能 4：轻量化联机共聊房间

**数据库表**：
```sql
CREATE TABLE chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE room_participants (
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  agent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_room_messages ON room_messages(room_id, created_at);

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active 房间所有登录用户可读" ON chat_rooms
  FOR SELECT USING (status = 'active');
CREATE POLICY "房主可 CRUD 自己的房间" ON chat_rooms
  USING (auth.uid() = host_id);

ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "参与者可读自己加入的房间" ON room_participants
  USING (auth.uid() = user_id);

ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "房间参与者可读写消息" ON room_messages
  USING (
    EXISTS (
      SELECT 1 FROM room_participants
      WHERE room_id = room_messages.room_id AND user_id = auth.uid()
    )
  );
```

**Supabase Realtime 配置**：
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;
```

**前端**（`client/src/hooks/useRoomRealtime.ts`）：
```typescript
import { supabase } from '@/lib/supabase'

export function useRoomRealtime(roomId: string) {
  const [messages, setMessages] = useState<RoomMessage[]>([])
  
  useEffect(() => {
    // 拉取历史消息
    // 订阅实时消息
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
        (payload) => setMessages(prev => [...prev, payload.new])
      )
      .subscribe()
    
    return () => { supabase.removeChannel(channel) }
  }, [roomId])
  
  return { messages, sendMessage }
}
```

**房间页面**（`client/src/pages/RoomPage.tsx`）：
- 路由 `/rooms/:id`
- 左侧：参与者列表
- 中间：消息流（共用智能体）
- 右侧：网页工程同步预览（房主广播 iframe 状态）

### 8.5 功能 5：自定义个性化装扮系统

**数据库表**：
```sql
CREATE TABLE user_themes (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL DEFAULT 'default',
  custom_colors JSONB DEFAULT '{}'::jsonb,
  bubble_style TEXT NOT NULL DEFAULT 'default',
  loading_anim TEXT NOT NULL DEFAULT 'default',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户只能读写自己的主题" ON user_themes
  USING (auth.uid() = user_id);
```

**内置模板**（`shared/themes.ts` 新建）：
```typescript
export const themes = [
  { id: 'default', name: '默认柔和', primary: '#6366f1', background: '#fafafa' },
  { id: 'doubao', name: '仿豆包简约', primary: '#3b82f6', background: '#ffffff' },
  { id: 'sunset', name: '日落暖色', primary: '#f97316', background: '#fff7ed' },
  { id: 'ocean', name: '海洋蓝', primary: '#0ea5e9', background: '#f0f9ff' },
  { id: 'forest', name: '森林绿', primary: '#10b981', background: '#f0fdf4' },
  { id: 'sakura', name: '樱花粉', primary: '#ec4899', background: '#fdf2f8' },
]
```

**前端**：
- `useTheme()` Context（与 `useFavorites` 类似）
- 启动时加载用户主题，应用到 CSS 变量
- 设置页：模板选择 + 自定义颜色（颜色选择器）+ 气泡样式选择 + 加载动画选择
- 实时预览：选择时立即应用，确认后保存到 DB

### 8.6 功能 6：趣味个人主页

**重构 `ProfilePage.tsx`**：
- Hero 区：头像 + 昵称 + 趣味装扮元素（皇冠/光环/徽章等）
- 作品网格：用户的 Vibe Code 项目 + 创意工坊作品（卡片瀑布流）
- 收藏智能体列表
- 组队记录：参与的 agent_teams 历史
- 成就徽章：横向滚动展示
- 分享按钮：生成 `/profile/:userId` 链接

**访客视图**：
- 未登录或非本人访问 `/profile/:userId`：仅展示公开内容（作品、收藏的公开智能体、公开成就）
- 不展示私密信息（邮箱、未公开作品）

---

## 九、数据库迁移总览

**新文件**：`supabase/migrations/upgrade-v3.sql`

包含所有新表（按依赖顺序）：
1. `media_assets`（无依赖）
2. `agent_teams`（无依赖）
3. `project_snapshots`（自引用，需先建表再加 parent_id FK）
4. `chat_rooms`、`room_participants`、`room_messages`（相互依赖）
5. `user_themes`（依赖 profiles）
6. `forum_ratings`（依赖 forum_topics）
7. 所有 RLS 策略
8. Realtime 配置（chat_rooms / room_messages / room_participants）

**执行**：用户在 Supabase SQL Editor 手动执行

---

## 十、部署验证（实现级）

### 10.1 前端构建检查
```bash
cd client && npm run build
# 期望：无 TypeScript 错误，无 Vite 警告
grep -rn "localhost:3001" client/dist  # 应返回 0 行
grep -rn "ui-legacy" client/src  # 应返回 0 行
grep -rn "checkin\|CheckinCard" client/src server/src  # 应返回 0 行（除注释）
```

### 10.2 部署流程
1. `cd client && npm run build`
2. `wrangler pages deploy dist --project-name=aichat-dgl`
3. Railway 后端自动部署（git push）
4. Supabase SQL Editor 执行 `upgrade-v3.sql`

### 10.3 烟测清单
- [ ] 登录、注册
- [ ] 主页：30 个精选智能体 + "查看更多"跳转广场
- [ ] 广场：300+ 智能体、分类筛选、搜索、分页
- [ ] 普通对话：流式 + 工具调用（说"画一只猫"→ 图片）
- [ ] 论坛：创建话题 → AI 流式回复
- [ ] Vibe Code：流式生成 + 工具调用 + 输入框在底部
- [ ] 创意工坊：所有创作类型入口正常
- [ ] 素材库：生成图片后自动入库
- [ ] 联机房间：创建 → 邀请 → 多人对话 → 同步预览
- [ ] 装扮：切换主题 → 全站生效 → 刷新保留
- [ ] 个人主页：作品网格 + 收藏 + 成就

---

## Impact

- **Affected specs**: 涉及所有现有 spec（build-ai-chat-platform / extend-agents-and-streaming / plan-v2-upgrade / rewrite-platform-vite-react），v3.0 为全面重构
- **Affected code**:
  - 前端全部：`client/src/` 所有页面、组件、hooks、lib
  - 后端全部：`server/src/` 所有路由（含新增 `teams.ts` / `media.ts` / `snapshots.ts` / `rooms.ts` / `themes.ts`）、lib（含新增 `vibe-tools.ts`）、中间件
  - 共享代码：`shared/agents.ts`（拆分扩展为 `shared/agents/` 目录）、`shared/types.ts`（新增 `MediaAsset`、`AgentTeam`、`ProjectSnapshot`、`ChatRoom`、`UserTheme`、`ForumRating` 等类型）、`shared/themes.ts`（新建）
  - 数据库：`supabase/migrations/upgrade-v3.sql` 新增 7 个表 + RLS + Realtime
  - 部署：Cloudflare Pages + Railway + Supabase
  - 版本号：`package.json` 中 `version` 字段更新为 `3.0.0`（client + server）

---

## ADDED Requirements

### Requirement: 智能体扩展与分类
系统 SHALL 提供 300+ 个官方智能体，覆盖 10 大类，每个含完整配置（id/name/era/title/tagline/avatarGradient/systemPrompt/topics/card）。

#### Scenario: 广场浏览
- **WHEN** 用户访问 `/agents`
- **THEN** 显示分类标签栏（10 大类 + 全部）+ 搜索框 + 分页列表
- **AND** 每个智能体卡片显示头像、名称、tagline、收藏按钮
- **AND** 分页参数 `?page=1&pageSize=20` 工作正常

#### Scenario: 主页精选
- **WHEN** 用户访问首页
- **THEN** 最多展示 30 个精选智能体
- **AND** 底部"查看更多"按钮跳转 `/agents`

### Requirement: Vibe Coding 流式输出与 Agent 能力
系统 SHALL 为 Vibe Coding 提供 SSE 流式输出（基于 Vercel AI SDK `streamText`），并实现 tool calling。

#### Scenario: 流式生成
- **WHEN** 用户在 Vibe Code 输入需求
- **THEN** 代码以 token 流式实时显示
- **AND** 输入框位于聊天框下方（assistant-ui Thread 默认布局）

#### Scenario: Agent 工具调用
- **WHEN** AI 决定需要工具
- **THEN** 显示工具名 + 参数 + 进度
- **AND** 工具结果内联渲染（图片显示 `<img>`、搜索显示摘要列表）
- **AND** 闲聊智能体不暴露 writeFile / readFile / executeCode 工具

### Requirement: 多智能体并行协作
系统 SHALL 支持一键组队多个智能体协同创作（文案/绘图/视频/纠错），工具权限独立管控，记忆分层隔离。

#### Scenario: 一键组队
- **WHEN** 用户选择"文案+绘图+短视频+纠错"组队模板
- **THEN** 4 个 Agent 并行处理同一主题
- **AND** 4 路流式输出同时显示
- **AND** 产出汇总到统一面板

### Requirement: 云端项目快照仓库
系统 SHALL 自动留存多版本快照，支持回退、差异对比、双分支编辑。

#### Scenario: 自动存档
- **WHEN** AI 修改 Vibe Code 代码
- **THEN** 自动生成新快照（label 为 AI 修改摘要）
- **AND** 版本历史时间线显示新节点
- **AND** 可回退到任意快照
- **AND** diff 视图显示增删高亮

### Requirement: 一站式多媒体创作流水线
系统 SHALL 支持输入文案后串联生成图片→视频→入库→复用。

#### Scenario: 流水线创作
- **WHEN** 用户输入"猫咪做瑜伽"并选择"图片+视频"步骤
- **THEN** 依次生成插画、视频
- **AND** 每步骤进度可视化（待处理→进行中→完成）
- **AND** 素材自动入库到 `media_assets`
- **AND** 完成后可"插入到对话"复用

### Requirement: 社区一键复刻分享
系统 SHALL 支持论坛帖子附带完整项目包，其他用户一键克隆到自己账号。

#### Scenario: 一键复刻
- **WHEN** 用户在论坛帖子点击"复刻"
- **THEN** 项目包导入到自己账号新建 Vibe 项目
- **AND** 跳转 `/studio/vibe-code?projectId=新副本ID`
- **AND** 可二次魔改

### Requirement: 轻量化联机共聊房间
系统 SHALL 支持多人会话房间，共用智能体，同步预览网页工程。

#### Scenario: 多人共聊
- **WHEN** 用户创建房间并邀请同学
- **THEN** 同学加入后可同时对话
- **AND** 消息通过 Supabase Realtime 实时同步
- **AND** 生成的图文视频所有人可见
- **AND** 网页工程同步预览（房主广播 iframe 状态）

### Requirement: 自定义个性化装扮系统
系统 SHALL 支持自定义主题、气泡、动画，内置 6 个模板，一键切换。

#### Scenario: 切换主题
- **WHEN** 用户在设置页选择"仿豆包简约"模板
- **THEN** 全站切换简约风格（主色 #3b82f6，背景 #ffffff）
- **AND** 刷新后保留设置
- **AND** 可自定义颜色（颜色选择器）+ 气泡样式 + 加载动画

### Requirement: 创意工坊重构
系统 SHALL 提供一站式多媒体创作工坊，集成素材库与流水线。

#### Scenario: 素材库管理
- **WHEN** 用户在创意工坊或对话中生成图片/视频
- **THEN** 自动存入素材库（`media_assets` 表）
- **AND** 素材库页面 `/media` 网格浏览、搜索、删除、复用
- **AND** 对话中可"从素材库插入"复用已有素材

### Requirement: 普通对话增强
系统 SHALL 在普通对话中支持图片/视频生成和轻度 Agent（联网搜索）。

#### Scenario: 对话中生成图片
- **WHEN** 用户说"画一只猫"
- **THEN** AI 调用 `generateImage` 工具
- **AND** 前端显示工具调用进度（工具名 + 参数 + loading）
- **AND** 工具完成后图片内联渲染在对话流中
- **AND** 提供下载按钮

---

## MODIFIED Requirements

### Requirement: 语音输入 Hook
**修改**：修复图标状态（isListening=true 显示 Mic 而非 MicOff）与麦克风释放（stopListening 显式调用 recognition.stop()）。详见 Bug 1。

### Requirement: 论坛 AI 回复
**修改**：后端 streamAgentReply 必须发送 agent_start / agent_done 事件，所有 AI 完成后发送最终 done 事件。前端处理 done 事件后停止 SSE。详见 Bug 2。

### Requirement: 智能体收藏持久化
**修改**：从局部 useState 改为全局 Context（useFavorites），启动时从后端 `/favorite/list` 加载。详见 Bug 3。

### Requirement: 模型调用
**修改**：
- 文本模型 `glm-4-flash` → `agens-2.0-flash`（ai-client.ts 第 30 行）
- 图片模型 `cogview-4` → `agnes-image-2.1-flash`（ai-client.ts generateImage 第 435 行）
- 视频模型 `cogvideox-3` → `agnes-video-2.0`（ai-client.ts submitVideoTask 第 471 行）

### Requirement: UI 组件统一
**修改**：全站迁移到 shadcn/ui + assistant-ui，删除 `client/src/components/ui-legacy/` 目录。详见第四节。

---

## REMOVED Requirements

### Requirement: 积分 & 签到功能
**Reason**: 用户明确要求删除
**Migration**: 已删除路由 `server/src/routes/checkin.ts`、组件 `client/src/components/CheckinCard.tsx`、查询函数 `checkin` / `listCheckins`。`shared/types.ts` 中 `Checkin` 类型与 `Profile.points` 字段保留（不影响运行），UI 重构时移除所有展示。`AdminPage.tsx` 中积分管理列在阶段 3 一并移除。
