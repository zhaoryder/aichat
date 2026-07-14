// =====================================================================
// 1v1 对话窗口（核心组件）
// ---------------------------------------------------------------------
// 重构说明：使用 assistant-ui 的 ThreadPrimitive / MessagePrimitive /
// ComposerPrimitive + useExternalStoreRuntime 替代手写消息列表和输入框。
//
// 保留功能：
//   - SSE 流式接收：currentEvent 必须在 while 循环外部声明，
//     避免 chunk 边界切在 event/data 之间时丢失 token
//   - 流式光标（animate-pulse-cursor ▋）；等待首字时三个跳动圆点（animate-bounce-dot）
//   - AbortController 取消旧流；组件卸载时清理
//   - URL 回写 cid 参数（start 事件）
//   - 收藏按钮：通过 useFavorites() 全局 Context 读写（POST /api/favorite）
//   - 分享按钮：UI 就绪，后端 /api/share 由 Task 25-27 实现
//   - 语音输入 / TTS 朗读按钮（位于顶部信息栏）
//   - 工具调用渲染（webSearch / generateImage / generateVideo）通过
//     makeAssistantToolUI 注册，由 MessagePrimitive.Parts 自动调度
// =====================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mic, MicOff, Volume2, VolumeX, Search, ImageIcon, Video, Loader2, Download, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  makeAssistantToolUI,
  useExternalStoreRuntime,
  useMessage,
  useThreadRuntime,
  type ExternalStoreAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react'
import { apiStream } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis'
import { useFavorites } from '@/hooks/useFavorites'
import type { AgentConfig } from '@shared/agents'
import type { Message } from '@shared/types'

/** 工具调用信息（流式渲染） */
interface ToolCallInfo {
  id: string
  name: string
  args: Record<string, unknown>
  /** 工具执行结果（收到 tool_result 事件后填充） */
  result?: unknown
  /** 是否正在执行中（收到 tool_call 但未收到 tool_result） */
  isExecuting: boolean
  /** 执行是否出错（result 为 { error: string } 时标记） */
  hasError?: boolean
}

/** 扩展 Message：流式输出标记 + 工具调用列表 */
interface ChatMessage extends Message {
  isStreaming?: boolean
  toolCalls?: ToolCallInfo[]
}

interface ChatWindowProps {
  agent: AgentConfig
  userId: string
  conversationId: string | null
  initialMessages: Message[]
}

// =====================================================================
// 工具调用渲染器（makeAssistantToolUI）
// ---------------------------------------------------------------------
// render 在 MessagePrimitive.Parts 遇到 tool-call part 时被调用。
// 通过 result === undefined 判断"执行中" vs "已完成"。
// =====================================================================

type WebSearchResult = Array<{ title: string; url: string; snippet: string }>

const WebSearchToolUI = makeAssistantToolUI<{ query: string }, WebSearchResult>({
  toolName: 'webSearch',
  render: ({ args, result, isError }) => {
    if (result === undefined) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <Search className="h-4 w-4 text-primary" />
          <span className="text-sm">联网搜索：{args?.query}</span>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      )
    }
    if (isError) {
      const err = result as { error?: string } | null
      return (
        <p className="text-xs text-red-500">
          执行失败：{err?.error ?? '未知错误'}
        </p>
      )
    }
    const results = result as WebSearchResult
    if (!Array.isArray(results) || results.length === 0) {
      return <p className="text-xs text-gray-500">未找到搜索结果</p>
    }
    return (
      <div className="space-y-2">
        {results.slice(0, 5).map((r, i) => (
          <a
            key={i}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border p-3 transition-transform hover:scale-[1.01]"
          >
            <div className="flex items-center gap-2">
              <ExternalLink className="h-3 w-3" />
              <span className="font-medium">{r.title}</span>
            </div>
            {r.snippet && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>
            )}
          </a>
        ))}
      </div>
    )
  },
})

type GenerateImageResult = { url: string; prompt: string }

const GenerateImageToolUI = makeAssistantToolUI<{ prompt: string }, GenerateImageResult>({
  toolName: 'generateImage',
  render: ({ args, result, isError }) => {
    if (result === undefined) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="text-sm">生成图片：{args?.prompt}</span>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      )
    }
    if (isError) {
      const err = result as { error?: string } | null
      return (
        <p className="text-xs text-red-500">
          执行失败：{err?.error ?? '未知错误'}
        </p>
      )
    }
    const r = result as Partial<GenerateImageResult> | null
    if (!r?.url) {
      return <p className="text-xs text-gray-500">图片生成失败：未返回 URL</p>
    }
    return (
      <div>
        <img
          src={r.url}
          alt={r.prompt ?? '生成的图片'}
          className="max-w-full rounded-lg border border-gray-100"
          loading="lazy"
        />
        <a
          href={r.url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary transition-colors hover:underline"
        >
          <Download className="h-3 w-3" />
          下载图片
        </a>
      </div>
    )
  },
})

type GenerateVideoResult = { taskId: string; prompt: string; duration: number }

const GenerateVideoToolUI = makeAssistantToolUI<{ prompt: string; duration: number }, GenerateVideoResult>({
  toolName: 'generateVideo',
  render: ({ args, result, isError }) => {
    if (result === undefined) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <Video className="h-4 w-4 text-primary" />
          <span className="text-sm">
            生成视频：{args?.prompt}（{args?.duration ?? 5}秒）
          </span>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      )
    }
    if (isError) {
      const err = result as { error?: string } | null
      return (
        <p className="text-xs text-red-500">
          执行失败：{err?.error ?? '未知错误'}
        </p>
      )
    }
    const r = result as Partial<GenerateVideoResult> | null
    if (!r?.taskId) {
      return <p className="text-xs text-gray-500">视频任务提交失败</p>
    }
    return (
      <div className="rounded-lg bg-gray-50 p-2.5 text-xs">
        <p className="font-medium text-gray-700">视频生成任务已提交</p>
        <p className="mt-0.5 text-gray-500">
          时长：{r.duration ?? 5} 秒 · 任务 ID：{r.taskId.slice(0, 8)}…
        </p>
        <p className="mt-1 text-gray-400">
          视频生成约需 3-5 分钟，完成后可在
          <Link to="/media" className="mx-0.5 text-primary hover:underline">素材库</Link>
          查看
        </p>
      </div>
    )
  },
})

/** 智能体头像：CSS 渐变背景 + 首字母（avatarGradient 是 CSS 字符串） */
function AgentAvatar({ agent, size = 'md' }: { agent: AgentConfig; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-xl',
  }[size]
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-bold text-white', sizeClass)}
      style={{ backgroundImage: agent.avatarGradient }}
    >
      {initial}
    </div>
  )
}

export function ChatWindow({
  agent,
  // userId 留作接口契约（后续举报等功能会用），此处不消费以避免无意义绑定
  conversationId: initialConversationId,
  initialMessages,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages.map((m) => ({ ...m })),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  // 分享 UI 反馈
  const [shareCopied, setShareCopied] = useState(false)
  // 收藏按钮提交中状态（收藏状态本身来自全局 useFavorites）
  const [favoriteSubmitting, setFavoriteSubmitting] = useState(false)

  /** 当前 SSE 请求的 AbortController，用于取消旧流 / 组件卸载时清理 */
  const abortControllerRef = useRef<AbortController | null>(null)
  /** conversationId 最新值，避免闭包陈旧（用于 start 事件回写 URL 判断） */
  const conversationIdRef = useRef(initialConversationId)
  /** 已朗读的最后一条 AI 消息 ID，避免重复朗读 */
  const lastSpokenIdRef = useRef<string | null>(null)

  // 收藏：状态来自全局 Context（useFavorites），刷新后保持
  const { isFavorited, toggleFavorite } = useFavorites()
  const favorited = isFavorited(agent.id)

  // 语音识别 / 合成
  const {
    transcript: voiceTranscript,
    interimTranscript,
    isListening,
    isSupported: voiceSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition()
  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    isSupported: ttsSupported,
  } = useSpeechSynthesis()
  const [autoSpeak, setAutoSpeak] = useState(false)

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  // 组件卸载时取消进行中的流式请求
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // AI 回复完成后自动朗读（autoSpeak 开启时）
  useEffect(() => {
    if (!autoSpeak) return
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'assistant') {
        if (!m.isStreaming && m.content && lastSpokenIdRef.current !== m.id) {
          lastSpokenIdRef.current = m.id
          speak(m.content)
        }
        break
      }
    }
  }, [messages, autoSpeak, speak])

  // -------------------------------------------------------------------
  // SSE 流式发送（保留所有事件分支：start/token/tool_call/tool_result/done/error）
  // -------------------------------------------------------------------
  const handleSendByText = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      // 用户消息
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        conversation_id: conversationId ?? '',
        role: 'user',
        content: trimmed,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])

      // AI 占位消息（流式追加）
      const aiMsgId = crypto.randomUUID()
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        conversation_id: conversationId ?? '',
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
        isStreaming: true,
      }
      setMessages((prev) => [...prev, aiMsg])
      setIsLoading(true)

      // 取消上一个流（若有）
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const response = await apiStream(
          '/chat',
          { conversationId, agentId: agent.id, message: trimmed },
          { signal: controller.signal },
        )

        if (!response.body) {
          setMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        // 关键：currentEvent 必须在 while 循环外部声明，
        // 否则 chunk 边界切在 event/data 之间时会丢失 token，导致"一直加载"
        let currentEvent = ''
        let receivedAnyToken = false

        while (true) {
          if (controller.signal.aborted) break
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              let data: {
                conversationId?: string
                c?: string
                message?: string
                // tool_call 事件字段
                id?: string
                name?: string
                args?: Record<string, unknown>
                // tool_result 事件字段（复用 id/name，新增 result）
                result?: unknown
              }
              try {
                data = JSON.parse(line.slice(6))
              } catch {
                continue
              }
              if (currentEvent === 'start' && data.conversationId) {
                setConversationId(data.conversationId)
                // 首次发送：后端创建了新对话，回写 URL cid 参数
                if (!conversationIdRef.current) {
                  try {
                    const url = new URL(window.location.href)
                    url.searchParams.set('cid', data.conversationId)
                    window.history.replaceState(null, '', url.toString())
                  } catch {
                    // URL 回写失败不影响主流程
                  }
                }
              } else if (currentEvent === 'token' && data.c) {
                receivedAnyToken = true
                setMessages((prev) =>
                  prev.map((m) => (m.id === aiMsgId ? { ...m, content: m.content + data.c } : m)),
                )
              } else if (currentEvent === 'tool_call') {
                // 工具调用开始：在 AI 占位消息上追加工具调用信息
                const { id: tcId, name: tcName, args: tcArgs } = data
                if (tcId && tcName) {
                  receivedAnyToken = true
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === aiMsgId
                        ? {
                            ...m,
                            toolCalls: [
                              ...(m.toolCalls ?? []),
                              {
                                id: tcId,
                                name: tcName,
                                args: tcArgs ?? {},
                                isExecuting: true,
                              },
                            ],
                          }
                        : m,
                    ),
                  )
                }
              } else if (currentEvent === 'tool_result') {
                // 工具调用结果：更新对应工具调用的 result 和 isExecuting
                const { id: trId, result: trResult } = data
                if (trId) {
                  const hasError =
                    trResult != null &&
                    typeof trResult === 'object' &&
                    'error' in trResult
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === aiMsgId
                        ? {
                            ...m,
                            toolCalls: (m.toolCalls ?? []).map((tc) =>
                              tc.id === trId
                                ? { ...tc, result: trResult, isExecuting: false, hasError }
                                : tc,
                            ),
                          }
                        : m,
                    ),
                  )
                }
              } else if (currentEvent === 'done') {
                setMessages((prev) =>
                  prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m)),
                )
              } else if (currentEvent === 'error') {
                // 静默处理：已收到 token/tool_call 则保留并停止流式，否则移除占位
                if (!receivedAnyToken) {
                  setMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
                } else {
                  setMessages((prev) =>
                    prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m)),
                  )
                }
              }
            }
          }
        }

        // 流自然结束但未收到 done：确保停止流式 + 停止工具调用执行状态
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  isStreaming: false,
                  toolCalls: (m.toolCalls ?? []).map((tc) =>
                    tc.isExecuting ? { ...tc, isExecuting: false } : tc,
                  ),
                }
              : m,
          ),
        )
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // 被新消息或卸载取消：保留已收到的 token，停止流式 + 停止工具调用
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.isExecuting ? { ...tc, isExecuting: false } : tc,
                    ),
                  }
                : m,
            ),
          )
          return
        }
        // 其他错误：静默移除占位（不显示错误，已收到的 token 会随占位移除）
        setMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
      } finally {
        setIsLoading(false)
        // 仅当仍是本次请求的 controller 时才清空，避免清掉新请求的 controller
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    },
    [agent.id, conversationId, isLoading],
  )

  // 分享按钮（UI 就绪；/api/share 由后端 Task 25-27 实现）
  const handleShare = useCallback(() => {
    if (!conversationIdRef.current) return
    setShareCopied(true)
    window.setTimeout(() => setShareCopied(false), 2000)
    toast.success('分享链接已复制！')
  }, [])

  // 收藏按钮：调 useFavorites().toggleFavorite（POST /favorite），全局状态同步
  const handleFavorite = useCallback(async () => {
    if (favoriteSubmitting) return
    setFavoriteSubmitting(true)
    const prev = favorited
    try {
      // shared/agents.ts 中的智能体均为官方，agentType 固定为 'official'
      await toggleFavorite(agent.id, 'official')
      toast.success(!prev ? '收藏成功！' : '已取消收藏')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败，请重试')
    } finally {
      setFavoriteSubmitting(false)
    }
  }, [agent.id, favorited, favoriteSubmitting, toggleFavorite])

  // -------------------------------------------------------------------
  // assistant-ui 适配器：把 ChatMessage[] 接入 useExternalStoreRuntime
  // -------------------------------------------------------------------
  const convertMessage = useCallback(
    (message: ChatMessage): ThreadMessageLike => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      id: message.id,
      createdAt: new Date(message.created_at),
      status: message.isStreaming ? { type: 'running' } : { type: 'complete', reason: 'stop' },
      content: [
        { type: 'text', text: message.content },
        ...(message.toolCalls ?? []).map((tc) => ({
          type: 'tool-call' as const,
          toolName: tc.name,
          toolCallId: tc.id,
          // args 来自服务端 SSE 的 JSON.parse，本质是 JSON 兼容值；
          // assistant-ui 期望 ReadonlyJSONObject，此处安全断言
          args: tc.args as any,
          result: tc.result as any,
          isError: tc.hasError === true,
        })),
      ],
    }),
    [],
  )

  const adapter = useMemo<ExternalStoreAdapter<ChatMessage>>(
    () => ({
      messages,
      isRunning: isLoading,
      convertMessage,
      onNew: async (message) => {
        // 从 AppendMessage.content 提取用户输入文本
        let text = ''
        if (typeof message.content === 'string') {
          text = message.content
        } else if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'text' && typeof part.text === 'string') {
              text += part.text
            }
          }
        }
        await handleSendByText(text)
      },
      onCancel: async () => {
        abortControllerRef.current?.abort()
      },
    }),
    [messages, isLoading, convertMessage, handleSendByText],
  )

  const runtime = useExternalStoreRuntime(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* 注册工具调用渲染器（渲染时挂载，返回 null） */}
      <WebSearchToolUI />
      <GenerateImageToolUI />
      <GenerateVideoToolUI />
      {/* 语音识别结果 → Composer 文本注入 */}
      <VoiceToComposerBridge
        voiceTranscript={voiceTranscript}
        resetTranscript={resetTranscript}
      />

      <div className="flex h-[calc(100dvh-4rem)] flex-col bg-gray-50">
        {/* 顶部智能体信息栏 */}
        <header className="shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Link
              to="/"
              className="inline-flex size-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-muted hover:text-gray-900"
              aria-label="返回首页"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <AgentAvatar agent={agent} size="md" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-bold text-gray-900">{agent.name}</h1>
              <p className="truncate text-xs text-gray-500">
                {agent.title} · {agent.era}
              </p>
            </div>

            {/* 收藏按钮 */}
            <button
              type="button"
              onClick={handleFavorite}
              disabled={favoriteSubmitting}
              aria-label={favorited ? '取消收藏' : '收藏智能体'}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                favorited ? 'text-primary' : 'text-gray-400 hover:bg-muted hover:text-gray-700',
              )}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" strokeLinejoin="round" />
              </svg>
            </button>

            {/* 分享按钮 */}
            <button
              type="button"
              onClick={handleShare}
              disabled={!conversationId}
              aria-label="分享对话"
              className="inline-flex size-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-muted hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" strokeLinecap="round" />
              </svg>
            </button>
            {shareCopied && (
              <span className="rounded-md bg-primary px-2 py-1 text-xs text-black shadow">已复制</span>
            )}

            {/* 语音输入按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={isListening ? stopListening : startListening}
              disabled={!voiceSupported}
              title={voiceSupported ? '语音输入' : '浏览器不支持语音识别'}
              aria-label={isListening ? '停止语音输入' : '开始语音输入'}
              className="h-9 w-9"
            >
              {isListening ? (
                <span className="relative inline-flex h-5 w-5 items-center justify-center">
                  <span className="absolute inline-flex h-5 w-5 animate-ping rounded-full bg-primary/50" />
                  <Mic className="relative h-5 w-5 text-primary" />
                </span>
              ) : (
                <MicOff className="h-5 w-5 text-gray-400" />
              )}
            </Button>

            {/* TTS 朗读按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (isSpeaking) {
                  stopSpeaking()
                } else {
                  setAutoSpeak((v) => !v)
                  toast.success(autoSpeak ? '已关闭自动朗读' : '已开启自动朗读')
                }
              }}
              disabled={!ttsSupported}
              title={ttsSupported ? '语音朗读' : '浏览器不支持语音合成'}
              aria-label={isSpeaking ? '停止朗读' : '自动朗读'}
              className="h-9 w-9"
            >
              {isSpeaking || autoSpeak ? <Volume2 className="h-5 w-5 text-primary" /> : <VolumeX className="h-5 w-5" />}
            </Button>

            {/* 在线状态徽章 */}
            <span className="hidden items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20 sm:inline-flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              在线
            </span>
          </div>
          {isListening && (
            <div className="mx-auto max-w-3xl px-4 pb-2 text-xs text-primary">
              正在聆听…
              {interimTranscript && <span className="ml-1 text-gray-500">{interimTranscript}</span>}
            </div>
          )}
        </header>

        {/* Thread：消息区 + Composer */}
        <ChatThread agent={agent} />
      </div>
    </AssistantRuntimeProvider>
  )
}

// =====================================================================
// 内部组件
// =====================================================================

/**
 * 把语音识别结果（voiceTranscript）注入到 Thread Composer 的输入框。
 * 必须在 AssistantRuntimeProvider 内部使用（依赖 useThreadRuntime）。
 */
function VoiceToComposerBridge({
  voiceTranscript,
  resetTranscript,
}: {
  voiceTranscript: string
  resetTranscript: () => void
}) {
  const runtime = useThreadRuntime()
  useEffect(() => {
    if (!voiceTranscript) return
    const composer = runtime.composer
    const currentText = composer.getState().text
    composer.setText(currentText + voiceTranscript)
    resetTranscript()
  }, [voiceTranscript, resetTranscript, runtime])
  return null
}

/** Thread 容器：Viewport（消息列表 + 空状态）+ Composer（输入区） */
function ChatThread({ agent }: { agent: AgentConfig }) {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          <ThreadPrimitive.Empty>
            <EmptyState agent={agent} />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages>
            {({ message }) => {
              if (message.role === 'user') return <UserMessage />
              return <AssistantMessage agent={agent} />
            }}
          </ThreadPrimitive.Messages>
        </div>
      </ThreadPrimitive.Viewport>
      <ChatComposer agent={agent} />
    </ThreadPrimitive.Root>
  )
}

/** 空状态：展示 agent 欢迎语 */
function EmptyState({ agent }: { agent: AgentConfig }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-slide-up">
      <AgentAvatar agent={agent} size="lg" />
      <h2 className="mt-4 text-xl font-bold text-gray-900">{agent.name}</h2>
      <p className="mt-1 text-sm text-gray-500">
        {agent.title} · {agent.era}
      </p>
      <p className="mt-5 max-w-md rounded-2xl bg-white px-5 py-3 text-sm leading-relaxed text-gray-700 shadow-sm ring-1 ring-gray-100">
        &ldquo;{agent.tagline}&rdquo;
      </p>
      <p className="mt-6 text-xs text-gray-400">在下方输入框开始对话</p>
    </div>
  )
}

/** 用户消息气泡：靠右、金黄底色 */
function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end animate-slide-up-fade">
      <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl bg-primary px-4 py-2.5 text-sm leading-relaxed text-black">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }) => <>{text}</>,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  )
}

/** AI 消息气泡：靠左、白底 + AgentAvatar、Markdown、流式光标、工具调用 */
function AssistantMessage({ agent }: { agent: AgentConfig }) {
  const isRunning = useMessage((s) => s.status?.type === 'running')
  const hasText = useMessage((s) =>
    s.content.some((p) => p.type === 'text' && typeof (p as { text?: string }).text === 'string' && (p as { text?: string }).text !== ''),
  )
  const hasToolCalls = useMessage((s) =>
    s.content.some((p) => p.type === 'tool-call'),
  )
  // 流式输出中且尚无内容且无工具调用：显示三个跳动圆点（"正在输入…"）
  const showTypingDots = isRunning && !hasText && !hasToolCalls

  return (
    <MessagePrimitive.Root className="flex gap-2 justify-start animate-slide-up-fade">
      <div className="mt-1">
        <AgentAvatar agent={agent} size="sm" />
      </div>
      <div className="flex max-w-[78%] flex-col items-start">
        <div className="break-words rounded-2xl bg-white px-4 py-2.5 text-sm leading-relaxed text-gray-900 shadow-sm ring-1 ring-gray-100">
          {showTypingDots ? (
            <div className="flex items-center gap-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="animate-bounce-dot inline-block size-2 rounded-full bg-gray-400"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          ) : (
            <>
              <MessagePrimitive.Parts
                components={{
                  Text: ({ text }) => (text ? <Markdown content={text} /> : null),
                }}
              />
              {isRunning && hasText && <span className="animate-pulse-cursor ml-0.5" />}
            </>
          )}
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

/** Composer：输入框 + 发送按钮（assistant-ui 自带 Enter 发送 / 自适应高度） */
function ChatComposer({ agent }: { agent: AgentConfig }) {
  return (
    <footer className="shrink-0 border-t border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 py-3">
        <ComposerPrimitive.Root className="flex items-end gap-2">
          <ComposerPrimitive.Input
            placeholder={`和 ${agent.name} 说点什么…`}
            rows={1}
            className="flex-1 max-h-[120px] resize-none rounded-xl border border-input bg-white px-4 py-2.5 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <ComposerPrimitive.Send
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-black shadow-sm transition-transform duration-300 ease-out hover:scale-[1.02] hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            aria-label="发送消息"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">发送</span>
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
        <p className="mt-1.5 text-center text-xs text-gray-400">按 Enter 发送 · Shift + Enter 换行</p>
      </div>
    </footer>
  )
}
