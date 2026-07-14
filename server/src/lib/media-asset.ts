// =====================================================================
// 素材入库 helper（静默版）
// ---------------------------------------------------------------------
// 将创意工坊产生的图片 / 视频 / 音频 URL 异步写入 media_assets 表。
// 静默失败版：调用失败仅打日志、不抛错，避免影响主业务流程。
// 实际 DB 操作复用 queries.ts 中的 addMediaAsset。
// =====================================================================

import { addMediaAsset as insertMediaAsset } from './queries'

export type MediaAssetType = 'image' | 'video' | 'audio'

export interface AddMediaAssetInput {
  userId: string
  type: MediaAssetType
  url: string
  prompt?: string | null
  title?: string | null
  projectId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * 静默写入素材记录。失败仅打日志、不抛错。
 */
export async function addMediaAsset(
  input: AddMediaAssetInput,
): Promise<void> {
  try {
    await insertMediaAsset(input)
  } catch (err) {
    console.error('[addMediaAsset] failed:', err)
  }
}
