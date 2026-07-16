-- =====================================================================
-- Agent 超级大升级 - Batch C：AI Teamwork 多角色协作
-- 文件：server/src/db/upgrade-team.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可。
-- 依赖：先执行 supabase/schema.sql + upgrade-v2.sql + upgrade-extend.sql
--       + upgrade-v3.sql + upgrade-skills.sql + upgrade-plans.sql
--       （auth.users / profiles / plans 已存在）
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. team_sessions —— AI Teamwork 多角色协作会话
-- ---------------------------------------------------------------------
-- 用户开启 Teamwork 后，创建一个 team_session 记录整个协作过程：
--   - roles：选中的角色列表（如 ['leader','coder','reviewer']）
--   - current_role_name：当前正在执行的角色
--   - transcript：完整对话历史（含每条消息的 agent_role）
--   - status：active / paused / completed / failed
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.team_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id       UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    goal          TEXT NOT NULL,
    roles         JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_role_name  TEXT,
    status        TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','completed','failed')),
    transcript    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：用户维度查询、状态筛选
CREATE INDEX IF NOT EXISTS idx_team_sessions_user_id ON public.team_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_team_sessions_status   ON public.team_sessions(status);

-- 启用 RLS：仅本人可读写自己的 team_session
ALTER TABLE public.team_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can crud" ON public.team_sessions;
CREATE POLICY "owner can crud" ON public.team_sessions
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 2. updated_at 自动维护触发器
-- =====================================================================
CREATE OR REPLACE FUNCTION public.touch_team_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_session_updated ON public.team_sessions;
CREATE TRIGGER trg_team_session_updated
    BEFORE UPDATE ON public.team_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_team_session_updated_at();

-- =====================================================================
-- 完成
-- =====================================================================
-- 表清单：
--   1. team_sessions  ✅ AI Teamwork 多角色协作会话
--      + roles JSONB / current_role_name / status 状态机 / transcript JSONB
-- + RLS：仅本人可读写
-- + 索引：team_sessions.user_id / team_sessions.status
-- + updated_at 触发器
