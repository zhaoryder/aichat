// 1v1 对话页：加载智能体配置与历史消息，渲染 ChatWindow
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui-legacy/Spinner'
import { Button } from '@/components/ui-legacy/Button'
import { ChatWindow } from '@/components/chat/ChatWindow'
import type { AgentConfig } from '@shared/agents'
import type { Message } from '@shared/types'

type LoadStatus = 'loading' | 'ok' | 'error'

export const ChatPage = () => {
  const { agentId } = useParams<{ agentId: string }>()
  const [searchParams] = useSearchParams()
  const cid = searchParams.get('cid')
  const { user } = useAuth()

  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  // 历史消息加载状态：无 cid 时直接为 done
  const [messagesStatus, setMessagesStatus] = useState<'loading' | 'done'>(
    cid ? 'loading' : 'done',
  )
  const [errorMsg, setErrorMsg] = useState('')

  // 拉取智能体配置
  useEffect(() => {
    if (!agentId) {
      setStatus('error')
      setErrorMsg('缺少智能体参数')
      return
    }
    let active = true
    setStatus('loading')
    apiFetch<{ agent: AgentConfig }>(`/agents/${agentId}`)
      .then((res) => {
        if (!active) return
        setAgent(res.agent)
        setStatus('ok')
      })
      .catch((err: Error) => {
        if (!active) return
        setErrorMsg(err.message || '智能体加载失败')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [agentId])

  // 拉取历史消息（仅当有 cid 时尝试；端点未就绪则静默降级为空列表，
  // 由 ChatWindow 在首条消息时让后端创建对话）
  useEffect(() => {
    if (!cid) {
      setMessages([])
      setMessagesStatus('done')
      return
    }
    let active = true
    setMessagesStatus('loading')
    apiFetch<{ messages: Message[] }>(`/chat/messages?cid=${encodeURIComponent(cid)}`)
      .then((res) => {
        if (!active) return
        setMessages(res.messages ?? [])
        setMessagesStatus('done')
      })
      .catch(() => {
        if (active) {
          setMessages([])
          setMessagesStatus('done')
        }
      })
    return () => {
      active = false
    }
  }, [cid])

  // 加载中：智能体未就绪，或智能体就绪但历史消息仍在拉取
  if (status === 'loading' || (status === 'ok' && messagesStatus === 'loading')) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  // 智能体加载失败或不存在
  if (status === 'error' || !agent) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-3 text-center">
        <p className="text-base text-gray-700">{errorMsg || '未找到该智能体'}</p>
        <Button asChild variant="outline">
          <Link to="/">返回首页</Link>
        </Button>
      </div>
    )
  }

  // ProtectedRoute 已确保 user 存在；此分支作为类型兜底
  if (!user) return null

  return (
    <ChatWindow
      agent={agent}
      userId={user.id}
      conversationId={cid}
      initialMessages={messages}
    />
  )
}
