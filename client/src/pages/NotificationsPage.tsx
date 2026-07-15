import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Heart, MessageCircle, Repeat2, UserPlus, Info, Loader2, Check } from 'lucide-react'
import { getNotifications, markNotificationsRead } from '@/lib/api'
import type { AppNotification } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    try {
      const { notifications: list, unread: count } = await getNotifications()
      setNotifications(list)
      setUnread(count)
    } catch (err) {
      console.error('[NotificationsPage] error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnread(0)
      toast.success('已全部标记为已读')
    } catch {
      toast.error('操作失败')
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* 页头 */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">通知</h1>
          {unread > 0 && (
            <p className="mt-0.5 text-xs text-primary">{unread} 条未读</p>
          )}
        </div>
        {unread > 0 && (
          <Button size="sm" variant="ghost" onClick={handleMarkAllRead}>
            <Check className="mr-1.5 h-4 w-4" />
            全部已读
          </Button>
        )}
      </div>

      {/* 通知列表 */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">暂无通知</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            关注其他用户或发布动态后会收到通知
          </p>
        </div>
      ) : (
        <div>
          {notifications.map((n) => {
            const icon = getNotificationIcon(n.type)
            const link = getNotificationLink(n)

            return (
              <Link
                key={n.id}
                to={link}
                className={cn(
                  'flex items-start gap-3 border-b border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50',
                  !n.read && 'bg-primary/5 dark:bg-primary/5',
                )}
              >
                {/* 图标 */}
                <div className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  n.type === 'like' && 'bg-red-100 text-red-500 dark:bg-red-900/30',
                  n.type === 'comment' && 'bg-blue-100 text-blue-500 dark:bg-blue-900/30',
                  n.type === 'repost' && 'bg-green-100 text-green-500 dark:bg-green-900/30',
                  n.type === 'follow' && 'bg-purple-100 text-purple-500 dark:bg-purple-900/30',
                  n.type === 'system' && 'bg-gray-100 text-gray-500 dark:bg-gray-800',
                )}>
                  {icon}
                </div>

                {/* 头像 + 内容 */}
                {n.actor && (
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-amber-500 text-xs text-white">
                      {n.actor.nickname?.[0]?.toUpperCase() ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {getNotificationText(n)}
                  </p>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatRelativeTime(n.created_at)}
                  </span>
                </div>

                {/* 未读圆点 */}
                {!n.read && (
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getNotificationIcon(type: AppNotification['type']) {
  switch (type) {
    case 'like': return <Heart className="h-4 w-4" />
    case 'comment': return <MessageCircle className="h-4 w-4" />
    case 'repost': return <Repeat2 className="h-4 w-4" />
    case 'follow': return <UserPlus className="h-4 w-4" />
    default: return <Info className="h-4 w-4" />
  }
}

function getNotificationText(n: AppNotification): string {
  const name = n.actor?.nickname ?? '某用户'
  switch (n.type) {
    case 'like': return `${name} 赞了你的动态`
    case 'comment': return `${name} 评论了你的动态`
    case 'repost': return `${name} 转发了你的动态`
    case 'follow': return `${name} 关注了你`
    case 'system': return '系统通知'
    default: return '收到一条新通知'
  }
}

function getNotificationLink(n: AppNotification): string {
  if (n.type === 'follow') return `/profile/${n.actor_id}`
  if (n.target_id) return `/post/${n.target_id}`
  return '/notifications'
}
