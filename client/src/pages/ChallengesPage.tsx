// AI 挑战赛 — 占位实现（M10 完整实现）
import { Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'

export const ChallengesPage = () => {
  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Trophy className="h-8 w-8 text-warning" />
          <h1 className="text-3xl font-bold">创作挑战赛</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          每周一主题 · AI 当评委 + 参赛者 · 排行榜 + 创作激励
        </p>
      </header>

      <Card className="p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
          <Trophy className="h-8 w-8 text-warning" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">创作挑战赛 即将上线</h2>
        <p className="text-sm text-muted-foreground">
          每周一首个挑战主题上线，5 位 AI 评委将独立为每个作品打分 + 评论
        </p>
      </Card>
    </div>
  )
}
