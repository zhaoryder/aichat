// =====================================================================
// 每日灵感 API（Daily Inspiration）
// ---------------------------------------------------------------------
// GET /api/daily/today  — 获取今日挑战主题（基于日期 seed 生成，每天不同）
// GET /api/daily/history — 获取往期挑战列表
// =====================================================================

import { Router, Request, Response } from 'express'
import { callAgnesChat } from '../lib/ai-client'
import { supabase } from '../lib/supabase'

export const dailyRouter = Router()

// ---------------------------------------------------------------------
// 每日主题词库（用于 seed 生成，避免 LLM 调用失败时无内容）
// ---------------------------------------------------------------------

interface DailyTheme {
  title: string
  description: string
  prompt: string
  type: 'image' | 'video' | 'text' | 'voice'
}

const THEME_POOL: DailyTheme[] = [
  {
    title: '月球上的咖啡时光',
    description: '画一只在月球上喝咖啡的猫，赛博朋克风格',
    prompt: '一只穿着宇航服的猫坐在月球表面喝咖啡，背景是地球，赛博朋克霓虹光影',
    type: 'image',
  },
  {
    title: '未来城市的一天',
    description: '描述 2125 年智能城市的一个清晨',
    prompt: '2125 年的智能城市清晨，飞行汽车穿梭在摩天大楼之间',
    type: 'text',
  },
  {
    title: '会唱歌的植物',
    description: '画一株会唱歌的神奇植物',
    prompt: '一株发光的神奇植物，叶片在振动发出音乐，周围有音符飘散',
    type: 'image',
  },
  {
    title: '时间旅行者的日记',
    description: '写一段时间旅行者的日记',
    prompt: '一位时间旅行者在古罗马的日记片段',
    type: 'text',
  },
  {
    title: '深海霓虹',
    description: '深海中的霓虹生物',
    prompt: '深海中发光的霓虹水母群，梦幻紫色蓝色光晕',
    type: 'image',
  },
  {
    title: '机器人的早餐',
    description: '机器人做早餐的场景',
    prompt: '一个可爱的机器人在厨房做早餐的温馨场景',
    type: 'image',
  },
  {
    title: '云上咖啡馆',
    description: '建在云端的咖啡馆',
    prompt: '一座漂浮在云端的小咖啡馆，日落金色光芒',
    type: 'image',
  },
  {
    title: '如果颜色会说话',
    description: '让红色和蓝色对话',
    prompt: '拟人化的红色和蓝色在对话，讨论它们各自的性格',
    type: 'text',
  },
]

// ---------------------------------------------------------------------
// 基于日期生成 seed
// ---------------------------------------------------------------------

function getDateSeed(date: Date): number {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return y * 10000 + m * 100 + d
}

function getTodayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------
// GET /api/daily/today — 获取今日挑战
// ---------------------------------------------------------------------

dailyRouter.get('/today', async (req: Request, res: Response) => {
  try {
    const today = getTodayString()
    const seed = getDateSeed(new Date())

    // 先查缓存表（daily_challenges）
    const { data: existing } = await supabase
      .from('daily_challenges')
      .select('*')
      .eq('date', today)
      .maybeSingle()

    if (existing) {
      res.json({ challenge: existing })
      return
    }

    // 没有缓存 → 基于 seed 选主题
    const theme = THEME_POOL[seed % THEME_POOL.length]

    // 尝试用 LLM 生成更有趣的变体（失败则用词库原版）
    let finalTheme = theme
    try {
      const llmResult = await callAgnesChat(
        '你是一个创意挑战设计师。请基于给定主题生成一个有趣的变体。只输出 JSON：{"title":"标题","description":"描述","prompt":"创作提示"}',
        `基础主题：${theme.title}。请生成一个更有趣的变体。`,
        { model: 'agnes-2.0-flash' },
      )
      const parsed = JSON.parse(llmResult)
      if (parsed.title && parsed.prompt) {
        finalTheme = {
          title: parsed.title,
          description: parsed.description || theme.description,
          prompt: parsed.prompt,
          type: theme.type,
        }
      }
    } catch {
      // LLM 失败，用词库原版
    }

    // 缓存到数据库（如果表存在）
    let saved: any = null
    try {
      const result = await supabase
        .from('daily_challenges')
        .insert({
          date: today,
          title: finalTheme.title,
          description: finalTheme.description,
          prompt: finalTheme.prompt,
          type: finalTheme.type,
        })
        .select('*')
        .single()
      saved = result.data
    } catch {
      // 表不存在或插入失败，忽略
    }

    res.json({
      challenge: saved || {
        date: today,
        title: finalTheme.title,
        description: finalTheme.description,
        prompt: finalTheme.prompt,
        type: finalTheme.type,
      },
    })
  } catch (err) {
    console.error('[api/daily/today] error:', err)
    // 降级：返回词库中的主题
    const seed = getDateSeed(new Date())
    const theme = THEME_POOL[seed % THEME_POOL.length]
    res.json({
      challenge: {
        date: getTodayString(),
        ...theme,
      },
    })
  }
})

// ---------------------------------------------------------------------
// GET /api/daily/history — 获取往期挑战
// ---------------------------------------------------------------------

dailyRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(30, parseInt(req.query.limit as string) || 10)

    const { data: challenges, error } = await supabase
      .from('daily_challenges')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit)

    if (error) throw error

    res.json({ challenges: challenges ?? [] })
  } catch (err) {
    console.error('[api/daily/history] error:', err)
    res.json({ challenges: [] })
  }
})
