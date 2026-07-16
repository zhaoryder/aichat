-- =====================================================================
-- Agent 超级大升级 - Batch B：Plan Mode 规划执行
-- 文件：server/src/db/upgrade-plans.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可。
-- 依赖：先执行 supabase/schema.sql + upgrade-v2.sql + upgrade-extend.sql
--       + upgrade-v3.sql + upgrade-skills.sql（auth.users / profiles 已存在）
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. plans —— Plan Mode 规划执行表
-- ---------------------------------------------------------------------
-- 用户用自然语言描述需求 → AI 拆解为 3-7 个 step → 按 step 流式执行
-- 状态机：draft → planning → ready → executing → (paused) → completed/failed
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.plans (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id    TEXT,
    goal          TEXT NOT NULL,
    steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_step  INT  NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','planning','ready','executing','paused','completed','failed')),
    mode          TEXT NOT NULL DEFAULT 'single'
                      CHECK (mode IN ('single','plan','team')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：用户维度查询、状态筛选
CREATE INDEX IF NOT EXISTS idx_plans_user_id  ON public.plans(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_status   ON public.plans(status);

-- 启用 RLS：仅本人可读写自己的 plan
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "用户只能读写自己的 plan" ON public.plans;
CREATE POLICY "用户只能读写自己的 plan" ON public.plans
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 2. updated_at 自动维护触发器
-- =====================================================================
DROP TRIGGER IF EXISTS trg_plans_updated_at ON public.plans;
CREATE OR REPLACE FUNCTION public.set_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_plans_updated_at
    BEFORE UPDATE ON public.plans
    FOR EACH ROW
    EXECUTE FUNCTION public.set_plans_updated_at();

-- =====================================================================
-- 完成
-- =====================================================================
-- 表清单：
--   1. plans  ✅ Plan Mode 规划执行（含 steps JSONB + 状态机）
-- + RLS：仅本人可读写
-- + 索引：plans.user_id / plans.status
-- + updated_at 触发器
