import { Outlet } from 'react-router-dom'
import { Sidebar, BottomTabBar } from './Sidebar'
import { RightSidebar } from './RightSidebar'

/** 主布局：三栏（左 Sidebar + 主内容 + 右推荐栏），移动端底部 Tab Bar */
export function Layout() {
  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col pb-14 lg:pb-0">
        <Outlet />
      </main>
      <RightSidebar />
      <BottomTabBar />
    </div>
  )
}
