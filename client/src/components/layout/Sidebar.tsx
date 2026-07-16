import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Home, Sparkles, Plus, MessageCircle, User, LogOut, Bell, Puzzle, Settings } from 'lucide-react'
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

/** 桌面端左侧 Sidebar 导航 — 极简白底风格 */
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
    { to: '/daily', label: '灵感', icon: Sparkles, end: false },
    { to: '/chat', label: '聊天', icon: MessageCircle, end: false },
    { to: '/skills', label: 'Skill 市场', icon: Puzzle, end: false },
    { to: '/settings/memory', label: 'AI 记忆', icon: Settings, end: false },
  ]

  return (
    <aside className="sticky top-0 z-30 hidden h-dvh w-16 flex-col items-center border-r border-[hsl(var(--border))] bg-[hsl(var(--background))] py-4 lg:flex lg:w-56 lg:items-stretch lg:px-3">
      {/* Logo */}
      <Link
        to="/"
        className="mb-6 flex items-center justify-center lg:justify-start lg:px-3"
      >
        <span className="text-lg font-bold tracking-tight text-[hsl(var(--foreground))] lg:text-xl">
          AI Lab
        </span>
      </Link>

      {/* 发布按钮 — 极简黑色圆角按钮 */}
      <Button
        onClick={() => navigate('/publish')}
        className="mb-4 hidden h-10 items-center justify-center gap-2 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-md lg:flex lg:px-6"
      >
        <Plus className="h-4 w-4" />
        <span className="text-sm font-medium">发布作品</span>
      </Button>

      {/* 主导航 */}
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out lg:justify-start',
                isActive
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]',
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="hidden lg:inline">{item.label}</span>
          </NavLink>
        ))}

        {/* 通知（带未读 badge） */}
        {user && (
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out lg:justify-start',
                isActive
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]',
              )
            }
          >
            <div className="relative">
              <Bell className="h-5 w-5 shrink-0" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--destructive))] px-1 text-[10px] font-bold text-[hsl(var(--destructive-foreground))]">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
            <span className="hidden lg:inline">通知</span>
          </NavLink>
        )}

        {/* 我 */}
        {user ? (
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out lg:justify-start',
                isActive
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]',
              )
            }
          >
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-[hsl(var(--muted))] text-xs">
                {profile?.nickname?.[0]?.toUpperCase() ?? 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="hidden lg:inline truncate">{profile?.nickname || '我'}</span>
          </NavLink>
        ) : (
          <NavLink
            to="/auth/login"
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out lg:justify-start',
                isActive
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]',
              )
            }
          >
            <User className="h-5 w-5 shrink-0" />
            <span className="hidden lg:inline">登录</span>
          </NavLink>
        )}
      </nav>

      {/* 底部：主题切换 + 用户菜单 */}
      <div className="flex flex-col items-center gap-2 border-t border-[hsl(var(--border))] pt-2 lg:items-stretch lg:px-1">
        <div className="flex items-center justify-center lg:justify-start lg:px-3">
          <ThemeToggle />
        </div>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-[hsl(var(--muted))] lg:justify-start lg:px-3">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-[hsl(var(--muted))] text-xs">
                    {profile?.nickname?.[0]?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden truncate text-sm lg:inline">{profile?.nickname || '用户'}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <User className="mr-2 h-4 w-4" />设置
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/admin">
                  <Sparkles className="mr-2 h-4 w-4" />管理后台
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
        )}
      </div>
    </aside>
  )
}

/** 移动端底部 Tab Bar — 5 项 + 中间凸起 + 按钮 */
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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-[hsl(var(--border))] bg-[hsl(var(--background))/0.95] backdrop-blur-md lg:hidden">
      {/* 首页 */}
      <TabItem to="/" label="首页" icon={Home} end />

      {/* 灵感 */}
      <TabItem to="/daily" label="灵感" icon={Sparkles} />

      {/* + 发布（中间凸起） */}
      <button
        onClick={() => navigate('/publish')}
        className="flex flex-col items-center"
        aria-label="发布作品"
      >
        <div className="flex h-12 w-12 -translate-y-3 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg transition-all duration-300 ease-out hover:scale-105 hover:shadow-xl">
          <Plus className="h-6 w-6" />
        </div>
      </button>

      {/* 聊天 */}
      <TabItem to="/chat" label="聊天" icon={MessageCircle} />

      {/* 我 */}
      {user ? (
        <TabItem to="/profile" label="我" icon={User} badge={unread} />
      ) : (
        <TabItem to="/auth/login" label="登录" icon={User} />
      )}
    </nav>
  )
}

/** Tab 项组件 */
function TabItem({
  to,
  label,
  icon: Icon,
  end,
  badge,
}: {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-0.5 text-xs transition-colors',
          isActive
            ? 'text-[hsl(var(--foreground))]'
            : 'text-[hsl(var(--muted-foreground))]',
        )
      }
    >
      <div className="relative">
        <Icon className="h-5 w-5" />
        {badge && badge > 0 && (
          <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[hsl(var(--destructive))] px-1 text-[9px] font-bold text-[hsl(var(--destructive-foreground))]">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span>{label}</span>
    </NavLink>
  )
}
