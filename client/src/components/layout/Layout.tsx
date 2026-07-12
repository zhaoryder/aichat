import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'

// 主布局：顶部导航 + 主内容区（子路由通过 Outlet 渲染）
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Navbar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
