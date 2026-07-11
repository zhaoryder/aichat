// 主页：Hero 区 + 智能体卡片网格
import { Link, useNavigate } from 'react-router-dom'
import { agents, type AgentConfig } from '@shared/agents'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

// 智能体头像：用 CSS 渐变背景渲染圆形头像 + 首字母
// AgentConfig.avatarGradient 是 CSS linear-gradient 字符串，需内联 style 渲染，
// 不能用 Avatar 组件（其 gradient prop 是 tailwind 类片段）
function AgentAvatar({ agent, size = 'md' }: { agent: AgentConfig; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-12 w-12 text-base',
    lg: 'h-16 w-16 text-xl',
  }[size]
  const initial = agent.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sizeClass}`}
      style={{ backgroundImage: agent.avatarGradient }}
    >
      {initial}
    </div>
  )
}

export const HomePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  // CTA：已登录跳第一个智能体对话，未登录跳广场
  function handleStart() {
    if (user && agents[0]) navigate(`/chat/${agents[0].id}`)
    else navigate('/agents')
  }

  return (
    <div className="animate-fade-in">
      {/* Hero 区：金黄渐变标题 + 副标题 + CTA */}
      <section className="mx-auto max-w-5xl px-4 pb-10 pt-16 text-center sm:pt-20">
        <h1 className="bg-gradient-to-r from-primary via-amber-400 to-orange-500 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl md:text-6xl">
          AI 搞笑工坊
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-gray-600 sm:text-lg">
          和 17 位穿越时空的&ldquo;灵魂人物&rdquo;聊聊天——从孔子到马斯克，从林黛玉到 C 罗，每一位都会用专属的毒舌与梗陪你整活。
        </p>
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={handleStart}
            className="gap-2 transition-transform duration-300 ease-out hover:scale-[1.02]"
          >
            立即开始
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        </div>
      </section>

      {/* 智能体卡片网格 */}
      <section className="mx-auto max-w-7xl px-4 pb-20">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">选择一位智能体开始对话</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link key={agent.id} to={`/chat/${agent.id}`} className="group block">
              <Card hoverScale className="h-full p-5">
                <div className="flex items-start gap-4">
                  <AgentAvatar agent={agent} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-bold text-gray-900">{agent.name}</h3>
                      <Badge variant="default" className="shrink-0">{agent.era}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{agent.title}</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
                  &ldquo;{agent.tagline}&rdquo;
                </p>
                <div className="mt-4 flex items-center justify-end">
                  <span className="text-xs font-medium text-primary transition-transform duration-300 ease-out group-hover:translate-x-1">
                    {user ? '开始对话 →' : '去登录 →'}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
