// 游戏工坊：文字冒险
// - 4 种游戏类型选择：文字冒险 / 海龟汤 / 情景选择 / 接梗大战
// - 开始游戏 → choice 推进 → 结局
// - 存档：保存 / 读取 / 删除
// - 结局回顾：完整剧情历史
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import type { GameSave } from '@shared/types'

// 游戏类型配置
const GAME_TYPES: { key: string; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    key: '文字冒险',
    label: '文字冒险',
    desc: '自由探索剧情',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7l3-7z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: '海龟汤',
    label: '海龟汤',
    desc: '推理悬疑谜题',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12h18M5 12a7 7 0 0114 0M9 12v6M15 12v6M7 18h10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: '情景选择',
    label: '情景选择',
    desc: '二选一的人生',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 3v6M9 9L4 14M9 9l5 5M15 3v6M15 9l5 5M15 9l-5 5M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: '接梗大战',
    label: '接梗大战',
    desc: 'AI 出梗你来接',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 3v4M16 3v4M4 8h16M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 14h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

interface GameState {
  story: string
  options: string[]
  ending?: string
}

interface HistoryEntry {
  story: string
  choice?: string
}

export const GameStudioPage = () => {
  const [gameType, setGameType] = useState<string>('')
  const [state, setState] = useState<GameState | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 存档
  const [saves, setSaves] = useState<GameSave[]>([])
  const [savesOpen, setSavesOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  const storyRef = useRef<HTMLDivElement>(null)

  // 剧情自动滚底
  useEffect(() => {
    if (storyRef.current) {
      storyRef.current.scrollTop = storyRef.current.scrollHeight
    }
  }, [history, state])

  // 开始新游戏
  const startGame = useCallback(async (type: string) => {
    if (loading) return
    setGameType(type)
    setLoading(true)
    setError('')
    setState(null)
    setHistory([])

    try {
      const res = await apiFetch<GameState>('/studio/game/start', {
        method: 'POST',
        body: JSON.stringify({ gameType: type }),
      })
      setState(res)
      if (res.story) {
        setHistory([{ story: res.story }])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '游戏开场失败')
    } finally {
      setLoading(false)
    }
  }, [loading])

  // 选择
  const handleChoice = useCallback(
    async (choice: string) => {
      if (!state || loading) return
      setLoading(true)
      setError('')

      // 记录选择
      setHistory((prev) => [...prev, { story: state.story, choice }])

      try {
        const res = await apiFetch<GameState>('/studio/game/choice', {
          method: 'POST',
          body: JSON.stringify({
            gameType,
            story: state.story,
            choice,
          }),
        })
        setState(res)
        if (res.story) {
          setHistory((prev) => [...prev, { story: res.story }])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '游戏推进失败')
        // 回滚刚加入的选择记录
        setHistory((prev) => prev.slice(0, -1))
      } finally {
        setLoading(false)
      }
    },
    [state, loading, gameType],
  )

  // 保存进度
  const handleSave = useCallback(async () => {
    if (!gameType || !state) return
    try {
      await apiFetch('/studio/game/saves', {
        method: 'POST',
        body: JSON.stringify({
          gameType,
          title: state.story.slice(0, 30),
          state: { story: state.story, options: state.options, history },
        }),
      })
      // 刷新存档列表
      loadSaves()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }, [gameType, state, history])

  // 加载存档列表
  const loadSaves = useCallback(async () => {
    try {
      const res = await apiFetch<{ saves: GameSave[] }>('/studio/game/saves')
      setSaves(res.saves ?? [])
    } catch {
      // 静默
    }
  }, [])

  // 读取存档
  const handleLoadSave = useCallback((save: GameSave) => {
    const s = save.state as { story?: string; options?: string[]; history?: HistoryEntry[] }
    if (s.story) {
      setGameType(save.game_type)
      setState({ story: s.story, options: s.options ?? [], ending: undefined })
      setHistory(s.history ?? [{ story: s.story }])
      setSavesOpen(false)
    }
  }, [])

  // 删除存档
  const handleDeleteSave = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/studio/game/saves/${id}`, { method: 'DELETE' })
        setSaves((prev) => prev.filter((s) => s.id !== id))
      } catch {
        // 静默
      }
    },
    [],
  )

  // 打开存档弹窗时拉取列表
  useEffect(() => {
    if (savesOpen) loadSaves()
  }, [savesOpen, loadSaves])

  const isEnding = !!state?.ending || (state && state.options.length === 0 && history.length > 0)

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link to="/studio" className="text-sm text-gray-500 hover:text-primary">
          ← 返回创意工坊
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-gray-900">搞笑游戏</h1>
        <p className="mt-1 text-sm text-gray-500">文字冒险，AI 主持，你的每个选择都决定剧情走向</p>
      </div>

      {!gameType ? (
        // 选择游戏类型
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GAME_TYPES.map((g) => (
            <button
              key={g.key}
              onClick={() => startGame(g.key)}
              disabled={loading}
              className="text-left"
            >
              <Card
                hoverScale
                className="flex items-center gap-4 p-5 transition-transform duration-300 ease-out hover:scale-[1.02]"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  {g.icon}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{g.label}</h3>
                  <p className="mt-0.5 text-sm text-gray-500">{g.desc}</p>
                </div>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          {/* 游戏主区 */}
          <Card className="flex min-h-[460px] flex-col">
            {error && (
              <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <Badge variant="primary">{gameType}</Badge>
                {isEnding && <Badge variant="secondary">已结局</Badge>}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setGameType('')
                  setState(null)
                  setHistory([])
                  setError('')
                }}
              >
                退出
              </Button>
            </div>

            {/* 剧情区 */}
            <div ref={storyRef} className="flex-1 overflow-y-auto p-5 scrollbar-thin">
              {loading && history.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : history.length === 0 ? (
                <EmptyState title="游戏即将开始" />
              ) : (
                <div className="space-y-4">
                  {history.map((entry, i) => (
                    <div key={i}>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-gray-800">
                        {entry.story}
                      </p>
                      {entry.choice && (
                        <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm text-primary">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="font-medium">{entry.choice}</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {isEnding && state?.ending && (
                    <div className="mt-6 rounded-xl bg-gradient-to-br from-primary/20 to-amber-100 p-5 text-center">
                      <p className="text-sm font-medium text-gray-500">结局</p>
                      <p className="mt-2 whitespace-pre-wrap text-base font-semibold text-gray-900">
                        {state.ending}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 选项区 */}
            {!isEnding && state && state.options.length > 0 && (
              <div className="border-t border-gray-100 p-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
                    <Spinner size="sm" /> AI 思考中…
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {state.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleChoice(opt)}
                        className="rounded-lg border border-gray-200 px-4 py-2.5 text-left text-sm text-gray-700 transition-all duration-200 hover:border-primary hover:bg-primary/5 hover:scale-[1.01]"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 结局操作 */}
            {isEnding && (
              <div className="flex items-center gap-2 border-t border-gray-100 p-4">
                <Button size="sm" onClick={() => startGame(gameType)}>
                  重新开始
                </Button>
                <Button size="sm" variant="outline" onClick={() => setReviewOpen(true)}>
                  查看完整回顾
                </Button>
              </div>
            )}
          </Card>

          {/* 侧边栏：存档 */}
          <div className="space-y-3">
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">存档</h3>
              <div className="space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={handleSave}
                  disabled={!state}
                >
                  保存进度
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setSavesOpen(true)}
                >
                  读取存档
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <p className="text-xs text-gray-400">
                提示：AI 主持的文字冒险，每个选择都可能通往不同结局。存档可随时保存与读取。
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* 存档列表弹窗 */}
      <Dialog
        open={savesOpen}
        onClose={() => setSavesOpen(false)}
        title="读取存档"
        className="max-w-md"
      >
        {saves.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">还没有存档</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin">
            {saves.map((save) => (
              <div
                key={save.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3"
              >
                <button
                  onClick={() => handleLoadSave(save)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-gray-800">
                    {save.title || save.game_type}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {save.game_type} · {new Date(save.created_at).toLocaleString('zh-CN')}
                  </p>
                </button>
                <button
                  onClick={() => handleDeleteSave(save.id)}
                  className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  aria-label="删除存档"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Dialog>

      {/* 完整回顾弹窗 */}
      <Dialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="剧情回顾"
        className="max-w-2xl"
      >
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 scrollbar-thin">
          {history.map((entry, i) => (
            <div key={i}>
              <p className="whitespace-pre-wrap text-sm leading-7 text-gray-800">
                {entry.story}
              </p>
              {entry.choice && (
                <p className="mt-1.5 text-xs font-medium text-primary">→ {entry.choice}</p>
              )}
            </div>
          ))}
          {state?.ending && (
            <div className="rounded-lg bg-primary/10 p-4">
              <p className="text-xs text-gray-500">结局</p>
              <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-gray-900">
                {state.ending}
              </p>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  )
}
