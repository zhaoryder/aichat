// =====================================================================
// 房间列表页（路由 /rooms）
// ---------------------------------------------------------------------
// - 顶部标题 + "创建房间"按钮
// - 创建房间对话框：房间名称 + 智能体选择
// - 房间列表网格卡片：名称 + 房主 + 创建时间 + "加入"按钮
// =====================================================================

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Users, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import type { AgentConfig } from '@shared/agents'
import type { ChatRoom } from '@shared/types'

// 相对时间格式化
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)}分钟前`
  if (diff < day) return `${Math.floor(diff / hour)}小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`
  return new Date(then).toISOString().slice(0, 10)
}

export const RoomsListPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  // 拉取活跃房间列表
  const fetchRooms = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch<{ rooms: ChatRoom[] }>('/rooms')
      setRooms(res.rooms ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  // 加入房间
  const handleJoin = useCallback(
    async (roomId: string) => {
      if (!user) {
        navigate('/auth/login')
        return
      }
      try {
        await apiFetch(`/rooms/${roomId}/join`, { method: 'POST' })
        navigate(`/rooms/${roomId}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '加入房间失败')
      }
    },
    [user, navigate],
  )

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">联机共聊房间</h1>
        <p className="mt-1 text-sm text-gray-500">
          创建或加入房间，和好友一起与 AI 共聊
        </p>
      </header>

      {/* 创建按钮 */}
      <div className="mb-6 flex justify-end">
        {user ? (
          <Button
            onClick={() => setDialogOpen(true)}
            className="gap-1.5 transition-transform duration-300 ease-out hover:scale-[1.02]"
          >
            <Plus className="h-4 w-4" />
            创建房间
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/auth/login">登录后创建房间</Link>
          </Button>
        )}
      </div>

      {/* 房间列表 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="mb-3 h-5 w-3/4" />
              <Skeleton className="mb-2 h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
              <div className="mt-4 flex justify-end">
                <Skeleton className="h-8 w-16" />
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <EmptyState title="加载失败" description={error} />
      ) : rooms.length === 0 ? (
        <EmptyState
          title="还没有活跃房间"
          description="快来创建一个，邀请好友一起整活！"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onJoin={() => handleJoin(room.id)}
            />
          ))}
        </div>
      )}

      {/* 创建房间弹窗 */}
      <CreateRoomDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(roomId) => navigate(`/rooms/${roomId}`)}
      />
    </div>
  )
}

// =====================================================================
// 房间卡片
// =====================================================================

function RoomCard({
  room,
  onJoin,
}: {
  room: ChatRoom
  onJoin: () => void
}) {
  const [agent, setAgent] = useState<AgentConfig | null>(null)

  // 懒加载智能体信息
  useEffect(() => {
    let active = true
    if (!room.agent_id) return
    apiFetch<{ agent: AgentConfig }>(`/agents/${room.agent_id}`)
      .then((res) => {
        if (active) setAgent(res.agent)
      })
      .catch(() => {
        // 拉取失败不影响卡片展示
      })
    return () => {
      active = false
    }
  }, [room.agent_id])

  const isHost = room.host_id !== null

  return (
    <Card className="hover-lift flex flex-col p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-bold text-gray-900">{room.name}</h3>
        {room.status === 'closed' && (
          <Badge variant="secondary">已关闭</Badge>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2">
        {agent && (
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundImage: agent.avatarGradient }}
            title={agent.name}
          >
            {agent.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
        <span className="truncate text-sm text-gray-600">
          {agent?.name ?? '未知智能体'}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-3 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" />
          {isHost ? '房主已就位' : '公开'}
        </span>
        <span className="text-gray-300">·</span>
        <span>{formatRelativeTime(room.created_at)}</span>
      </div>

      <div className="mt-auto flex justify-end">
        <Button
          size="sm"
          onClick={onJoin}
          disabled={room.status === 'closed'}
          className="gap-1"
        >
          <LogIn className="h-3.5 w-3.5" />
          加入
        </Button>
      </div>
    </Card>
  )
}

// =====================================================================
// 创建房间弹窗
// =====================================================================

interface CreateRoomDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (roomId: string) => void
}

function CreateRoomDialog({ open, onClose, onCreated }: CreateRoomDialogProps) {
  const [name, setName] = useState('')
  const [agentId, setAgentId] = useState('')
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // 弹窗打开时拉取智能体列表
  useEffect(() => {
    if (!open) return
    let active = true
    apiFetch<{ agents: AgentConfig[] }>('/agents?filter=all')
      .then((res) => {
        if (active) setAgents(res.agents ?? [])
      })
      .catch(() => {
        // 拉取失败则展示空列表
      })
    return () => {
      active = false
    }
  }, [open])

  // 关闭时重置表单
  useEffect(() => {
    if (!open) {
      setName('')
      setAgentId('')
      setError('')
    }
  }, [open])

  const handleSubmit = useCallback(async () => {
    const n = name.trim()
    if (n.length < 1 || n.length > 50) {
      setError('房间名称需 1-50 个字符')
      return
    }
    if (!agentId) {
      setError('请选择智能体')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await apiFetch<{ room: ChatRoom }>('/rooms/create', {
        method: 'POST',
        body: JSON.stringify({ name: n, agentId }),
      })
      onCreated(res.room.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }, [name, agentId, onCreated])

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>创建房间</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              房间名称
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="给房间起个名字（1-50 字）"
              maxLength={50}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              选择智能体
            </label>
            {agents.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <Skeleton className="size-6 shrink-0 rounded-full" />
                    <Skeleton className="h-3 flex-1" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-input p-2 scrollbar-thin">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {agents.map((a) => {
                    const checked = agentId === a.id
                    return (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <input
                          type="radio"
                          name="agent"
                          checked={checked}
                          onChange={() => setAgentId(a.id)}
                          disabled={submitting}
                          className="size-4 accent-[var(--color-primary)]"
                        />
                        <span
                          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundImage: a.avatarGradient }}
                        >
                          {a.name.trim().charAt(0).toUpperCase() || '?'}
                        </span>
                        <span className="truncate text-sm text-gray-700">
                          {a.name}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          {submitting && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-500">
              <Spinner size="sm" />
              正在创建房间…
            </div>
          )}
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        {!submitting && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleSubmit}>创建房间</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
