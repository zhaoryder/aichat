// =====================================================================
// 分享页（只读对话）
// ---------------------------------------------------------------------
// 路由：/share/:slug（公开访问，无需登录，不带 Layout 的 Navbar）
// 功能：
//   - 从 URL 取 slug
//   - 调 GET /share/:slug/messages 拉分享元数据 + 消息
//   - 渲染只读消息列表：用户靠右金黄，AI 靠左白底 + 通用 AI 头像
//   - 顶部简单导航条 + 标题 + 创建时间
//   - 底部 CTA：登录/注册
// =====================================================================

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { Message, SharedConversation } from '@shared/types'

type LoadStatus = 'loading' | 'ok' | 'error'

interface ShareMessagesResponse {
  share: SharedConversation
  messages: Message[]
}

/** 通用 AI 头像：金黄渐变 + "AI" 字母（不依赖 agent_id） */
function GenericAIAvatar({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-xl',
  }[size]
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-black',
        sizeClass,
      )}
      style={{ background: 'linear-gradient(135deg, #F5B400 0%, #FFD700 50%, #FFA500 100%)' }}
    >
      AI
    </div>
  )
}

/** 格式化创建时间 */
function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SharePage() {
  const { slug } = useParams<{ slug: string }>()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [share, setShare] = useState<SharedConversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!slug) {
      setStatus('error')
      setErrorMsg('缺少分享参数')
      return
    }
    let active = true
    setStatus('loading')
    apiFetch<ShareMessagesResponse>(`/share/${encodeURIComponent(slug)}/messages`)
      .then((res) => {
        if (!active) return
        setShare(res.share ?? null)
        // 按时间正序排序
        const sorted = [...(res.messages ?? [])].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
        setMessages(sorted)
        setStatus('ok')
      })
      .catch((err: Error) => {
        if (!active) return
        setErrorMsg(err.message || '分享不存在或已被删除')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [slug])

  // 加载中
  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-50">
        <SimpleHeader />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    )
  }

  // 错误
  if (status === 'error' || !share) {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-50">
        <SimpleHeader />
        <div className="flex flex-1 items-center justify-center px-4">
          <EmptyState
            title="分享不存在"
            description={errorMsg || '此分享可能已被删除或链接错误'}
            action={
              <Button asChild>
                <Link to="/">返回首页</Link>
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      {/* 简单顶部条（不带主布局 Navbar） */}
      <SimpleHeader />

      {/* 分享内容主体 */}
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-8">
          {/* 标题区 */}
          <header className="mb-6 text-center animate-slide-up">
            <h1 className="bg-gradient-to-r from-primary via-amber-400 to-orange-500 bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl">
              这是一份 AI 搞笑对话分享
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              创建于 {formatCreatedAt(share.created_at)}
            </p>
          </header>

          {/* 消息列表 */}
          <div className="space-y-4">
            {messages.length === 0 ? (
              <EmptyState title="这条分享还没有消息" />
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}
          </div>

          {/* 底部 CTA */}
          <footer className="mt-12 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-bold text-gray-900">
              来 AI 搞笑工坊创建你的对话
            </h2>
            <p className="mt-1.5 text-sm text-gray-500">
              和孔子、马斯克、林黛玉等 17 位 AI 角色畅聊
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button asChild>
                <Link to="/auth/register">立即注册</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/auth/login">已有账号，登录</Link>
              </Button>
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------

/** 简单顶部条：仅 logo + 回首页 */
function SimpleHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link
          to="/"
          className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-xl font-extrabold text-transparent transition-transform duration-300 ease-out hover:scale-[1.05]"
        >
          AI 搞笑工坊
        </Link>
        <Button asChild size="sm" variant="outline">
          <Link to="/">回首页</Link>
        </Button>
      </nav>
    </header>
  )
}

/** 单条消息气泡（只读） */
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-1">
          <GenericAIAvatar size="sm" />
        </div>
      )}
      <div className={cn('flex max-w-[78%] flex-col', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-black'
              : 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-100',
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
}
