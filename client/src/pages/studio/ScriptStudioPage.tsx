// 剧本工坊：多角色搞笑剧本生成（SSE 流式）
// - 表单：主题 / 场景 / 角色多选（拉取官方 agents）/ 时长
// - 流式输出：currentEvent 在 while 外部声明，避免 chunk 边界 bug
// - 完成后：复制 / 下载 txt
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, apiStream } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import type { AgentConfig } from '../../../../shared/agents'

export const ScriptStudioPage = () => {
  // 表单状态
  const [topic, setTopic] = useState('')
  const [scene, setScene] = useState('')
  const [duration, setDuration] = useState(5)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])

  // 角色列表
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)

  // 流式状态
  const [fullText, setFullText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // 流容器引用：自动滚动到底部
  const outputRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 拉取官方智能体列表作为角色候选
  useEffect(() => {
    let active = true
    setAgentsLoading(true)
    apiFetch<{ agents: AgentConfig[] }>('/agents?filter=official')
      .then((res) => {
        if (!active) return
        setAgents(res.agents ?? [])
      })
      .catch(() => {
        // 拉取失败不阻塞：留空列表，用户仍可提交（服务端默认用 confucius）
        if (active) setAgents([])
      })
      .finally(() => {
        if (active) setAgentsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // 流式输出时自动滚到底
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [fullText])

  // 组件卸载时取消流
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // 角色多选切换
  function toggleAgent(id: string) {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    )
  }

  // 生成剧本
  async function handleGenerate() {
    const trimmed = topic.trim()
    if (!trimmed || streaming) return

    // 重置状态
    setFullText('')
    setDone(false)
    setError('')
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await apiStream(
        '/studio/script',
        { topic: trimmed, scene: scene.trim(), agentIds: selectedAgents, duration },
        { signal: controller.signal },
      )

      if (!response.body) {
        setStreaming(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // 关键：currentEvent 必须在 while 循环外部声明，
      // 否则 chunk 边界切在 event/data 之间时会丢失 token
      let currentEvent = ''
      let collected = ''

      while (true) {
        if (controller.signal.aborted) break
        const { done: readDone, value } = await reader.read()
        if (readDone) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            let data: { c?: string; message?: string }
            try {
              data = JSON.parse(line.slice(6))
            } catch {
              continue
            }
            if (currentEvent === 'token' && data.c) {
              collected += data.c
              setFullText(collected)
            } else if (currentEvent === 'done') {
              setDone(true)
            } else if (currentEvent === 'error') {
              setError(data.message || '剧本生成失败')
            }
          }
        }
      }

      // 流自然结束但未收到 done：也视为完成
      if (!controller.signal.aborted) {
        setDone(true)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 被取消：保留已收到的内容
        setDone(true)
      } else {
        setError(err instanceof Error ? err.message : '剧本生成失败')
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  // 复制
  async function handleCopy() {
    if (!fullText) return
    try {
      await navigator.clipboard.writeText(fullText)
    } catch {
      // 剪贴板被拒绝时静默
    }
  }

  // 下载 txt
  function handleDownload() {
    if (!fullText) return
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${topic.trim() || '剧本'}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      {/* 顶部导航 */}
      <div className="mb-6">
        <Link to="/studio" className="text-sm text-gray-500 hover:text-primary">
          ← 返回创意工坊
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-gray-900">搞笑剧本</h1>
        <p className="mt-1 text-sm text-gray-500">让 AI 编出多角色对白的搞笑短剧本</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* 左侧表单 */}
        <Card className="h-fit p-5">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                主题 <span className="text-red-500">*</span>
              </label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例如：古今职场吐槽大会"
                disabled={streaming}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                场景 <span className="text-gray-400">（可选）</span>
              </label>
              <Input
                value={scene}
                onChange={(e) => setScene(e.target.value)}
                placeholder="例如：公司会议室"
                disabled={streaming}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                时长（分钟）
              </label>
              <Input
                type="number"
                min={1}
                max={30}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 5)}
                disabled={streaming}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                角色 <span className="text-gray-400">（可多选，留空则用默认叙述者）</span>
              </label>
              {agentsLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                  <Spinner size="sm" /> 加载角色列表…
                </div>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 scrollbar-thin">
                  {agents.map((agent) => {
                    const checked = selectedAgents.includes(agent.id)
                    return (
                      <label
                        key={agent.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                          checked ? 'bg-primary/10' : 'hover:bg-gray-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAgent(agent.id)}
                          disabled={streaming}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/40"
                        />
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundImage: agent.avatarGradient }}
                        >
                          {agent.name.charAt(0)}
                        </span>
                        <span className="truncate text-gray-700">{agent.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {selectedAgents.length > 0 && (
                <p className="mt-1.5 text-xs text-gray-400">
                  已选 {selectedAgents.length} 个角色
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              {streaming ? (
                <Button variant="outline" className="flex-1" onClick={handleStop}>
                  停止生成
                </Button>
              ) : (
                <Button
                  className="flex-1 transition-transform duration-300 ease-out hover:scale-[1.02]"
                  onClick={handleGenerate}
                  disabled={!topic.trim()}
                >
                  生成剧本
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* 右侧输出区 */}
        <Card className="flex min-h-[400px] flex-col">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {!fullText && !streaming && !error ? (
            <EmptyState
              className="flex-1"
              title="填写表单开始创作"
              description="输入主题，选好角色，点击「生成剧本」即可看到 AI 实时创作"
            />
          ) : (
            <div className="flex flex-1 flex-col">
              {/* 流式输出 */}
              <div
                ref={outputRef}
                className="flex-1 overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-relaxed text-gray-800 scrollbar-thin"
              >
                {fullText}
                {streaming && (
                  <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-primary animate-pulse-cursor" />
                )}
              </div>

              {/* 底部操作栏 */}
              {done && fullText && !streaming && (
                <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3">
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    复制
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDownload}>
                    下载 txt
                  </Button>
                  <span className="ml-auto text-xs text-gray-400">
                    共 {fullText.length} 字
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
