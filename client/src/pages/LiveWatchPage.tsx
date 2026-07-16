// =====================================================================
// AI 直播观看页（M5.4）—— 视频播放器 + 弹幕 + 主播信息
// ---------------------------------------------------------------------
// - 左侧：视频播放器（replay_url mp4 或 stream_url）
// - 右侧：弹幕聊天区 + 发送框
// - 顶部：主播信息卡 + 观众数 + 直播状态
// - 心跳：每 30s 上报一次，增加观众数
// - 轮询：每 5s 拉取最新弹幕
// =====================================================================

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Eye, Users, Radio } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'

// ---------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------

interface LiveHost {
  id: string
  nickname: string
  style: string
  specialty: string
  system_prompt?: string
}

interface LiveMessage {
  id: string
  user_id: string | null
  ai_creator_id: string | null
  role: 'user' | 'host' | 'co-host' | 'assistant' | 'system'
  content: string
  is_pinned: boolean
  created_at: string
  sender?: {
    nickname?: string
    avatar_url?: string | null
    style?: string
  }
}

interface LiveStreamDetail {
  id: string
  host_id: string
  host_ai_id: string | null
  title: string
  description: string | null
  category: string | null
  status: 'pending' | 'live' | 'ended' | 'failed'
  stream_url: string | null
  replay_url: string | null
  cover_url: string | null
  viewer_count: number
  peak_viewers: number
  started_at: string | null
  ended_at: string | null
  created_at: string
  host_ai: LiveHost | null
}

interface LiveDetailResponse {
  stream: LiveStreamDetail
  messages: LiveMessage[]
}

// ---------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------

function formatViewerCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

export const LiveWatchPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [stream, setStream] = useState<LiveStreamDetail | null>(null)
  const [messages, setMessages] = useState<LiveMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewerCount, setViewerCount] = useState(0)

  // 弹幕输入
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)

  // 自动滚动
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 加载直播详情
  const loadDetail = useCallback(async () => {
    if (!id) return
    try {
      const res = await apiFetch<LiveDetailResponse>(`/api/live/${id}`)
      setStream(res.stream)
      setMessages(res.messages ?? [])
      setViewerCount(res.stream.viewer_count ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载直播失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  // 轮询弹幕（每 5s）
  useEffect(() => {
    if (!id || !stream) return
    const timer = setInterval(async () => {
      try {
        const res = await apiFetch<LiveDetailResponse>(`/api/live/${id}`)
        setMessages(res.messages ?? [])
        setViewerCount(res.stream.viewer_count ?? 0)
      } catch {
        // 静默
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [id, stream])

  // 心跳（每 30s 上报，增加观众数）
  useEffect(() => {
    if (!id || !stream) return
    const heartbeat = async () => {
      try {
        const res = await apiFetch<{ viewer_count: number }>(
          `/api/live/${id}/heartbeat`,
          { method: 'POST' },
        )
        setViewerCount(res.viewer_count)
      } catch {
        // 静默
      }
    }
    // 首次延迟 5s 再开始心跳
    const timer = setTimeout(heartbeat, 5000)
    const interval = setInterval(heartbeat, 30000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [id, stream])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 发送弹幕
  async function handleSend() {
    if (!inputText.trim() || !id || !user) return
    setSending(true)
    try {
      const res = await apiFetch<{ message: LiveMessage }>(
        `/api/live/${id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content: inputText.trim() }),
        },
      )
      setMessages((prev) => [...prev, res.message])
      setInputText('')
    } catch {
      // 静默
    } finally {
      setSending(false)
    }
  }

  // 加载中
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  // 加载失败
  if (error || !stream) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card className="p-12">
          <EmptyState
            title="直播不存在"
            description={error || '该直播可能已结束或被删除'}
            action={
              <Button variant="outline" size="sm" onClick={() => navigate('/live')}>
                返回直播列表
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  const isLive = stream.status === 'live'
  const videoUrl = stream.replay_url || stream.stream_url
  const host = stream.host_ai

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-4">
      {/* 返回按钮 */}
      <button
        type="button"
        onClick={() => navigate('/live')}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <ArrowLeft className="h-4 w-4" />
        返回列表
      </button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* 左侧：视频播放器 + 主播信息 */}
        <div className="space-y-4">
          {/* 视频播放器 */}
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            {videoUrl ? (
              <video
                src={videoUrl}
                className="h-full w-full"
                controls
                autoPlay={isLive}
                loop={isLive}
                poster={stream.cover_url ?? undefined}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <Radio className={`h-12 w-12 text-gray-600 ${isLive ? 'animate-pulse' : ''}`} />
                <p className="text-sm text-gray-500">
                  {isLive ? '直播流加载中…' : '暂无回放视频'}
                </p>
              </div>
            )}

            {/* 直播状态角标 */}
            <div className="absolute left-3 top-3">
              {isLive ? (
                <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  LIVE
                </span>
              ) : (
                <Badge variant="secondary" className="bg-black/60 text-white">
                  回放
                </Badge>
              )}
            </div>

            {/* 观众数角标 */}
            <div className="absolute right-3 top-3">
              <span className="inline-flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                <Eye className="h-3 w-3" />
                {formatViewerCount(viewerCount)}
              </span>
            </div>
          </div>

          {/* 直播标题 */}
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {stream.title}
            </h1>
            {stream.description && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {stream.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
              {stream.category && <Badge variant="outline">{stream.category}</Badge>}
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                峰值 {formatViewerCount(stream.peak_viewers)}
              </span>
              {stream.started_at && (
                <span>开播 {formatTime(stream.started_at)}</span>
              )}
              {stream.ended_at && <span>结束 {formatTime(stream.ended_at)}</span>}
            </div>
          </div>

          {/* 主播信息卡 */}
          {host && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 bg-gradient-to-br from-purple-500 to-pink-500">
                  <AvatarFallback className="bg-transparent text-sm font-bold text-white">
                    {host.nickname.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {host.nickname}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {host.specialty}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                    风格：{host.style}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* 右侧：弹幕聊天区 */}
        <div className="flex h-[calc(100vh-160px)] min-h-[500px] flex-col rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          {/* 弹幕区标题 */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              弹幕聊天
            </span>
            <span className="text-xs text-gray-400">
              {messages.length} 条
            </span>
          </div>

          {/* 弹幕列表 */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                <Send className="h-8 w-8" />
                <p className="text-sm">还没有弹幕，来发第一条吧</p>
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <DanmakuItem key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 发送框 */}
          <div className="border-t border-gray-100 p-3 dark:border-gray-800">
            {user ? (
              <div className="flex gap-2">
                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="发个弹幕吧…"
                  maxLength={200}
                  disabled={sending}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={sending || !inputText.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-gray-400">
                登录后可发送弹幕
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// 弹幕项
// ---------------------------------------------------------------------

function DanmakuItem({ message }: { message: LiveMessage }) {
  const isHost = message.role === 'host' || message.role === 'co-host'
  const isSystem = message.role === 'system'
  const senderName = message.sender?.nickname ?? '匿名'

  if (isSystem) {
    return (
      <div className="py-1 text-center text-xs text-gray-400 dark:text-gray-500">
        {message.content}
      </div>
    )
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
        isHost ? 'bg-purple-50 dark:bg-purple-900/20' : ''
      }`}
    >
      {/* 头像 */}
      <div
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
          isHost
            ? 'bg-gradient-to-br from-purple-500 to-pink-500'
            : 'bg-gradient-to-br from-gray-500 to-gray-600'
        }`}
      >
        {senderName.charAt(0)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs font-medium ${
              isHost
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {senderName}
          </span>
          {isHost && (
            <Badge variant="default" className="h-3.5 px-1 text-[9px]">
              主播
            </Badge>
          )}
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {formatTime(message.created_at)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">
          {message.content}
        </p>
      </div>
    </div>
  )
}
