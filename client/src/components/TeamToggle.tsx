// =====================================================================
// TeamToggle：AI Teamwork 多角色协作开关 + 角色选择面板
// ---------------------------------------------------------------------
// - Switch 开关：开启后启用 Teamwork 模式（mode='team'）
// - 6 个角色 chips（多选）：
//     Leader 紫 / Planner 蓝 / Coder 绿 / Executor 橙 / Reviewer 红 / Reporter 灰
//   每个角色配对应颜色 + 图标
// - 默认选中 Leader + Coder（与后端 startTeamSession 默认一致）
// - 显示团队配置摘要（已选 N/6 角色）
// - 暗色模式适配
// =====================================================================

import {
  Crown,
  ClipboardList,
  Code2,
  Play,
  ShieldCheck,
  FileText,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { TeamRole } from '@shared/types'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

// ---------------------------------------------------------------------
// 角色元数据：图标 + 配色
// ---------------------------------------------------------------------

interface RoleMeta {
  icon: LucideIcon
  label: string
  /** 文字颜色（亮 / 暗） */
  text: string
  /** 背景色（亮 / 暗） */
  bg: string
  /** 边框色（激活态，亮 / 暗） */
  border: string
  /** 描述（hover tooltip 文本） */
  desc: string
}

const ROLE_META: Record<TeamRole, RoleMeta> = {
  leader: {
    icon: Crown,
    label: 'Leader',
    text: 'text-purple-600 dark:text-purple-300',
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    border: 'border-purple-300 dark:border-purple-700',
    desc: '拆解任务、分配角色、汇总',
  },
  planner: {
    icon: ClipboardList,
    label: 'Planner',
    text: 'text-blue-600 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-300 dark:border-blue-700',
    desc: '输出更细的步骤拆解',
  },
  coder: {
    icon: Code2,
    label: 'Coder',
    text: 'text-emerald-600 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-300 dark:border-emerald-700',
    desc: '编写代码（writeFile / bash）',
  },
  executor: {
    icon: Play,
    label: 'Executor',
    text: 'text-amber-600 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-300 dark:border-amber-700',
    desc: '执行命令、跑测试、捕获错误',
  },
  reviewer: {
    icon: ShieldCheck,
    label: 'Reviewer',
    text: 'text-red-600 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-300 dark:border-red-700',
    desc: '结构化代码评分 + 问题清单',
  },
  reporter: {
    icon: FileText,
    label: 'Reporter',
    text: 'text-gray-600 dark:text-gray-300',
    bg: 'bg-gray-50 dark:bg-gray-800/60',
    border: 'border-gray-300 dark:border-gray-600',
    desc: '汇总阶段进度、输出最终总结',
  },
}

/** 全部 6 个角色（固定顺序） */
const ALL_ROLES: TeamRole[] = [
  'leader',
  'planner',
  'coder',
  'executor',
  'reviewer',
  'reporter',
]

// ---------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------

interface TeamToggleProps {
  /** 是否启用 Teamwork 模式 */
  enabled: boolean
  /** 开关切换回调 */
  onToggle: (v: boolean) => void
  /** 当前已选角色列表 */
  roles: TeamRole[]
  /** 角色选择变化回调 */
  onRolesChange: (r: TeamRole[]) => void
  /** 是否禁用（流式生成中不允许切换） */
  disabled?: boolean
}

// ---------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------

export function TeamToggle({
  enabled,
  onToggle,
  roles,
  onRolesChange,
  disabled = false,
}: TeamToggleProps) {
  /** 切换某个角色选中状态（Leader 必选，不可取消） */
  const toggleRole = (role: TeamRole) => {
    if (role === 'leader') return // Leader 始终必选
    if (roles.includes(role)) {
      onRolesChange(roles.filter((r) => r !== role))
    } else {
      onRolesChange([...roles, role])
    }
  }

  const selectedCount = roles.length

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-all duration-300 ease-out',
        enabled
          ? 'border-purple-400/60 bg-purple-50/50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300 shadow-sm'
          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
      title="开启后多个 AI 角色接力协作（Leader / Planner / Coder / Executor / Reviewer / Reporter）"
    >
      <Users className="h-3.5 w-3.5" />
      <span className="text-xs font-medium hidden sm:inline">Teamwork</span>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={disabled}
        className="scale-90"
        aria-label="切换 Teamwork 模式"
      />

      {/* 角色选择面板：仅在启用时展开 */}
      {enabled && (
        <div className="ml-1 flex items-center gap-1 border-l border-purple-200/50 dark:border-purple-800/60 pl-1.5">
          {ALL_ROLES.map((role) => {
            const meta = ROLE_META[role]
            const Icon = meta.icon
            const isSelected = roles.includes(role)
            const isLeader = role === 'leader'
            return (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                disabled={disabled || isLeader}
                title={`${meta.label}：${meta.desc}${isLeader ? '（必选）' : ''}`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all duration-300 ease-out',
                  isSelected
                    ? cn(meta.bg, meta.text, meta.border, 'shadow-sm hover:scale-[1.05]')
                    : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/60',
                  isLeader && 'cursor-default',
                  disabled && 'cursor-not-allowed',
                )}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden md:inline">{meta.label}</span>
              </button>
            )
          })}

          {/* 配置摘要：N/6 */}
          <span
            className="ml-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400 tabular-nums"
            aria-live="polite"
          >
            {selectedCount}/6
          </span>
        </div>
      )}
    </div>
  )
}
