// =====================================================================
// 管理后台
// ---------------------------------------------------------------------
// Tab 切换：用户管理 / 举报管理
//   用户管理：
//     - GET /admin/users 拉取用户列表
//     - 表格：头像、昵称、邮箱、角色、积分、封禁状态、操作
//     - 封禁：Dialog 选择时长，POST /admin/users/:id/ban body { until: ISO }
//     - 解封：POST /admin/users/:id/unban
//   举报管理：
//     - GET /admin/reports 拉取举报列表
//     - 操作：标记为已处理（resolved）/ 忽略（ignored）
// =====================================================================

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'
import type { Profile, Report, ReportStatus, ReportTargetType } from '@shared/types'

type Tab = 'users' | 'reports'

/** 判断是否当前被封禁 */
function isBanned(bannedUntil: string | null): boolean {
  if (!bannedUntil) return false
  const until = new Date(bannedUntil).getTime()
  if (Number.isNaN(until)) return false
  return until > Date.now()
}

/** 格式化时间 */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 举报类型文案 */
const REPORT_TYPE_LABEL: Record<ReportTargetType, string> = {
  message: '消息',
  topic: '话题',
  post: '回帖',
  user: '用户',
}

/** 举报状态文案与颜色 */
const REPORT_STATUS_META: Record<ReportStatus, { label: string; variant: 'default' | 'primary' | 'secondary' }> = {
  pending: { label: '待处理', variant: 'secondary' },
  resolved: { label: '已处理', variant: 'primary' },
  ignored: { label: '已忽略', variant: 'default' },
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">管理后台</h1>

      {/* Tab 切换 */}
      <div className="mb-6 inline-flex rounded-lg bg-gray-100 p-1">
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
          用户管理
        </TabButton>
        <TabButton active={tab === 'reports'} onClick={() => setTab('reports')}>
          举报管理
        </TabButton>
      </div>

      {tab === 'users' ? <UsersTab /> : <ReportsTab />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Tab 切换按钮
// ---------------------------------------------------------------------
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-300 ease-out',
        active
          ? 'bg-white text-primary shadow-sm'
          : 'text-gray-600 hover:text-gray-900',
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------
// 用户管理 Tab
// ---------------------------------------------------------------------
function UsersTab() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 封禁 Dialog 状态
  const [banTarget, setBanTarget] = useState<Profile | null>(null)
  const [banDuration, setBanDuration] = useState<'1d' | '7d' | '30d' | 'forever'>('1d')
  const [banSubmitting, setBanSubmitting] = useState(false)
  const [banError, setBanError] = useState('')

  // 操作中用户 id（用于禁用按钮）
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    apiFetch<{ users: Profile[] }>('/admin/users')
      .then((res) => {
        if (!active) return
        setUsers(res.users ?? [])
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message || '加载用户列表失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // 刷新列表
  function refreshList() {
    apiFetch<{ users: Profile[] }>('/admin/users')
      .then((res) => setUsers(res.users ?? []))
      .catch(() => {
        // 静默
      })
  }

  function openBanDialog(user: Profile) {
    setBanTarget(user)
    setBanDuration('1d')
    setBanError('')
  }

  /** 根据时长生成 until ISO 字符串 */
  function computeUntil(duration: typeof banDuration): string {
    if (duration === 'forever') return '2099-01-01T00:00:00.000Z'
    const now = new Date()
    const days = duration === '1d' ? 1 : duration === '7d' ? 7 : 30
    now.setDate(now.getDate() + days)
    return now.toISOString()
  }

  async function handleBan() {
    if (!banTarget) return
    setBanSubmitting(true)
    setBanError('')
    try {
      await apiFetch(`/admin/users/${banTarget.id}/ban`, {
        method: 'POST',
        body: JSON.stringify({ until: computeUntil(banDuration) }),
      })
      setBanTarget(null)
      refreshList()
    } catch (err) {
      setBanError(err instanceof Error ? err.message : '封禁失败')
    } finally {
      setBanSubmitting(false)
    }
  }

  async function handleUnban(user: Profile) {
    setPendingId(user.id)
    try {
      await apiFetch(`/admin/users/${user.id}/unban`, { method: 'POST' })
      refreshList()
    } catch {
      // 静默
    } finally {
      setPendingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="p-6">
        <EmptyState
          title="加载失败"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={refreshList}>
              重试
            </Button>
          }
        />
      </Card>
    )
  }

  if (users.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState title="暂无用户数据" />
      </Card>
    )
  }

  return (
    <>
      {/* 桌面端表格 */}
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">用户</th>
              <th className="px-4 py-3 text-left font-medium">邮箱</th>
              <th className="px-4 py-3 text-left font-medium">角色</th>
              <th className="px-4 py-3 text-left font-medium">积分</th>
              <th className="px-4 py-3 text-left font-medium">状态</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const banned = isBanned(u.banned_until)
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar
                        name={u.nickname || 'U'}
                        size="sm"
                        gradient="from-primary to-amber-500"
                      />
                      <span className="font-medium text-gray-900">{u.nickname || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.id}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === 'admin' ? 'primary' : 'default'}>
                      {u.role === 'admin' ? '管理员' : '用户'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{u.points ?? 0}</td>
                  <td className="px-4 py-3">
                    {banned ? (
                      <Badge variant="secondary">已封禁</Badge>
                    ) : (
                      <Badge variant="default">正常</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {banned ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnban(u)}
                        disabled={pendingId === u.id}
                      >
                        {pendingId === u.id ? '处理中…' : '解封'}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openBanDialog(u)}
                        disabled={u.role === 'admin' || pendingId === u.id}
                      >
                        封禁
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* 移动端卡片列表 */}
      <div className="space-y-3 md:hidden">
        {users.map((u) => {
          const banned = isBanned(u.banned_until)
          return (
            <Card key={u.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Avatar
                    name={u.nickname || 'U'}
                    size="sm"
                    gradient="from-primary to-amber-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{u.nickname || '—'}</p>
                    <p className="text-xs text-gray-500">{u.id}</p>
                  </div>
                </div>
                <Badge variant={u.role === 'admin' ? 'primary' : 'default'}>
                  {u.role === 'admin' ? '管理员' : '用户'}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-gray-500">积分：{u.points ?? 0}</span>
                {banned ? (
                  <Badge variant="secondary">已封禁</Badge>
                ) : (
                  <Badge variant="default">正常</Badge>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                {banned ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnban(u)}
                    disabled={pendingId === u.id}
                  >
                    {pendingId === u.id ? '处理中…' : '解封'}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openBanDialog(u)}
                    disabled={u.role === 'admin' || pendingId === u.id}
                  >
                    封禁
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* 封禁 Dialog */}
      <Dialog
        open={!!banTarget}
        onClose={() => (banSubmitting ? null : setBanTarget(null))}
        title={`封禁 ${banTarget?.nickname || '用户'}`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setBanTarget(null)}
              disabled={banSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleBan} disabled={banSubmitting}>
              {banSubmitting ? '封禁中…' : '确认封禁'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">选择封禁时长：</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: '1d', label: '1 天' },
                { value: '7d', label: '7 天' },
                { value: '30d', label: '30 天' },
                { value: 'forever', label: '永久' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBanDuration(opt.value)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-300 ease-out',
                  banDuration === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {banError && <p className="text-sm text-red-600">{banError}</p>}
        </div>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------
// 举报管理 Tab
// ---------------------------------------------------------------------
function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    apiFetch<{ reports: Report[] }>('/admin/reports')
      .then((res) => {
        if (!active) return
        // 按时间倒序：最新在前
        const sorted = [...(res.reports ?? [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        setReports(sorted)
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message || '加载举报列表失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function handleUpdateStatus(id: string, status: ReportStatus) {
    setPendingId(id)
    try {
      await apiFetch(`/admin/reports/${id}`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      // 本地更新状态
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
    } catch {
      // 静默
    } finally {
      setPendingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="p-6">
        <EmptyState title="加载失败" description={error} />
      </Card>
    )
  }

  if (reports.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState title="暂无举报记录" description="还没有用户提交举报" />
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const meta = REPORT_STATUS_META[report.status]
        const isPending = report.status === 'pending'
        const isPendingOp = pendingId === report.id
        return (
          <Card key={report.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{REPORT_TYPE_LABEL[report.target_type]}</Badge>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                  <span className="text-xs text-gray-400">
                    {formatDateTime(report.created_at)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-700">
                  <span className="text-gray-500">目标 ID：</span>
                  <span className="font-mono text-xs">{report.target_id}</span>
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  <span className="text-gray-500">举报原因：</span>
                  {report.reason || '（未填写）'}
                </p>
              </div>

              {/* 操作区 */}
              <div className="flex shrink-0 gap-2">
                {isPending ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStatus(report.id, 'resolved')}
                      disabled={isPendingOp}
                    >
                      {isPendingOp ? '处理中…' : '标记已处理'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUpdateStatus(report.id, 'ignored')}
                      disabled={isPendingOp}
                      className="text-gray-500"
                    >
                      忽略
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUpdateStatus(report.id, 'pending')}
                    disabled={isPendingOp}
                    className="text-gray-500"
                  >
                    重置为待处理
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
