// =====================================================================
// 个性化装扮主题模板（前后端共享）
// ---------------------------------------------------------------------
// 定义内置主题、气泡样式、加载动画的常量与查询函数。
// 供 client（通过 @shared/themes 别名）与 server（相对路径）共用。
// =====================================================================

/** 主题模板：定义一组内置配色方案 */
export interface ThemeTemplate {
  id: string
  name: string
  primary: string
  background: string
  /** 可选的次要颜色 */
  accent?: string
  /** 是否为暗色背景 */
  dark?: boolean
}

/** 内置主题列表（6 个） */
export const THEMES: ThemeTemplate[] = [
  { id: 'default', name: '默认柔和', primary: '#6366f1', background: '#fafafa' },
  { id: 'doubao', name: '仿豆包简约', primary: '#3b82f6', background: '#ffffff' },
  { id: 'sunset', name: '日落暖色', primary: '#f97316', background: '#fff7ed' },
  { id: 'ocean', name: '海洋蓝', primary: '#0ea5e9', background: '#f0f9ff' },
  { id: 'forest', name: '森林绿', primary: '#10b981', background: '#f0fdf4' },
  { id: 'sakura', name: '樱花粉', primary: '#ec4899', background: '#fdf2f8' },
]

/** 根据 id 查询主题模板 */
export function getThemeById(id: string): ThemeTemplate | undefined {
  return THEMES.find((t) => t.id === id)
}

/** 气泡样式选项 */
export const BUBBLE_STYLES = [
  { id: 'default', name: '默认' },
  { id: 'rounded', name: '圆润' },
  { id: 'sharp', name: '方正' },
  { id: 'bubble', name: '气泡' },
] as const

/** 加载动画选项 */
export const LOADING_ANIMS = [
  { id: 'default', name: '默认旋转' },
  { id: 'pulse', name: '脉冲' },
  { id: 'bounce', name: '弹跳' },
  { id: 'spin', name: '旋转' },
] as const
