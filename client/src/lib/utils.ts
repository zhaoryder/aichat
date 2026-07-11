// 类名合并工具：过滤 falsy 值后用空格拼接，不依赖 clsx/tailwind-merge
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
