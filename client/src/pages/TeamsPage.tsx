// 多智能体并行协作页面（Task 7.1）
// - 一键组队模板：4 类预设（文案 / 绘图 / 短视频 / 纠错）
// - 已保存团队列表（GET /api/teams）
// - 团队创建表单：名称 + 多选智能体（最多 6）+ 每 agent 工具权限
// - 团队执行界面：SSE 多 agent 并行流式输出
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, apiStream } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AgentTeam } from '@shared/types'
import type { AgentConfig } from '@shared/agents'
import {
  Users,
  Sparkles,
  PenLine,
  Palette,
  Video,
  GraduationCap,
  Plus,
  Check,
  Play,
  Loader2,
  ChevronLeft,
  Search,
  Image as ImageIcon,
  Film,
  FileText,
  Square,
} from 'lucide-react'

// ---------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------

const MAX_AGENTS = 6

/** 工具权限项配置 */
const TOOL_OPTIONS = [
  { key: 'search' as const, label: '联网搜索', Icon: Search },
  { key: 'imageGen' as const, label: '图片生成', Icon: ImageIcon },
  { key: 'videoGen' as const, label: '视频生成', Icon: Film },
  { key: 'fileOp' as const, label: '文件操作', Icon: FileText },
]

interface ToolFlags {
  search: boolean
  imageGen: boolean
  videoGen: boolean
  fileOp: boolean
}

const DEFAULT_TOOLS: ToolFlags = {
  search: false,
  imageGen: false,
  videoGen: false,
  fileOp: false,
}

/** 一键组队模板（4 类预设） */
const TEAM_TEMPLATES = [
  {
    key: 'copywriting',
    title: '文案团队',
    description: '4 位文字大师同台献艺，从诗词到杂文一网打尽',
    Icon: PenLine,
    gradient: 'from-rose-500 to-amber-500',
    agentIds: ['libai', 'luxun', 'confucius', 'dufu'],
  },
  {
    key: 'drawing',
    title: '绘图团队',
    description: '4 位画师各显神通，印象派到立体主义风格齐发',
    Icon: Palette,
    gradient: 'from-fuchsia-500 to-pink-500',
    agentIds: ['vangogh', 'picasso', 'monet', 'davinci'],
  },
  {
    key: 'video',
    title: '短视频团队',
    description: '脚本、口播、相声、直播一应俱全，短平快内容流水线',
    Icon: Video,
    gradient: 'from-sky-500 to-indigo-500',
    agentIds: ['standup-comic', 'host', 'cross-talk', 'streamer'],
  },
  {
    key: 'proofreading',
    title: '纠错团队',
    description: '科学家与哲学家坐镇，专治逻辑漏洞与表达硬伤',
    Icon: GraduationCap,
    gradient: 'from-emerald-500 to-teal-500',
    agentIds: ['einstein', 'newton', 'socrates', 'cto'],
  },
]

// 流式状态
type StreamStatus = 'pending' | 'running' | 'done'

interface AgentStreamState {
  name: string
  avatarGradient?: string
  content: string
  status: StreamStatus
}

// 智能体列表响应（与 AgentsSquarePage 一致）
interface AgentsResponse {
  agents: AgentConfig[]
  total: number
  page: number
  pageSize: number
}

// ---------------------------------------------------------------------
// 主页面
// ---------------------------------------------------------------------

export const TeamsPage = () => {
  const { user, loading: authLoading } = useAuth()

  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)

  const [teams, setTeams] = useState<AgentTeam[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [teamsError, setTeamsError] = useState('')

  // 创建表单
  const [teamName, setTeamName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [toolPerms, setToolPerms] = useState<Record<string, ToolFlags>>({})
  const [saving, setSaving] = useState(false)

  // 执行界面
  const [activeTeam, setActiveTeam] = useState<AgentTeam | null>(null)
  const [execMessage, setExecMessage] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [streams, setStreams] = useState<Record<string, AgentStreamState>>({})
  const [execError, setExecError] = useState('')

  // 拉取智能体列表
  useEffect(() => {
    let active = true
    setAgentsLoading(true)
    apiFetch<AgentsResponse>('/agents?filter=all&page=1&pageSize=200')
      .then((res) => {
        if (!active) return
        setAgents(res.agents ?? [])
      })
      .catch(() => {
        if (!active) return
      })
      .finally(() => {
        if (active) setAgentsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // 拉取已保存团队
  const loadTeams = () => {
    setTeamsLoading(true)
    setTeamsError('')
    apiFetch<{ teams: AgentTeam[] }>('/teams')
      .then((res) => setTeams(res.teams ?? []))
      .catch((err: Error) => setTeamsError(err.message || '加载失败'))
      .finally(() => setTeamsLoading(false))
  }

  useEffect(() => {
    if (user) loadTeams()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // 智能体查找辅助
  function getAgentMeta(id: string): {
    name: string
    avatarGradient: string
  } {
    const found = agents.find((a) => a.id === id)
    if (found) {
      return { name: found.name, avatarGradient: found.avatarGradient }
    }
    return { name: id, avatarGradient: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)' }
  }

  // 选择 / 取消智能体
  function toggleAgent(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id)
        setToolPerms((tp) => {
          const copy = { ...tp }
          delete copy[id]
          return copy
        })
        return next
      }
      if (prev.length >= MAX_AGENTS) {
        toast.warning(`最多选择 ${MAX_AGENTS} 个智能体`)
        return prev
      }
      setToolPerms((tp) => ({ ...tp, [id]: { ...DEFAULT_TOOLS } }))
      return [...prev, id]
    })
  }

  // 切换工具权限
  function toggleTool(agentId: string, key: keyof ToolFlags) {
    setToolPerms((prev) => {
      const cur = prev[agentId] ?? { ...DEFAULT_TOOLS }
      return { ...prev, [agentId]: { ...cur, [key]: !cur[key] } }
    })
  }

  // 应用模板
  function applyTemplate(tpl: (typeof TEAM_TEMPLATES)[number]) {
    // 只保留存在的 agent
    const valid = tpl.agentIds.filter((id) => agents.some((a) => a.id === id))
    setSelectedIds(valid)
    const perms: Record<string, ToolFlags> = {}
    for (const id of valid) perms[id] = { ...DEFAULT_TOOLS }
    setToolPerms(perms)
    setTeamName(tpl.title)
    toast.success(`已套用「${tpl.title}」模板，可调整后保存`)
    // 滚动到创建表单
    setTimeout(() => {
      document.getElementById('create-form')?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }

  // 保存团队
  async function handleSave() {
    const name = teamName.trim()
    if (!name) {
      toast.error('请填写团队名称')
      return
    }
    if (selectedIds.length === 0) {
      toast.error('请至少选择 1 个智能体')
      return
    }
    setSaving(true)
    try {
      const config = {
        toolPermissions: Object.fromEntries(
          selectedIds.map((id) => [id, toolPerms[id] ?? DEFAULT_TOOLS])
        ),
      }
      await apiFetch<{ team: AgentTeam }>('/teams/create', {
        method: 'POST',
        body: JSON.stringify({ name, agentIds: selectedIds, config }),
      })
      toast.success('团队已保存')
      setTeamName('')
      setSelectedIds([])
      setToolPerms({})
      loadTeams()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 退出执行界面
  function exitExec() {
    setActiveTeam(null)
    setStreams({})
    setExecMessage('')
    setExecError('')
  }

  // 启动并行执行
  async function handleExecute() {
    const trimmed = execMessage.trim()
    if (!trimmed || isExecuting || !activeTeam) return

    setIsExecuting(true)
    setExecError('')

    // 初始化占位
    const initial: Record<string, AgentStreamState> = {}
    for (const id of activeTeam.agent_ids) {
      const meta = getAgentMeta(id)
      initial[id] = {
        name: meta.name,
        avatarGradient: meta.avatarGradient,
        content: '',
        status: 'pending',
      }
    }
    setStreams(initial)

    try {
      const res = await apiStream(`/teams/${activeTeam.id}/execute`, {
        message: trimmed,
      })
      if (!res.body) {
        setExecError('未收到响应流')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            let data: Record<string, unknown>
            try {
              data = JSON.parse(line.slice(6))
            } catch {
              continue
            }
            handleSSEEvent(currentEvent, data)
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '执行失败'
      setExecError(msg)
      toast.error(msg)
    } finally {
      setIsExecuting(false)
    }
  }

  function handleSSEEvent(event: string, data: Record<string, unknown>) {
    const agentId = typeof data.agentId === 'string' ? data.agentId : ''
    switch (event) {
      case 'agent_start': {
        const agentName =
          typeof data.agentName === 'string' ? data.agentName : agentId
        if (agentId) {
          setStreams((prev) => {
            const prev_s = prev[agentId]
            return {
              ...prev,
              [agentId]: {
                name: agentName,
                avatarGradient: prev_s?.avatarGradient,
                content: prev_s?.content ?? '',
                status: 'running',
              },
            }
          })
        }
        break
      }
      case 'token': {
        const c = typeof data.c === 'string' ? data.c : ''
        if (agentId && c) {
          setStreams((prev) => {
            const prev_s = prev[agentId]
            if (!prev_s) return prev
            return {
              ...prev,
              [agentId]: { ...prev_s, content: prev_s.content + c },
            }
          })
        }
        break
      }
      case 'agent_done': {
        if (agentId) {
          setStreams((prev) => {
            const prev_s = prev[agentId]
            if (!prev_s) return prev
            return { ...prev, [agentId]: { ...prev_s, status: 'done' } }
          })
        }
        break
      }
      case 'done': {
        // 兜底：把仍在 pending/running 的标记为 done
        setStreams((prev) => {
          const next: Record<string, AgentStreamState> = {}
          for (const k of Object.keys(prev)) {
            const s = prev[k]
            next[k] =
              s.status === 'running' || s.status === 'pending'
                ? { ...s, status: 'done' }
                : s
          }
          return next
        })
        break
      }
      case 'error': {
        const msg = typeof data.message === 'string' ? data.message : '执行失败'
        setExecError(msg)
        toast.error(msg)
        break
      }
      default:
        break
    }
  }

  const canExecute = execMessage.trim().length > 0 && !isExecuting

  // 未登录提示
  if (!authLoading && !user) {
    return (
      <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
        <Card className="hover-lift p-8">
          <EmptyState
            title="登录后开启多智能体协作"
            description="登录账号即可组队并让多个智能体并行为你工作"
            action={
              <Button asChild>
                <Link to="/auth/login">去登录</Link>
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="flex items-center gap-2 bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
          <Users className="h-8 w-8 text-primary" />
          多智能体协作
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          组建你的 AI 梦之队，一次提问，多位智能体并行作答，灵感碰撞
        </p>
      </header>

      {/* 执行界面（选中团队后置顶显示） */}
      {activeTeam && (
        <Card className="hover-lift mb-8 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={exitExec}>
                <ChevronLeft className="h-4 w-4" /> 返回
              </Button>
              <h2 className="text-lg font-bold text-gray-900">
                执行团队：{activeTeam.name}
              </h2>
              <Badge variant="secondary">
                {activeTeam.agent_ids.length} 个智能体
              </Badge>
            </div>
            {isExecuting && (
              <Button variant="outline" size="sm" disabled>
                <Loader2 className="h-4 w-4 animate-spin" /> 执行中
              </Button>
            )}
          </div>

          {/* 输入区 */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Textarea
                value={execMessage}
                onChange={(e) => setExecMessage(e.target.value)}
                placeholder="输入要让团队并行回答的问题，例如：用一句话点评今天的天气"
                rows={3}
                disabled={isExecuting}
              />
            </div>
            <Button
              onClick={handleExecute}
              disabled={!canExecute}
              className="gap-1.5 transition-transform duration-300 ease-out hover:scale-[1.02]"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 生成中…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> 启动并行执行
                </>
              )}
            </Button>
          </div>

          {execError && (
            <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {execError}
            </div>
          )}

          {/* 并行流式输出区 */}
          {Object.keys(streams).length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {activeTeam.agent_ids.map((agentId) => (
                <AgentStreamCard
                  key={agentId}
                  agentId={agentId}
                  state={streams[agentId]}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="输入问题后启动并行执行"
              description="每位智能体将独立流式作答，结果并列展示"
              icon={<Play className="h-8 w-8" />}
            />
          )}
        </Card>
      )}

      {/* 一键组队模板 */}
      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
          <Sparkles className="h-5 w-5 text-primary" />
          一键组队模板
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM_TEMPLATES.map((tpl) => {
            const Icon = tpl.Icon
            return (
              <Card key={tpl.key} className="hover-lift flex flex-col p-5">
                <div
                  className={cn(
                    'mb-3 flex size-10 items-center justify-center rounded-lg bg-gradient-to-br text-white',
                    tpl.gradient,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-gray-900">{tpl.title}</h3>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-gray-500">
                  {tpl.description}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 w-full transition-transform duration-300 ease-out hover:scale-[1.02]"
                  onClick={() => applyTemplate(tpl)}
                  disabled={agentsLoading}
                >
                  <Plus className="h-4 w-4" /> 使用此模板
                </Button>
              </Card>
            )
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
        {/* 左侧：已保存团队 */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
            <Users className="h-5 w-5 text-primary" />
            我的团队
          </h2>

          {teamsLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                  <Skeleton className="mb-3 h-5 w-32" />
                  <Skeleton className="mb-2 h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          ) : teamsError ? (
            <EmptyState title="加载失败" description={teamsError} />
          ) : teams.length === 0 ? (
            <EmptyState
              title="还没有保存的团队"
              description="套用左侧模板或下方手动组队后保存"
              icon={<Users className="h-8 w-8" />}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {teams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  agents={agents}
                  onExecute={() => {
                    setActiveTeam(team)
                    setStreams({})
                    setExecMessage('')
                    setExecError('')
                    setTimeout(() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }, 50)
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* 右侧：创建表单 */}
        <section id="create-form">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
            <Plus className="h-5 w-5 text-primary" />
            创建团队
          </h2>
          <Card className="hover-lift p-5">
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  团队名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="例如：晨会文案小队"
                  maxLength={50}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    选择智能体
                  </span>
                  <Badge variant="secondary">
                    {selectedIds.length} / {MAX_AGENTS}
                  </Badge>
                </div>

                {agentsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : agents.length === 0 ? (
                  <p className="text-xs text-gray-400">暂无可选智能体</p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {agents.map((agent) => {
                      const checked = selectedIds.includes(agent.id)
                      return (
                        <label
                          key={agent.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors',
                            checked
                              ? 'border-primary bg-primary/5'
                              : 'border-gray-200 hover:border-gray-300',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAgent(agent.id)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <Avatar className="size-8">
                            <AvatarFallback
                              className="text-xs font-bold text-white"
                              style={{
                                backgroundImage: agent.avatarGradient,
                              }}
                            >
                              {agent.name.trim().charAt(0).toUpperCase() ||
                                '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">
                              {agent.name}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {agent.era}
                            </p>
                          </div>
                          {checked && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 工具权限配置（每个已选 agent） */}
              {selectedIds.length > 0 && (
                <div>
                  <span className="mb-2 block text-sm font-medium text-gray-700">
                    工具权限（按 agent 配置）
                  </span>
                  <div className="space-y-2">
                    {selectedIds.map((agentId) => {
                      const meta = getAgentMeta(agentId)
                      const perms = toolPerms[agentId] ?? DEFAULT_TOOLS
                      return (
                        <div
                          key={agentId}
                          className="rounded-lg border border-gray-100 bg-gray-50/50 p-3"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <Avatar className="size-6">
                              <AvatarFallback
                                className="text-[10px] font-bold text-white"
                                style={{
                                  backgroundImage: meta.avatarGradient,
                                }}
                              >
                                {meta.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-semibold text-gray-700">
                              {meta.name}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            {TOOL_OPTIONS.map((opt) => {
                              const Icon = opt.Icon
                              const val = perms[opt.key]
                              return (
                                <label
                                  key={opt.key}
                                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5"
                                >
                                  <span className="flex items-center gap-1.5 text-xs text-gray-600">
                                    <Icon className="h-3.5 w-3.5" />
                                    {opt.label}
                                  </span>
                                  <Switch
                                    checked={val}
                                    onCheckedChange={() =>
                                      toggleTool(agentId, opt.key)
                                    }
                                  />
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full gap-1.5 transition-transform duration-300 ease-out hover:scale-[1.02]"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> 保存中…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> 保存团队
                  </>
                )}
              </Button>
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------

/** 团队卡片（已保存列表） */
function TeamCard({
  team,
  agents,
  onExecute,
}: {
  team: AgentTeam
  agents: AgentConfig[]
  onExecute: () => void
}) {
  const memberAgents = team.agent_ids
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is AgentConfig => Boolean(a))

  return (
    <Card className="hover-lift flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate font-bold text-gray-900">{team.name}</h3>
        <Badge variant="secondary">{team.agent_ids.length} 人</Badge>
      </div>

      {/* 成员头像组 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {memberAgents.length > 0 ? (
          memberAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-1.5 rounded-full bg-gray-50 py-1 pl-1 pr-2.5"
            >
              <Avatar className="size-6">
                <AvatarFallback
                  className="text-[10px] font-bold text-white"
                  style={{ backgroundImage: agent.avatarGradient }}
                >
                  {agent.name.trim().charAt(0).toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-gray-700">
                {agent.name}
              </span>
            </div>
          ))
        ) : (
          team.agent_ids.map((id) => (
            <Badge key={id} variant="outline">
              {id}
            </Badge>
          ))
        )}
      </div>

      <Button
        size="sm"
        onClick={onExecute}
        className="mt-auto gap-1.5 transition-transform duration-300 ease-out hover:scale-[1.02]"
      >
        <Play className="h-4 w-4" /> 启动执行
      </Button>
    </Card>
  )
}

/** 单个 agent 的流式输出卡片 */
function AgentStreamCard({
  agentId,
  state,
}: {
  agentId: string
  state: AgentStreamState | undefined
}) {
  const status: StreamStatus = state?.status ?? 'pending'
  const content = state?.content ?? ''
  const name = state?.name ?? agentId
  const gradient = state?.avatarGradient
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <Card className="hover-lift flex flex-col p-4">
      {/* 头部：头像 + 名称 + 状态 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="size-9">
            <AvatarFallback
              className="text-sm font-bold text-white"
              style={
                gradient ? { backgroundImage: gradient } : undefined
              }
            >
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold text-gray-800">{name}</span>
        </div>
        <StreamStatusBadge status={status} />
      </div>

      {/* 流式文本 */}
      <div className="min-h-[6rem] flex-1">
        {content ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
            {content}
            {status === 'running' && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />
            )}
          </p>
        ) : status === 'pending' ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ) : status === 'running' ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 等待回复…
          </div>
        ) : (
          <p className="text-xs text-gray-400">（无内容）</p>
        )}
      </div>
    </Card>
  )
}

/** 流式状态徽标 */
function StreamStatusBadge({ status }: { status: StreamStatus }) {
  const config: Record<StreamStatus, { text: string; cls: string; Icon: typeof Check }> = {
    pending: {
      text: '排队中',
      cls: 'bg-gray-100 text-gray-500',
      Icon: Square,
    },
    running: {
      text: '生成中',
      cls: 'bg-blue-50 text-blue-600',
      Icon: Loader2,
    },
    done: {
      text: '完成',
      cls: 'bg-green-50 text-green-600',
      Icon: Check,
    },
  }
  const c = config[status]
  const Icon = c.Icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        c.cls,
      )}
    >
      <Icon
        className={cn('h-3 w-3', status === 'running' && 'animate-spin')}
      />
      {c.text}
    </span>
  )
}
