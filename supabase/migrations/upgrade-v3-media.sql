-- =====================================================================
-- AI 智能体对话平台 - V3 个人素材库迁移
-- 文件：supabase/migrations/upgrade-v3-media.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可
-- 依赖：先执行 supabase/schema.sql 与 supabase/migrations/upgrade-v2.sql
-- =====================================================================

-- ---------- 0. 扩展（pgcrypto 用于 gen_random_uuid()，Supabase 默认已开启）----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =====================================================================
-- 1. media_assets —— 个人素材库
-- =====================================================================
-- 个人媒体素材表，用户产生的图片 / 视频 / 音频资源都会记录到这里。
-- 与 image_gallery（公开广场）的区别：本表为用户私有库，受 RLS 保护。

CREATE TABLE IF NOT EXISTS public.media_assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('image', 'video', 'audio')),
    url         TEXT NOT NULL,
    prompt      TEXT,
    title       TEXT,
    project_id  UUID,
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- 1.1 索引 ----------
CREATE INDEX IF NOT EXISTS idx_media_assets_user_id
    ON public.media_assets(user_id);

CREATE INDEX IF NOT EXISTS idx_media_assets_type
    ON public.media_assets(type);

CREATE INDEX IF NOT EXISTS idx_media_assets_created_at
    ON public.media_assets(created_at DESC);

-- ---------- 1.2 RLS 策略 ----------
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "用户只能读写自己的素材" ON public.media_assets;

CREATE POLICY "用户只能读写自己的素材" ON public.media_assets
    USING (auth.uid() = user_id);
