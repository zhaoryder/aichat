// =====================================================================
// 签到卡片组件
// ---------------------------------------------------------------------
// 功能：
//   - 显示当前积分（useAuth profile.points）
//   - 「今日签到」按钮：调 POST /checkin
//   - 7 天日历：最近 7 天签到情况，已签到日期高亮金黄，今天用边框标记
//   - 连续签到天数显示
// 关键：today 日期字符串用 useState + useEffect 延迟 mount 计算，避免 CSR 不一致
// =====================================================================

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'
import type { Checkin } from '../../../shared/types'

/** 签到接口返回结构 */
interface CheckinResponse {
  checkin: Checkin
  alreadyCheckedIn: boolean
}

/** 返回 YYYY-MM-DD 格式（本地时区） */
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 生成最近 7 天日期（含今天，倒序：今天在最右） */
function last7Days(today: Date): Date[] {
  const days: Date[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    days.push(d)
  }
  return days
}

export function CheckinCard() {
  const { profile } = useAuth()

  // today 用 useState + useEffect 延迟到 mount 后计算，避免 CSR 不一致
  const [today, setToday] = useState<Date | null>(null)
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string>('')
  const [error, setError] = useState('')

  // mount 后计算 today，并拉取签到列表
  useEffect(() => {
    setToday(new Date())
  }, [])

  useEffect(() => {
    if (!today) return
    let active = true
    setLoading(true)
    apiFetch<{ checkins: Checkin[] }>('/checkin/list')
      .then((res) => {
        if (!active) return
        setCheckins(res.checkins ?? [])
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message || '加载签到记录失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [today])

  // 已签到日期集合（YYYY-MM-DD → true）
  const checkedSet = new Set(checkins.map((c) => c.check_date))
  // 今天是否已签到
  const todayStr = today ? toDateStr(today) : ''
  const alreadyCheckedIn = !!todayStr && checkedSet.has(todayStr)
  // 连续签到天数：取最近一条 checkin 的 streak_days
  const streakDays = checkins.length > 0 ? checkins[0].streak_days : 0
  const points = profile?.points ?? 0

  async function handleCheckin() {
    if (!today || submitting || alreadyCheckedIn) return
    setSubmitting(true)
    setError('')
    try {
      const res = await apiFetch<CheckinResponse>('/checkin', { method: 'POST' })
      // 刷新本地签到列表（插入新签到记录）
      setCheckins((prev) => [res.checkin, ...prev])
      if (res.alreadyCheckedIn) {
        setToast('今日已签到 ✓')
      } else {
        setToast(`签到成功！获得 ${res.checkin.points_earned} 积分`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '签到失败')
    } finally {
      setSubmitting(false)
      // 2 秒后清除 toast
      window.setTimeout(() => setToast(''), 2000)
    }
  }

  // 7 天日历日期
  const days = today ? last7Days(today) : []

  return (
    <Card className="p-6">
      {/* 头部：积分 + 连续天数 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">我的积分</p>
          <p className="mt-1 text-3xl font-extrabold text-primary">{points}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">连续签到</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{streakDays} 天</p>
        </div>
      </div>

      {/* 7 天日历 */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-medium text-gray-500">最近 7 天</p>
        {loading ? (
          <div className="flex justify-center py-3">
            <Spinner size="sm" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d, i) => {
              const dateStr = toDateStr(d)
              const checked = checkedSet.has(dateStr)
              const isToday = todayStr === dateStr
              return (
                <div
                  key={i}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg py-2 text-xs',
                    checked
                      ? 'bg-primary/80 text-black'
                      : 'bg-gray-50 text-gray-400',
                    isToday && 'ring-2 ring-primary ring-offset-1',
                  )}
                  title={dateStr}
                >
                  <span>{['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}</span>
                  <span className="mt-0.5 font-bold">{d.getDate()}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 签到按钮 */}
      <div className="mt-5">
        <Button
          onClick={handleCheckin}
          disabled={alreadyCheckedIn || submitting || loading}
          className="w-full transition-transform duration-300 ease-out hover:scale-[1.02]"
        >
          {submitting ? '签到中…' : alreadyCheckedIn ? '今日已签到 ✓' : '今日签到'}
        </Button>
      </div>

      {/* toast / error 提示 */}
      {toast && (
        <p className="mt-3 rounded-lg bg-primary/15 px-3 py-2 text-center text-sm text-primary">
          {toast}
        </p>
      )}
      {error && !toast && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
          {error}
        </p>
      )}
    </Card>
  )
}
