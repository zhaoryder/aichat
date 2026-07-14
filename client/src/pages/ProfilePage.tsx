// =====================================================================
// 个人中心
// ---------------------------------------------------------------------
// 区块：
//   1. 用户信息卡片：头像、昵称、邮箱、角色 badge、注册时间
//   2. 我的收藏列表（GET /favorite/list）
//   3. 对话历史（GET /users/me/conversations）
//   4. 我的作品（GET /studio/works）
//   5. 登出按钮
// =====================================================================

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { getAgentById } from '@shared/agents'
import { cn } from '@/lib/utils'
import type { AgentFavorite, Conversation, CreativeWork } from '@shared/types'

// UserProfile 没有 created_at，但后端 /users/me 可能返回此字段（兼容扩展）
interface ProfileWithMeta {
  created_at?: string
}

/** 相对时间格式化 */
function formatRelativeTime(iso: string | undefined | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(then).toISOString().slice(0, 10)
}

/** 完整时间格式化 */
function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProfilePage() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  // 编辑昵称 Dialog
  const [editOpen, setEditOpen] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [nicknameError, setNicknameError] = useState('')

  // 收藏列表
  const [favorites, setFavorites] = useState<AgentFavorite[]>([])
  const [favoritesLoading, setFavoritesLoading] = useState(true)

  // 对话列表
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convLoading, setConvLoading] = useState(true)

  // 作品列表
  const [works, setWorks] = useState<CreativeWork[]>([])
  const [worksLoading, setWorksLoading] = useState(true)

  // 拉取收藏
  useEffect(() => {
    let active = true
    setFavoritesLoading(true)
    apiFetch<{ favorites: AgentFavorite[] }>('/favorite/list')
      .then((res) => {
        if (!active) return
        setFavorites(res.favorites ?? [])
      })
      .catch(() => {
        if (active) setFavorites([])
      })
      .finally(() => {
        if (active) setFavoritesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // 拉取对话
  useEffect(() => {
    let active = true
    setConvLoading(true)
    apiFetch<{ conversations: Conversation[] }>('/users/me/conversations')
      .then((res) => {
        if (!active) return
        const sorted = [...(res.conversations ?? [])].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
        setConversations(sorted)
      })
      .catch(() => {
        if (active) setConversations([])
      })
      .finally(() => {
        if (active) setConvLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // 拉取作品
  useEffect(() => {
    let active = true
    setWorksLoading(true)
    apiFetch<{ works: CreativeWork[] }>('/studio/works')
      .then((res) => {
        if (!active) return
        const sorted = [...(res.works ?? [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        setWorks(sorted)
      })
      .catch(() => {
        if (active) setWorks([])
      })
      .finally(() => {
        if (active) setWorksLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function openEditNickname() {
    setNicknameInput(profile?.nickname ?? '')
    setNicknameError('')
    setEditOpen(true)
  }

  async function handleSaveNickname() {
    const name = nicknameInput.trim()
    if (!name) {
      setNicknameError('昵称不能为空')
      return
    }
    setSavingNickname(true)
    setNicknameError('')
    try {
      await apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify({ nickname: name }),
      })
      // 成功：reload 以刷新 profile
      setEditOpen(false)
      window.location.reload()
    } catch (err) {
      setNicknameError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingNickname(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  // 类型兜底：ProtectedRoute 已确保 user 存在
  if (!user || !profile) return null

  // 兼容扩展字段 created_at
  const profileMeta = profile as ProfileWithMeta & typeof profile

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">个人中心</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左列：用户信息 */}
        <div className="space-y-6 lg:col-span-1">
          {/* 用户信息卡片 */}
          <Card className="p-6">
            <div className="flex flex-col items-center text-center">
              <Avatar
                className="h-16 w-16 bg-gradient-to-br from-primary to-amber-500"
              >
                <AvatarFallback className="bg-transparent text-lg font-bold text-white">
                  {(profile.nickname || user.email || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h2 className="mt-3 text-lg font-bold text-gray-900">
                {profile.nickname || '未设置昵称'}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">{user.email}</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={profile.role === 'admin' ? 'default' : 'default'}>
                  {profile.role === 'admin' ? '管理员' : '普通用户'}
                </Badge>
                {profile.banned && <Badge variant="secondary">已封禁</Badge>}
              </div>
            </div>

            <div className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">注册时间</span>
                <span className="text-gray-700">
                  {formatDateTime(profileMeta.created_at)}
                </span>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openEditNickname}
                className="flex-1 transition-transform duration-300 ease-out hover:scale-[1.02]"
              >
                修改昵称
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                登出
              </Button>
            </div>
          </Card>
        </div>

        {/* 右列：收藏 / 对话 / 作品 */}
        <div className="space-y-6 lg:col-span-2">
          {/* 我的收藏 */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">我的收藏</h2>
              {favorites.length > 0 && (
                <span className="text-sm text-gray-500">{favorites.length} 个</span>
              )}
            </div>
            {favoritesLoading ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : favorites.length === 0 ? (
              <EmptyState
                title="还没有收藏"
                description="去智能体广场收藏你喜欢的 AI 角色"
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/agents">去广场</Link>
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {favorites.map((fav) => (
                  <FavoriteItem key={`${fav.agent_id}-${fav.agent_type}`} favorite={fav} />
                ))}
              </div>
            )}
          </Card>

          {/* 对话历史 */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">对话历史</h2>
              {conversations.length > 0 && (
                <span className="text-sm text-gray-500">{conversations.length} 个</span>
              )}
            </div>
            {convLoading ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState
                title="还没有对话"
                description="开始你的第一次 AI 对话吧"
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/agents">去聊天</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <ConversationItem key={conv.id} conversation={conv} />
                ))}
              </div>
            )}
          </Card>

          {/* 我的作品 */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">我的作品</h2>
              {works.length > 0 && (
                <span className="text-sm text-gray-500">{works.length} 件</span>
              )}
            </div>
            {worksLoading ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : works.length === 0 ? (
              <EmptyState
                title="还没有作品"
                description="去创意工坊创造你的第一件作品"
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/studio">去工坊</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {works.map((work) => (
                  <WorkItem key={work.id} work={work} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 修改昵称 Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(v) => {
          if (!v) setEditOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改昵称</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="输入新昵称"
              maxLength={32}
              disabled={savingNickname}
              autoFocus
            />
            {nicknameError && (
              <p className="text-sm text-red-600">{nicknameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={savingNickname}>
              取消
            </Button>
            <Button onClick={handleSaveNickname} disabled={savingNickname}>
              {savingNickname ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------

/** 收藏卡片：官方智能体用 getAgentById 解析，自定义显示"自定义智能体" */
function FavoriteItem({ favorite }: { favorite: AgentFavorite }) {
  const isOfficial = favorite.agent_type === 'official'
  const agent = isOfficial ? getAgentById(favorite.agent_id) : undefined
  const name = agent?.name ?? (isOfficial ? '未知智能体' : '自定义智能体')
  const title = agent?.title ?? (isOfficial ? '' : favorite.agent_id.slice(0, 8))
  const gradient = agent?.avatarGradient

  return (
    <Link to={`/chat/${favorite.agent_id}`} className="group block">
      <div className="flex items-start gap-3 rounded-xl p-3 transition-transform duration-300 ease-out hover:scale-[1.02] hover:bg-gray-50">
        {/* 头像：官方用 CSS 渐变，自定义用通用金黄 */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={
            gradient
              ? { backgroundImage: gradient }
              : { background: 'linear-gradient(135deg, #F5B400 0%, #FFA500 100%)' }
          }
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-gray-900">{name}</h3>
            <Badge variant={isOfficial ? 'default' : 'default'}>
              {isOfficial ? '官方' : '自定义'}
            </Badge>
          </div>
          {title && <p className="mt-0.5 truncate text-xs text-gray-500">{title}</p>}
        </div>
      </div>
    </Link>
  )
}

/** 对话历史项：点击跳 /chat/:agentId?cid=:conversationId */
function ConversationItem({ conversation }: { conversation: Conversation }) {
  const agent = getAgentById(conversation.agent_id)
  const title = conversation.title || agent?.name || '未命名对话'
  return (
    <Link
      to={`/chat/${conversation.agent_id}?cid=${conversation.id}`}
      className="group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-transform duration-300 ease-out hover:scale-[1.01] hover:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          更新于 {formatRelativeTime(conversation.updated_at)}
        </p>
      </div>
      <span className="text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
        继续 →
      </span>
    </Link>
  )
}

/** 作品项：显示 type Badge + 标题 + 创建时间 */
const WORK_TYPE_LABEL: Record<CreativeWork['type'], string> = {
  script: '剧本',
  video: '视频',
  image: '图片',
  article: '文章',
  game: '游戏',
  voice: '语音',
}

function WorkItem({ work }: { work: CreativeWork }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg px-3 py-2.5')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="default">{WORK_TYPE_LABEL[work.type]}</Badge>
          <span className="truncate text-sm font-medium text-gray-900">
            {work.title || '未命名作品'}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          创建于 {formatRelativeTime(work.created_at)}
        </p>
      </div>
      <Badge
        variant={
          work.status === 'done'
            ? 'default'
            : work.status === 'failed'
              ? 'secondary'
              : 'default'
        }
      >
        {work.status === 'done'
          ? '已完成'
          : work.status === 'failed'
            ? '失败'
            : work.status === 'processing'
              ? '生成中'
              : '待处理'}
      </Badge>
    </div>
  )
}
