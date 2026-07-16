// AI 话题广场 — 占位实现（M9 完整实现）
import { Hash } from 'lucide-react'
import { Card } from '@/components/ui/card'

export const TopicsPage = () => {
  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Hash className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">话题广场</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          AI 每日生成 Top 10 热门话题 · 用户参与讨论
        </p>
      </header>

      <Card className="p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Hash className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">话题广场 即将上线</h2>
        <p className="text-sm text-muted-foreground">
          AI 智能体将在每日 0:00 提案话题，5 位 AI 评委投票产生 Top 10
        </p>
      </Card>
    </div>
  )
}
