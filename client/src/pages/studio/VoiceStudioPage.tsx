// 语音工坊：浏览器原生 Web Speech API 语音合成
// - 即时播放，零延迟，无需后端 API
// - 自动列出系统可用的中文音色
// - 语速/音调调节
// - 播放/暂停/停止控制
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

// 状态：空闲 / 合成中 / 已暂停
type Phase = 'idle' | 'speaking' | 'paused'

// 系统音色（SpeechSynthesisVoice）
type SystemVoice = SpeechSynthesisVoice

// 预设音色档位：用 rate/pitch 模拟不同角色感
const PRESETS: { id: string; label: string; rate: number; pitch: number; desc: string }[] = [
  { id: 'default', label: '默认', rate: 1, pitch: 1, desc: '系统默认音色' },
  { id: 'girl', label: '活泼少女', rate: 1.1, pitch: 1.4, desc: '语速稍快、声调高' },
  { id: 'uncle', label: '沉稳大叔', rate: 0.9, pitch: 0.7, desc: '语速稍慢、声调低' },
  { id: 'sister', label: '温柔姐姐', rate: 0.95, pitch: 1.15, desc: '柔和中音' },
  { id: 'boy', label: '搞怪少年', rate: 1.25, pitch: 0.9, desc: '语速快、稍低音' },
  { id: 'robot', label: '机械音', rate: 0.85, pitch: 0.5, desc: '低沉机械感' },
]

import { AICollaboratorPicker } from '@/components/AICollaboratorPicker'

export const VoiceStudioPage = () => {
  const [aiCollaborator, setAiCollaborator] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [presetId, setPresetId] = useState('default')
  const [voiceURI, setVoiceURI] = useState('') // 选中系统音色 URI

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [voices, setVoices] = useState<SystemVoice[]>([])

  // 加载系统音色（异步）
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setError('当前浏览器不支持语音合成（请使用 Chrome / Edge / Safari）')
      return
    }
    const load = () => {
      const list = window.speechSynthesis.getVoices()
      // 优先中文音色，没有则展示全部
      const zh = list.filter((v) => v.lang.toLowerCase().startsWith('zh'))
      setVoices(zh.length > 0 ? zh : list)
      // 默认选第一个中文音色
      if (zh.length > 0 && !voiceURI) setVoiceURI(zh[0].voiceURI)
    }
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => {
      // 组件卸载时停止播放
      window.speechSynthesis.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const preset = useMemo(
    () => PRESETS.find((p) => p.id === presetId) ?? PRESETS[0],
    [presetId],
  )

  const charCount = text.length

  function handlePlay() {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!('speechSynthesis' in window)) {
      setError('当前浏览器不支持语音合成')
      return
    }

    // 取消任何正在播放的
    window.speechSynthesis.cancel()
    setError('')

    const utter = new SpeechSynthesisUtterance(trimmed)
    utter.rate = preset.rate
    utter.pitch = preset.pitch
    utter.volume = 1
    // 设置系统音色（如果选了）
    if (voiceURI) {
      const v = voices.find((x) => x.voiceURI === voiceURI)
      if (v) utter.voice = v
    }
    utter.onstart = () => setPhase('speaking')
    utter.onend = () => setPhase('idle')
    utter.onerror = (e) => {
      setError('语音播放出错：' + (e.error || '未知错误'))
      setPhase('idle')
    }
    window.speechSynthesis.speak(utter)
  }

  function handlePause() {
    if (phase !== 'speaking') return
    window.speechSynthesis.pause()
    setPhase('paused')
  }

  function handleResume() {
    if (phase !== 'paused') return
    window.speechSynthesis.resume()
    setPhase('speaking')
  }

  function handleStop() {
    window.speechSynthesis.cancel()
    setPhase('idle')
  }

  return (
    <div className="animate-fade-in mx-auto max-w-5xl px-4 py-8">
      <AICollaboratorPicker specialty="voice" value={aiCollaborator} onChange={setAiCollaborator} />
      <div className="mb-6">
        <Link to="/studio" className="text-sm text-gray-500 hover:text-primary dark:text-gray-400">
          ← 返回创意工坊
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-gray-50">搞笑语音</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          浏览器本地语音合成，零延迟即时播放
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px]">
        {/* 表单 */}
        <Card className="p-5">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                文本 <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="输入要合成语音的文字，越长越好，越搞怪越好…"
                rows={10}
                maxLength={500}
                disabled={phase === 'speaking'}
              />
              <p className="mt-1 text-right text-xs text-gray-400 dark:text-gray-500">
                {charCount}/500
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                音色档位
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPresetId(p.id)}
                    disabled={phase === 'speaking'}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-all',
                      presetId === p.id
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600',
                    )}
                    title={p.desc}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {preset.desc} · 语速 {preset.rate}× · 音调 {preset.pitch}
              </p>
            </div>

            {voices.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  系统音色
                </label>
                <select
                  value={voiceURI}
                  onChange={(e) => setVoiceURI(e.target.value)}
                  disabled={phase === 'speaking'}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  共 {voices.length} 个可用音色（来自操作系统）
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {phase === 'idle' && (
                <Button
                  className="transition-transform duration-300 ease-out hover:scale-[1.02]"
                  onClick={handlePlay}
                  disabled={!text.trim()}
                >
                  播放语音
                </Button>
              )}
              {phase === 'speaking' && (
                <>
                  <Button variant="outline" onClick={handlePause}>
                    暂停
                  </Button>
                  <Button variant="outline" onClick={handleStop}>
                    停止
                  </Button>
                </>
              )}
              {phase === 'paused' && (
                <>
                  <Button onClick={handleResume}>继续</Button>
                  <Button variant="outline" onClick={handleStop}>
                    停止
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>

        {/* 状态区 */}
        <Card className="flex min-h-[400px] flex-col">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {phase === 'speaking' || phase === 'paused' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              {/* 等化器动效（CSS-only） */}
              <div className="flex items-end gap-1 h-12">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-primary"
                    style={{
                      height: phase === 'paused' ? '20%' : '100%',
                      animation:
                        phase === 'paused'
                          ? 'none'
                          : `voice-bar 0.8s ${i * 0.1}s ease-in-out infinite`,
                    }}
                  />
                ))}
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {phase === 'paused' ? '已暂停' : '正在播放…'}
              </p>
              <p className="max-w-xs text-xs text-gray-400 dark:text-gray-500">
                提示：如需保存音频，请使用系统录屏工具录制播放过程
              </p>
            </div>
          ) : (
            !error && (
              <EmptyState
                className="flex-1"
                title="输入文字开始播放"
                description="选择音色档位和系统音色，点击播放按钮即时朗读"
              />
            )
          )}
        </Card>
      </div>

      {/* 等化器动画 keyframes（注入到全局） */}
      <style>{`
        @keyframes voice-bar {
          0%, 100% { height: 30%; }
          50% { height: 100%; }
        }
      `}</style>
    </div>
  )
}
