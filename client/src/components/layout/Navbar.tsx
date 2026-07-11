import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

// 导航项配置
const navItems = [
  { to: '/', label: '首页', end: true },
  { to: '/agents', label: '广场', end: false },
  { to: '/forum', label: '论坛', end: false },
  { to: '/studio', label: '创意工坊', end: false },
]

// 顶部导航栏
export function Navbar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    setMenuOpen(false)
    setMobileOpen(false)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* 左侧 logo */}
        <Link
          to="/"
          className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-xl font-extrabold text-transparent transition-transform duration-300 ease-out hover:scale-[1.05]"
        >
          AI 搞笑工坊
        </Link>

        {/* 中间导航（桌面端） */}
        <div className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300 ease-out hover:scale-[1.02] hover:bg-primary/10',
                  isActive ? 'text-primary' : 'text-gray-700 hover:text-primary',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* 右侧用户区（桌面端） */}
        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <div
              className="relative"
              onMouseEnter={() => setMenuOpen(true)}
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button className="flex items-center gap-2 rounded-full p-1 transition-transform duration-300 ease-out hover:scale-[1.05]">
                <Avatar
                  name={profile?.nickname || user.email || 'U'}
                  size="sm"
                  gradient="from-primary to-amber-500"
                />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-40 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-gray-200 animate-fade-in">
                  <Link
                    to="/profile"
                    className="block px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-primary/10 hover:text-primary"
                    onClick={() => setMenuOpen(false)}
                  >
                    个人中心
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    登出
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth/login">登录</Link>
            </Button>
          )}
        </div>

        {/* 移动端汉堡按钮 */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-muted md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="菜单"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? (
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>

      {/* 移动端展开菜单 */}
      {mobileOpen && (
        <div className="border-t border-gray-200 bg-white px-4 py-3 md:hidden animate-fade-in">
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
                    isActive ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-muted',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="my-2 h-px bg-gray-100" />
            {user ? (
              <>
                <Link
                  to="/profile"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-muted"
                >
                  个人中心
                </Link>
                <button
                  onClick={handleSignOut}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-muted"
                >
                  登出
                </button>
              </>
            ) : (
              <Link
                to="/auth/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-black transition-transform duration-300 hover:scale-[1.02]"
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
