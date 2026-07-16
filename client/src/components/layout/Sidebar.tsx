import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Home, Compass, MessageCircle, Sparkles, Bell, User, LogOut, Plus, Heart, Trophy, Users, Layers, Radio } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { getUnreadCount } from '@/lib/api'
import { cn } from '@/lib/utils'

/** 桌面端左侧 Sidebar 导航 */
export function Sidebar() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)

  // 轮询未读通知数（30s 一次）
  useEffect(() => {
    if (!user) return
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const { unread: count } = await getUnreadCount()
        setUnread(count)
      } catch {
        // ignore
      }
      timer = setTimeout(poll, 30_000)
    }

    poll()
    return () => clearTimeout(timer)
  }, [user])

  const navItems = [
    { to: '/', label: '首页', icon: Home, end: true },
    { to: '/explore', label: '探索', icon: Compass, end: false },
    { to: '/agents', label: '智能体', icon: MessageCircle, end: false },
    { to: '/live', label: 'AI 直播', icon: Radio, end: false },
    { to: '/publish', label: '发布作品', icon: Sparkles, end: false },
  ]

  return (
    <aside className="sticky top-0 hidden h-dvh w-16 flex-col items-center gap-1 border-r border-gray-200 bg-white py-4 dark:border-gray-800 dark:bg-gray-900 lg:flex lg:w-60 lg:items-stretch lg:px-3">
      {/* Logo */}
      <Link
        to="/"
        className="mb-4 flex items-center justify-center lg:justify-start lg:px-2"
      >
        <span className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-lg font-extrabold text-transparent lg:text-xl">
          AI Lab
        </span>
      </Link>

      {/* 发布按钮（GitHub green accent，导航到 /publish） */}
      {user && (
        <Button
          onClick={() => navigate('/publish')}
          variant="success"
          className="mb-4 hidden h-12 items-center justify-center gap-2 rounded-full shadow-md transition-all duration-300 ease-out hover:scale-[1.05] hover:shadow-[0_8px_24px_rgba(63,185,80,0.35)] lg:flex"
        >
          <Plus className="h-5 w-5" />
          <span>发布作品</span>
        </Button>
      )}

      {/* 主导航 */}
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:justify-start',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="hidden lg:inline">{item.label}</span>
          </NavLink>
        ))}

        {/* 通知 */}
        {user && (
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:justify-start',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
              )
            }
          >
            <div className="relative">
              <Bell className="h-5 w-5 shrink-0" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
            <span className="hidden lg:inline">通知</span>
          </NavLink>
        )}

        {/* 更多入口 */}
        <div className="mt-2 hidden border-t border-gray-200 pt-2 dark:border-gray-800 lg:block">
          <NavLink
            to="/forum"
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:justify-start',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
              )
            }
          >
            <Layers className="h-5 w-5 shrink-0" />
            <span>论坛</span>
          </NavLink>
          <NavLink
            to="/rooms"
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:justify-start',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
              )
            }
          >
            <Users className="h-5 w-5 shrink-0" />
            <span>联机房间</span>
          </NavLink>
          <NavLink
            to="/leaderboard"
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:justify-start',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
              )
            }
          >
            <Trophy className="h-5 w-5 shrink-0" />
            <span>排行榜</span>
          </NavLink>
        </div>
      </nav>

      {/* 底部：主题切换 + 用户 */}
      <div className="flex flex-col items-center gap-2 border-t border-gray-200 pt-2 dark:border-gray-800 lg:items-stretch lg:px-1">
        <div className="flex items-center justify-center lg:justify-start lg:gap-3 lg:px-2">
          <ThemeToggle />
        </div>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-center gap-2 rounded-xl p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 lg:justify-start">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{profile?.nickname?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                </Avatar>
                <span className="hidden truncate text-sm lg:inline">{profile?.nickname || '用户'}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile">
                  <User className="mr-2 h-4 w-4" />个人主页
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Heart className="mr-2 h-4 w-4" />个性化装扮
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/admin">
                  <Layers className="mr-2 h-4 w-4" />管理后台
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  import('@/lib/supabase').then(({ supabase }) =>
                    supabase.auth.signOut().then(() => navigate('/')),
                  )
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild size="sm" className="hidden lg:flex">
            <Link to="/auth/login">登录</Link>
          </Button>
        )}
      </div>
    </aside>
  )
}

/** 移动端底部 Tab Bar */
export function BottomTabBar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const { unread: count } = await getUnreadCount()
        setUnread(count)
      } catch { /* ignore */ }
      timer = setTimeout(poll, 30_000)
    }
    poll()
    return () => clearTimeout(timer)
  }, [user])

  const tabs = [
    { to: '/', label: '首页', icon: Home, end: true },
    { to: '/explore', label: '探索', icon: Compass, end: false },
    { to: '/publish', label: '发布', icon: Plus, end: false, isAction: true },
    ...(user
      ? [{ to: '/live', label: '直播', icon: Radio, end: false }]
      : []),
    ...(user
      ? [{ to: '/notifications', label: '通知', icon: Bell, end: false, badge: unread }]
      : []),
    ...(user
      ? [{ to: '/profile', label: '我的', icon: User, end: false }]
      : [{ to: '/auth/login', label: '登录', icon: User, end: false }]),
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 lg:hidden">
      {tabs.map((tab) => {
        if (tab.isAction) {
          return (
            <button
              key={tab.label}
              onClick={() => navigate('/publish')}
              className="flex flex-col items-center gap-0.5"
              aria-label="发布作品"
            >
              <div className="flex h-10 w-10 -translate-y-2 items-center justify-center rounded-full bg-accent text-white shadow-[0_4px_16px_rgba(63,185,80,0.45)] transition-all duration-300 ease-out hover:scale-110 hover:shadow-[0_6px_24px_rgba(63,185,80,0.6)]">
                <tab.icon className="h-6 w-6" />
              </div>
            </button>
          )
        }
        return (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 text-xs',
                isActive ? 'text-primary' : 'text-gray-500 dark:text-gray-400',
              )
            }
          >
            <div className="relative">
              <tab.icon className="h-5 w-5" />
              {tab.badge && tab.badge > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </div>
            <span>{tab.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
