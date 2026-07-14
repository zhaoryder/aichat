// =====================================================================
// 个性化装扮 API
// ---------------------------------------------------------------------
// GET /api/themes    获取当前用户主题（无记录则返回默认）
// PUT /api/themes    部分更新主题（themeId / customColors / bubbleStyle / loadingAnim）
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { getUserTheme, upsertUserTheme } from '../lib/queries'
import { THEMES, BUBBLE_STYLES, LOADING_ANIMS } from '../../shared/themes'
import type { UserTheme } from '../../shared/types'

export const themesRouter = Router()

// 合法值白名单（显式标注 Set<string>，避免 as const 字面量联合类型拒绝 string 入参）
const VALID_THEME_IDS: Set<string> = new Set(THEMES.map((t) => t.id))
const VALID_BUBBLE_STYLES: Set<string> = new Set(BUBBLE_STYLES.map((b) => b.id))
const VALID_LOADING_ANIMS: Set<string> = new Set(LOADING_ANIMS.map((a) => a.id))

// 合法颜色字符串：#rgb / #rgba / #rrggbb / #rrggbbaa
const COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** 构造默认主题（用户无记录时返回） */
function buildDefaultTheme(userId: string): UserTheme {
  return {
    user_id: userId,
    theme_id: 'default',
    custom_colors: {},
    bubble_style: 'default',
    loading_anim: 'default',
    updated_at: new Date(0).toISOString(),
  }
}

// ---------------------------------------------------------------------
// GET /api/themes —— 获取当前用户主题
// ---------------------------------------------------------------------

themesRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const theme = await getUserTheme(user.id)
    res.json({ theme: theme ?? buildDefaultTheme(user.id) })
  } catch (err) {
    console.error('[api/themes GET] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})

// ---------------------------------------------------------------------
// PUT /api/themes —— 部分更新主题
// ---------------------------------------------------------------------

interface UpdateThemeBody {
  themeId?: unknown
  customColors?: unknown
  bubbleStyle?: unknown
  loadingAnim?: unknown
}

themesRouter.put('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  try {
    const body = (req.body ?? {}) as UpdateThemeBody

    // 校验 themeId
    let themeId: string | undefined
    if (body.themeId !== undefined) {
      if (typeof body.themeId !== 'string' || !VALID_THEME_IDS.has(body.themeId)) {
        res.status(400).json({ error: '无效的主题 ID' })
        return
      }
      themeId = body.themeId
    }

    // 校验 customColors
    let customColors: Record<string, unknown> | undefined
    if (body.customColors !== undefined) {
      if (typeof body.customColors !== 'object' || body.customColors === null) {
        res.status(400).json({ error: 'customColors 必须是对象' })
        return
      }
      const cc = body.customColors as Record<string, unknown>
      if (
        cc.primary !== undefined &&
        (typeof cc.primary !== 'string' || !COLOR_REGEX.test(cc.primary))
      ) {
        res.status(400).json({ error: 'primary 必须是合法颜色（如 #6366f1）' })
        return
      }
      if (
        cc.background !== undefined &&
        (typeof cc.background !== 'string' || !COLOR_REGEX.test(cc.background))
      ) {
        res.status(400).json({ error: 'background 必须是合法颜色（如 #fafafa）' })
        return
      }
      customColors = cc
    }

    // 校验 bubbleStyle
    let bubbleStyle: string | undefined
    if (body.bubbleStyle !== undefined) {
      if (
        typeof body.bubbleStyle !== 'string' ||
        !VALID_BUBBLE_STYLES.has(body.bubbleStyle)
      ) {
        res.status(400).json({ error: '无效的气泡样式' })
        return
      }
      bubbleStyle = body.bubbleStyle
    }

    // 校验 loadingAnim
    let loadingAnim: string | undefined
    if (body.loadingAnim !== undefined) {
      if (
        typeof body.loadingAnim !== 'string' ||
        !VALID_LOADING_ANIMS.has(body.loadingAnim)
      ) {
        res.status(400).json({ error: '无效的加载动画' })
        return
      }
      loadingAnim = body.loadingAnim
    }

    const theme = await upsertUserTheme({
      userId: user.id,
      themeId,
      customColors,
      bubbleStyle,
      loadingAnim,
    })
    res.json({ theme })
  } catch (err) {
    console.error('[api/themes PUT] 异常：', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '服务器开小差了',
    })
  }
})
