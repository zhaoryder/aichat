import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// 类名合并工具：clsx 处理条件，tailwind-merge 去重
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
