import { Outlet } from 'react-router-dom'
import { Sidebar, BottomTabBar } from './Sidebar'

/** 主布局：两栏（左 Sidebar + 主内容），移动端底部 Tab Bar */
export function Layout() {
  return (
    <div className="flex min-h-dvh bg-[hsl(var(--background))]">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  )
}
