import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, User, LogOut, ChevronDown, Image, Sparkles, Trophy, BarChart3, MessageCircle, Moon, Layers, FileText, FolderOpen, Users, Palette } from 'lucide-react'
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
import { cn } from '@/lib/utils'

// 导航项配置
const navItems = [
  { to: '/', label: '首页', end: true },
  { to: '/agents', label: '广场', end: false },
  { to: '/forum', label: '论坛', end: false },
  { to: '/studio', label: '创意工坊', end: false },
]

// 2.0 新功能导航项（放入"探索"下拉菜单）
const exploreItems = [
  { to: '/gallery', label: 'AI 绘画广场', icon: Image },
  { to: '/media', label: '我的素材库', icon: FolderOpen },
  { to: '/teams', label: '多智能体协作', icon: Users },
  { to: '/rooms', label: '联机房间', icon: MessageCircle },
  { to: '/prompts', label: '提示词市场', icon: FileText },
  { to: '/cards', label: '角色卡牌', icon: Layers },
  { to: '/ai-feed', label: 'AI 朋友圈', icon: MessageCircle },
  { to: '/achievements', label: '成就系统', icon: Trophy },
  { to: '/leaderboard', label: '排行榜', icon: BarChart3 },
  { to: '/emo-wall', label: '深夜 emo 墙', icon: Moon },
  { to: '/settings', label: '个性化装扮', icon: Palette },
]

// 顶部导航栏
export function Navbar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    setMobileOpen(false)
    navigate('/')
  }

  // 提取用户首字母（中文取第一个字，英文取首字母）
  const initial = (profile?.nickname || user?.email || 'U').trim().charAt(0).toUpperCase()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4">
        {/* 左侧 logo */}
        <Link
          to="/"
          className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-xl font-extrabold text-transparent transition-transform duration-300 ease-out hover:scale-[1.05]"
        >
          AI 搞笑工坊
        </Link>

        {/* 中间导航（桌面端） */}
        <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300 ease-out hover:scale-[1.02] hover:bg-primary/10',
                  isActive ? 'text-primary' : 'text-foreground hover:text-primary',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          {/* 探索下拉菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300 ease-out hover:scale-[1.02] hover:bg-primary/10 text-foreground hover:text-primary">
                <Sparkles className="h-4 w-4" />
                探索
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              <DropdownMenuLabel>2.0 新功能</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {exploreItems.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to} className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 右侧用户区（桌面端） */}
        <div className="hidden items-center gap-1 md:flex">
          <ThemeToggle />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center rounded-full p-1 transition-transform duration-300 ease-out hover:scale-[1.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-8 w-8 bg-gradient-to-br from-primary to-amber-500">
                    <AvatarFallback className="bg-transparent font-bold text-white">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    个人中心
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  登出
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth/login">登录</Link>
            </Button>
          )}
        </div>

        {/* 移动端右侧：主题切换 + 汉堡按钮 */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="菜单"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </nav>

      {/* 移动端展开菜单 */}
      {mobileOpen && (
        <div className="border-t border-border bg-background px-4 py-3 md:hidden animate-fade-in">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="my-2 h-px bg-border" />
            <p className="px-3 py-1 text-xs font-medium text-muted-foreground">探索</p>
            {exploreItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Icon className="h-4 w-4 text-primary" />
                  {item.label}
                </Link>
              )
            })}
            <div className="my-2 h-px bg-border" />
            {user ? (
              <>
                <Link
                  to="/profile"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  个人中心
                </Link>
                <button
                  onClick={handleSignOut}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  登出
                </button>
              </>
            ) : (
              <Link
                to="/auth/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground transition-transform duration-300 hover:scale-[1.02]"
              >
                登录
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
