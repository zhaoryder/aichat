# 创意工坊 API 修复 + Vibe Coding Agent 重构 + UX 优化

## Summary

修复创意工坊的 4 个核心问题：
1. **API 问题**：语音合成 404（endpoint 路径拼错）、AI 视频无声（缺 `with_audio` 参数）、时长限制提示不当
2. **Vibe Coding 无 Agent 能力**：当前是单轮文生代码，需重构为完整 Tool Calling + 多轮对话
3. **进度条缺失**：图片/语音生成无进度条，视频进度条无百分比
4. **UX 差**：无展开/全屏/收起控件、按钮堆叠、平板(md)全线无适配

## Current State Analysis

### API 现状（基于 `server/src/lib/ai-client.ts`）

| 功能 | 模型 | endpoint | 问题 |
|------|------|----------|------|
| 语音合成 | `cogtts` | `${baseURL}/audio/speeches` | **404**：路径应为 `/audio/speech`（单数） |
| 视频生成 | `cogvideox-flash` | `${baseURL}/videos/generations` | **无声**：缺 `with_audio: true` 参数 |
| 视频查询 | - | `${baseURL}/async-result/${taskId}` | 正常 |
| 图片生成 | `cogview-4` | OpenAI SDK | 正常 |

- `AGNES_API_BASE = https://open.bigmodel.cn/api/paas/v4`
- 视频的 `duration` 参数：智谱文档明确不支持 `duration`，模型固定时长（约 6 秒）
- 语音端点错误在 `ai-client.ts:520`，`/audio/speeches` 应改为 `/audio/speech`

### Vibe Coding 现状（基于 `server/src/routes/vibe-code.ts` + `client/src/pages/studio/VibeCodePage.tsx`）

当前是"单轮文生代码 + 手动修复"：
- `POST /api/vibe-code/generate`：接收 `{ prompt }`，用 `chatCompletionStreamWithSystemPrompt` 流式生成代码
- `POST /api/vibe-code/fix`：接收 `{ code, error }`，流式生成修复后的代码
- **无 tool calling**：不传 `tools` 参数给 GLM
- **无多轮上下文**：每次请求 `setCode('')` 清空，无 messages 数组
- **无自动错误检测**：靠用户手动描述错误触发修复

### UX 现状（基于 4 个 studio 页面 + tailwind.config.ts）

| 页面 | 进度条 | 响应式断点 | 布局灵活性 |
|------|--------|-----------|-----------|
| VideoStudioPage | indeterminate shimmer | 仅 `lg` | 固定双栏 |
| ImageStudioPage | **无**（仅 Spinner） | `sm` + `lg` | 固定双栏 |
| VoiceStudioPage | **无**（仅 Spinner） | 仅 `lg` | 固定双栏 |
| VibeCodePage | 无 | 仅 `lg` | 代码/预览 1:1 死板，无全屏/收起 |

- `tailwind.config.ts` 未自定义 `screens`，用默认断点（sm:640/md:768/lg:1024）
- 所有 studio 页用 `grid-cols-1 lg:grid-cols-[Npx_1fr]`，平板区间(768-1023px)降级为单列
- VibeCodePage 右侧 `grid-rows-[1fr_1fr]` 固定等分，无展开/全屏/收起/拖拽

### 关键技术发现

1. **GLM-4-Flash 支持 Function Calling**：原生支持 τ²-Bench 工具调用协议，OpenAI SDK 兼容
2. **CogVideoX-Flash 支持 `with_audio: true`**：生成有声视频，无需换模型
3. **CogVideoX 不支持 `duration` 参数**：文档明确列出，时长由模型决定

## Proposed Changes

### Part 1: API 修复（3 处改动）

#### 1.1 语音合成 404 修复
**文件**：`server/src/lib/ai-client.ts`（第 520 行）
**改动**：`/audio/speeches` → `/audio/speech`
**原因**：智谱 CogTTS 官方路径是单数 `/audio/speech`，当前拼成复数导致 404
**验证**：调用 `POST /api/studio/voice` 返回 audioUrl

#### 1.2 AI 视频添加音频
**文件**：`server/src/lib/ai-client.ts`（`submitVideoTask` 函数，约第 450 行）
**改动**：请求体添加 `with_audio: true`
```typescript
body: JSON.stringify({
  model: 'cogvideox-flash',
  prompt,
  with_audio: true,  // 新增：生成有声视频
  // duration 移除：智谱不支持此参数
})
```
**原因**：CogVideoX-Flash 原生支持 `with_audio`，生成带音效的视频
**验证**：生成的视频播放时有声音

#### 1.3 移除无效的 duration 参数
**文件**：`server/src/lib/ai-client.ts`（`submitVideoTask`）、`server/src/routes/studio.ts`（video/create 路由）、`client/src/pages/studio/VideoStudioPage.tsx`
**改动**：
- 后端：`submitVideoTask` 移除 `duration` 参数（智谱不支持）
- 前端：移除时长输入框，改为显示"视频时长由 AI 决定（约 6 秒）"提示
**原因**：智谱文档明确不支持 `duration`，当前传了也无效
**验证**：视频生成不再报"有限制"

### Part 2: Vibe Coding Agent 重构（Tool Calling + 多轮）

#### 2.1 后端：新增带 tools 的 chat 函数
**文件**：`server/src/lib/ai-client.ts`
**新增函数**：`chatWithTools(messages, tools, options?)`
```typescript
/**
 * 带 tool calling 的对话（非流式，用于 agent 循环）
 * 返回 AI 回复 + tool_calls
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools?: ToolDef[],
  options?: { agentId?: string; signal?: AbortSignal }
): Promise<{
  content: string
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
}>
```
**实现**：用 OpenAI SDK `chat.completions.create({ tools, tool_choice: 'auto' })`，解析返回的 `tool_calls`

#### 2.2 后端：重写 vibe-code 路由为 agent 循环
**文件**：`server/src/routes/vibe-code.ts`
**新增端点**：`POST /api/vibe-code/chat`（非流式，用于 agent 循环）

**Agent 工具定义**：
```typescript
const VIBE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'write_code',
      description: '生成或更新 HTML 代码',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '完整的 HTML 代码' },
          explanation: { type: 'string', description: '代码说明' }
        },
        required: ['code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: '完成代码生成，确认无需修改',
      parameters: { type: 'object', properties: {} }
    }
  }
]
```

**Agent 循环逻辑**：
1. 接收 `{ messages, code?, error? }`（messages 包含完整对话历史）
2. 如果有 error，追加 system 消息告知 AI 上次代码出错
3. 调用 `chatWithTools(messages, VIBE_TOOLS)`
4. 如果返回 `tool_calls`：
   - `write_code`：返回 `{ type: 'code', code, explanation }` 给前端
   - `finish`：返回 `{ type: 'done' }`
5. 如果无 tool_calls，返回 AI 文本回复

**保留**：原有 `POST /api/vibe-code/generate`（兼容旧前端，逐步废弃）

#### 2.3 前端：VibeCodePage 重构为多轮 Agent
**文件**：`client/src/pages/studio/VibeCodePage.tsx`、`client/src/lib/api.ts`

**新增状态**：
```typescript
const [messages, setMessages] = useState<ChatMessage[]>([])  // 对话历史
const [isAgentThinking, setIsAgentThinking] = useState(false)
```

**Agent 循环（前端）**：
1. 用户输入需求 → 追加 user 消息到 messages
2. 调用 `POST /api/vibe-code/chat` 传 messages
3. 如果返回 `{ type: 'code', code }`：
   - 更新代码区
   - 注入 iframe 预览
   - 自动捕获 iframe 错误（`window.onerror`）
   - 如果有错误，追加 error 消息，再次调用 `/chat`
   - 如果无错误，追加 assistant 消息，等待用户追问
4. 如果返回 `{ type: 'done' }`：完成
5. 如果返回文本：显示在对话区

**iframe 错误捕获**：
```typescript
// iframe 注入错误捕获脚本
const errorCaptureScript = `
  window.onerror = function(msg, url, line, col, err) {
    window.parent.postMessage({
      type: 'vibe-error',
      message: msg,
      stack: err && err.stack
    }, '*');
  };
`;
```

**多轮对话 UI**：
- 左侧：需求输入 + 对话历史（可滚动）
- 用户可追问"改颜色"、"加按钮"等
- 显示 agent 思考状态（"正在生成代码..."/"正在检查错误..."）

### Part 3: 进度条与状态优化

#### 3.1 图片生成进度条
**文件**：`client/src/pages/studio/ImageStudioPage.tsx`
**改动**：
- 生成中：显示 indeterminate shimmer 进度条（与视频页一致）
- 图片加载：用 skeleton/shimmer 占位，`<img onLoad>` 切换显示
- 新增"发布到广场"勾选 checkbox

```tsx
{isGenerating && <div className="h-1 shimmer rounded" />}
{images.map(img => (
  <div className="relative">
    {!loaded[img.url] && <Skeleton className="aspect-square" />}
    <img src={img.url} onLoad={() => setLoaded(prev => ({...prev, [img.url]: true}))}
         className={loaded[img.url] ? 'block' : 'hidden'} />
  </div>
))}
```

#### 3.2 语音生成进度条
**文件**：`client/src/pages/studio/VoiceStudioPage.tsx`
**改动**：
- 生成中：显示 indeterminate shimmer 进度条
- 添加 429 友好提示（与视频页一致）
- 添加字数上限校验（500 字）

#### 3.3 视频进度条分阶段
**文件**：`client/src/pages/studio/VideoStudioPage.tsx`
**改动**：
- 进度条改为分阶段显示：`提交中 → 排队中 → 生成中 → 完成`
- 每个阶段有不同颜色 + 图标
- 添加预估时间显示（"预计 1-2 分钟"）
- 移除时长输入框，改为信息提示"视频时长约 6 秒，由 AI 决定"

### Part 4: UX 优化（展开/全屏/收起 + 响应式 + 按钮组织）

#### 4.1 Vibe Coding 布局重构
**文件**：`client/src/pages/studio/VibeCodePage.tsx`

**新增布局控件**：
```tsx
type ViewMode = 'split' | 'code' | 'preview'
const [viewMode, setViewMode] = useState<ViewMode>('split')
const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
const [fullscreenTarget, setFullscreenTarget] = useState<'code' | 'preview' | null>(null)
```

**布局实现**：
- 顶部工具栏：视图切换按钮组（分屏/仅代码/仅预览）+ 全屏按钮 + 收起左侧面板按钮
- 代码区：可全屏，ESC 退出
- 预览区：可全屏，ESC 退出
- 左侧面板：可收起，收起后只显示展开按钮

**按钮分组**（用 Separator 分隔）：
```
[视图: 分屏|代码|预览] | [全屏] | [收起左侧]
---分隔---
[复制] [下载] | [修复] [重置] | [保存]
```

#### 4.2 响应式断点适配
**文件**：`client/tailwind.config.ts` + 各 studio 页面

**tailwind.config.ts** 添加自定义断点：
```typescript
screens: {
  sm: '640px',
  // 平板竖屏
  md: '768px',
  // 平板横屏 / 小笔记本
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
}
```

**各 studio 页面适配**：
- 手机（< md）：单列堆叠，表单在上结果在下
- 平板（md - lg）：双栏，表单 320px + 结果区自适应
- 桌面（lg+）：保持当前 `grid-cols-[360px_1fr]` 布局

```tsx
// 从 grid-cols-1 lg:grid-cols-[360px_1fr]
// 改为
grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]
```

#### 4.3 VibeCodePage 平板适配
**文件**：`client/src/pages/studio/VibeCodePage.tsx`

**布局改为**：
- 手机（< md）：单列，标签页切换（输入/代码/预览）
- 平板（md - lg）：双栏，左侧输入 + 右侧代码/预览标签页
- 桌面（lg+）：三栏或双栏 + 分屏

#### 4.4 ChatWindow 按钮优化
**文件**：`client/src/components/chat/ChatWindow.tsx`
**改动**：
- 手机端：Mic 和 Volume 按钮合并到一个"更多"菜单
- 或：手机端隐藏 Volume 按钮，只保留 Mic
- 输入区：`flex` 布局优化，textarea 最小宽度保证

## Assumptions & Decisions

### 技术假设
1. **GLM-4-Flash 支持 function calling**：基于搜索结果，GLM-4-Flash 原生支持 τ²-Bench 工具调用协议，OpenAI SDK 兼容
2. **CogVideoX `with_audio: true` 有效**：基于极客智坊文档，cogvideox-flash 支持此参数
3. **CogVideoX 不支持 `duration`**：文档明确列出不支持参数包含 `duration`
4. **OpenAI SDK 支持 `tools` 参数**：智谱 API 兼容 OpenAI SDK，tools 参数应可用

### 设计决策
1. **Vibe Coding agent 用非流式**：tool calling 需要先获取完整 tool_calls 再执行，流式不适合。但代码生成仍可流式（在 write_code 工具内）
2. **前端 iframe 错误捕获**：用 `postMessage` 从 iframe 传错误到父窗口，触发自动修复
3. **进度条用 indeterminate**：智谱 API 不返回百分比，无法做真实进度。改为分阶段显示 + 预估时间
4. **不换视频模型**：CogVideoX-Flash 免费，加 `with_audio` 即可有声，无需换模型
5. **平板用 md 断点**：768-1023px 区间用双栏布局，而非单列堆叠

## Verification Steps

### API 验证
1. `POST /api/studio/voice` 返回 audioUrl（不再 404）
2. `POST /api/studio/video/create` 生成的视频有声音
3. `POST /api/vibe-code/chat` 返回 tool_calls（write_code/finish）

### Vibe Coding Agent 验证
1. 输入"做贪吃蛇" → AI 调用 write_code 生成代码 → iframe 预览可玩
2. 追问"改成红色" → AI 记住上下文，调用 write_code 更新代码
3. 代码有语法错误 → iframe 捕获错误 → 自动调用修复

### UX 验证
1. 图片生成有进度条 + 图片加载有 skeleton 占位
2. 语音生成有进度条
3. 视频进度条分阶段显示（提交→排队→生成→完成）
4. VibeCodePage 有分屏/仅代码/仅预览切换 + 全屏 + 收起左侧
5. 平板尺寸（768-1023px）下双栏布局正常
6. 手机尺寸（<768px）下单列布局正常
7. 按钮分组清晰，不再堆叠

## 实施顺序

1. **Part 1: API 修复**（最小改动，立即生效）→ 先修复语音404 + 视频有声
2. **Part 3: 进度条优化**（中等改动）→ 改善所有 studio 页面体验
3. **Part 4: UX 优化**（较大改动）→ Vibe Coding 布局 + 响应式适配
4. **Part 2: Vibe Coding Agent**（最大改动）→ 重构后端 + 前端 agent 循环

## 涉及文件清单

### 后端
- `server/src/lib/ai-client.ts` — 修复语音路径 + 视频加 with_audio + 新增 chatWithTools
- `server/src/routes/vibe-code.ts` — 新增 `/chat` agent 端点
- `server/src/routes/studio.ts` — 移除 duration 参数

### 前端
- `client/src/pages/studio/VibeCodePage.tsx` — 重构为 agent 多轮 + 布局控件
- `client/src/pages/studio/VideoStudioPage.tsx` — 分阶段进度条 + 移除时长输入
- `client/src/pages/studio/ImageStudioPage.tsx` — 进度条 + skeleton + 发布广场勾选
- `client/src/pages/studio/VoiceStudioPage.tsx` — 进度条 + 429 友好提示
- `client/src/lib/api.ts` — 新增 vibeChat 函数
- `client/src/components/chat/ChatWindow.tsx` — 按钮优化
- `client/tailwind.config.ts` — 确认断点配置
