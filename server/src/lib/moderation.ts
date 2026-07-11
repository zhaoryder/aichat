// =====================================================================
// 关键词过滤模块
// ---------------------------------------------------------------------
// 从 lib/moderation.ts 迁移，适配 Express 后端。
// 提供对用户输入内容的敏感词检测：
//   - containsForbidden: 底层检测函数，返回是否命中与命中的关键词
//   - moderateContent:   对外友好封装，返回 { ok, reason? }
//
// 数据源：moderation_keywords 表（通过 listModerationKeywords 拉取）。
// 缓存策略：模块级缓存 + 5 分钟 TTL，避免每次请求都查 DB。
// 容错策略：fail-open —— DB 查询失败或正则解析失败时一律不阻断主流程。
// =====================================================================

import { listModerationKeywords } from './queries'
import type { ModerationKeyword } from '@shared/types'

/** 关键词缓存 TTL（毫秒），5 分钟 */
const KEYWORD_CACHE_TTL_MS = 5 * 60 * 1000

/** 模块级缓存：关键词列表 + 拉取时间戳 */
interface KeywordCache {
  keywords: ModerationKeyword[]
  fetchedAt: number
}

let keywordCache: KeywordCache | null = null

/**
 * 获取（必要时刷新）关键词列表。
 *
 * - 首次调用或缓存过期时从 DB 拉取
 * - 拉取失败返回空数组（fail-open，避免阻断主流程）
 */
async function getKeywords(): Promise<ModerationKeyword[]> {
  const now = Date.now()
  if (keywordCache && now - keywordCache.fetchedAt < KEYWORD_CACHE_TTL_MS) {
    return keywordCache.keywords
  }

  try {
    const keywords = await listModerationKeywords()
    keywordCache = { keywords, fetchedAt: now }
    return keywords
  } catch (err) {
    // DB 查询失败：保留旧缓存（若存在）以维持现有过滤能力，否则视为无关键词
    console.error('[moderation] 拉取关键词失败，fail-open：', err)
    if (keywordCache) {
      // 复用旧缓存但不刷新时间戳，下次请求仍会重试拉取
      return keywordCache.keywords
    }
    return []
  }
}

/**
 * 检测内容是否命中任一敏感词。
 *
 * 对每条关键词：
 *   - 若 pattern 字段存在，按正则匹配 `new RegExp(pattern).test(content)`
 *     （正则本身可加 i 标志实现大小写不敏感）
 *   - 否则做大小写不敏感的包含匹配：content.toLowerCase().includes(keyword.toLowerCase())
 *
 * 命中任一关键词即立即返回；不命中返回 { hit: false }。
 * 任何异常（DB 查询失败、正则解析失败）均 fail-open 返回 { hit: false }。
 */
export async function containsForbidden(
  content: string
): Promise<{ hit: boolean; keyword?: string }> {
  if (!content) {
    return { hit: false }
  }

  const keywords = await getKeywords()
  if (keywords.length === 0) {
    return { hit: false }
  }

  const lowerContent = content.toLowerCase()

  for (const item of keywords) {
    const { keyword, pattern } = item

    if (pattern) {
      // 正则匹配：失败则跳过该关键词，不影响其它检测
      try {
        if (new RegExp(pattern).test(content)) {
          return { hit: true, keyword: keyword }
        }
      } catch (err) {
        console.error(
          `[moderation] 正则解析失败，跳过关键词「${keyword}」：`,
          err
        )
        continue
      }
    } else {
      // 简单包含匹配（大小写不敏感）
      if (keyword && lowerContent.includes(keyword.toLowerCase())) {
        return { hit: true, keyword }
      }
    }
  }

  return { hit: false }
}

/**
 * 内容审核友好封装。
 *
 * - 未命中：返回 { ok: true }
 * - 命中：   返回 { ok: false, reason: '内容包含敏感词，请修改' }
 *
 * fail-open：DB 不可用时返回 { ok: true }，不阻断业务流程。
 */
export async function moderateContent(
  content: string
): Promise<{ ok: boolean; reason?: string }> {
  const result = await containsForbidden(content)
  if (result.hit) {
    return { ok: false, reason: '内容包含敏感词，请修改' }
  }
  return { ok: true }
}
