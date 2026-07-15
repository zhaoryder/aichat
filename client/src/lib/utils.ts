import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// 类名合并工具：clsx 处理条件，tailwind-merge 去重
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 相对时间格式化（"3 分钟前"、"2 小时前"、"昨天"等） */
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  if (diff < 0) return '刚刚'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day} 天前`
  const week = Math.floor(day / 7)
  if (week < 4) return `${week} 周前`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month} 个月前`
  return `${Math.floor(month / 12)} 年前`
}
