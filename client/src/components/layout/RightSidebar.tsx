import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Users, Sparkles } from 'lucide-react'
import { agents } from '@shared/agents'
import type { AgentConfig } from '@shared/agents'

/** 桌面端右侧推荐栏 */
export function RightSidebar() {
  const [hotAgents] = useState<AgentConfig[]>(() => agents.slice(0, 5))

  return (
    <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/50 xl:block">
      {/* 搜索框占位 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
          <span>🔍</span>
          <span>搜索 AI Lab...</span>
        </div>
      </div>

      {/* 热门智能体 */}
      <section className="mb-6">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <Sparkles className="h-4 w-4 text-primary" />
          热门智能体
        </h3>
        <div className="space-y-1">
          {hotAgents.map((agent) => (
            <Link
              key={agent.id}
              to={`/chat/${agent.id}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white dark:hover:bg-gray-800"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-white"
                style={{ backgroundImage: agent.avatarGradient }}
              >
                {agent.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{agent.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{agent.era}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 热门话题 */}
      <section className="mb-6">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <TrendingUp className="h-4 w-4 text-primary" />
          热门话题
        </h3>
        <div className="space-y-1">
          {[
            { tag: '#VibeCoding', desc: '用自然语言写代码' },
            { tag: '#AI绘画', desc: '分享你的 AI 画作' },
            { tag: '#智能体创作', desc: '打造你的 AI 角色' },
            { tag: '#提示词分享', desc: '好用的 prompt' },
          ].map((t) => (
            <Link
              key={t.tag}
              to="/explore"
              className="block rounded-lg px-3 py-2 transition-colors hover:bg-white dark:hover:bg-gray-800"
            >
              <p className="text-sm font-medium text-primary">{t.tag}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 推荐创作者 */}
      <section>
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <Users className="h-4 w-4 text-primary" />
          推荐创作者
        </h3>
        <div className="space-y-1">
          {[
            { name: 'AI Explorer', desc: 'Vibe Code 达人' },
            { name: 'Prompt Engineer', desc: '提示词专家' },
            { name: 'Creative Coder', desc: '创意编程' },
          ].map((c) => (
            <Link
              key={c.name}
              to="/explore"
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white dark:hover:bg-gray-800"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-amber-500 text-sm font-bold text-white">
                {c.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{c.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </aside>
  )
}
