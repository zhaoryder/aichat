import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Plus, Check, ListChecks } from 'lucide-react'

interface SelectWithCustomProps {
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  id?: string
  disabled?: boolean
}

export function SelectWithCustom({
  options,
  value,
  onChange,
  placeholder = '请选择',
  label,
  id,
  disabled = false,
}: SelectWithCustomProps) {
  const [isCustom, setIsCustom] = useState(value !== '' && !options.includes(value as any))
  const [customInput, setCustomInput] = useState(isCustom ? value : '')

  // 如果是预设选项，显示 Select
  // 如果是自定义，显示 Input + 切换按钮
  if (!isCustom && (value === '' || options.includes(value as any))) {
    return (
      <div className="space-y-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="flex gap-2">
          <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger id={id} className="flex-1">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" type="button" disabled={disabled}>
                <Plus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72">
              <div className="space-y-2">
                <Label htmlFor={`custom-${id}`}>自定义</Label>
                <Input
                  id={`custom-${id}`}
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="输入自定义值..."
                />
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    if (customInput.trim()) {
                      onChange(customInput.trim())
                      setIsCustom(true)
                    }
                  }}
                >
                  <Check className="h-4 w-4 mr-1" /> 确定
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    )
  }

  // 自定义模式：显示 Input + 切换回 Select 的按钮
  return (
    <div className="space-y-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="自定义值..."
          className="flex-1"
          disabled={disabled}
        />
        <Button
          variant="outline"
          size="icon"
          type="button"
          disabled={disabled}
          onClick={() => {
            setIsCustom(false)
            onChange('')
            setCustomInput('')
          }}
        >
          <ListChecks className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
