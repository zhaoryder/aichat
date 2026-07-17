import { useEffect, useMemo } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'cmdk'
import { type LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// 命令面板项：由父组件传入，不在本组件内硬编码
export interface CommandPaletteItem {
  id: string
  label: string
  shortcut?: string
  icon?: LucideIcon
  group: 'actions' | 'views' | 'tools' | 'help'
  onSelect: () => void
  disabled?: boolean
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: CommandPaletteItem[]
}

const GROUP_HEADING: Record<CommandPaletteItem['group'], string> = {
  actions: '操作',
  views: '视图',
  tools: '工具',
  help: '帮助',
}

// 渲染顺序：操作 → 视图 → 工具 → 帮助
const GROUP_ORDER: CommandPaletteItem['group'][] = ['actions', 'views', 'tools', 'help']

/**
 * Cmd+K 命令面板：用 cmdk + shadcn Dialog 实现
 * - 全局快捷键 Cmd/Ctrl+K 切换开关
 * - 内置搜索过滤（cmdk 默认行为）
 * - 按 group 字段分组渲染
 * - 完整暗色模式支持
 */
export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  // 全局快捷键：Cmd/Ctrl + K 打开/关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  // 按 group 字段分组，组内保持声明顺序
  const grouped = useMemo(() => {
    const map: Record<CommandPaletteItem['group'], CommandPaletteItem[]> = {
      actions: [],
      views: [],
      tools: [],
      help: [],
    }
    for (const cmd of commands) {
      map[cmd.group].push(cmd)
    }
    return map
  }, [commands])

  const handleSelect = (cmd: CommandPaletteItem) => {
    if (cmd.disabled) return
    cmd.onSelect()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden max-w-2xl gap-0">
        {/* 供屏幕阅读器使用，视觉隐藏 */}
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <Command
          loop
          className="rounded-lg bg-background text-foreground dark:bg-gray-900 dark:text-gray-100"
        >
          <CommandInput
            placeholder="输入命令或搜索..."
            className="border-0 border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground dark:bg-gray-900"
          />
          <CommandList className="max-h-[400px] overflow-auto p-1">
            <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
              没有匹配的命令。
            </CommandEmpty>
            {GROUP_ORDER.map((group) => {
              const items = grouped[group]
              if (items.length === 0) return null
              return (
                <CommandGroup
                  key={group}
                  heading={
                    <span className="block text-xs font-medium text-gray-400 dark:text-gray-500 px-2 py-1.5">
                      {GROUP_HEADING[group]}
                    </span>
                  }
                >
                  {items.map((cmd) => {
                    const Icon = cmd.icon
                    return (
                      <CommandItem
                        key={cmd.id}
                        value={cmd.label}
                        onSelect={() => handleSelect(cmd)}
                        disabled={cmd.disabled}
                        className={cn(
                          'px-2 py-1.5 text-sm cursor-pointer',
                          'data-[selected=true]:bg-primary/10',
                          cmd.disabled && 'opacity-50 pointer-events-none'
                        )}
                      >
                        {Icon && <Icon className="mr-2 h-4 w-4" />}
                        <span>{cmd.label}</span>
                        {cmd.shortcut && (
                          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                            {cmd.shortcut}
                          </span>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
