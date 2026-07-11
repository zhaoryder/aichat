-- =====================================================================
-- AI 智能体对话平台 - 数据库扩展迁移
-- 文件：supabase/migrations/upgrade-extend.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可
-- 依赖：先执行 supabase/schema.sql，本文件在其基础上扩展
-- =====================================================================

-- ---------- 0. 扩展（pgcrypto 用于 gen_random_uuid()，Supabase 默认已开启）----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =====================================================================
-- 1. profiles 表扩展：新增 points 字段（积分）
-- =====================================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;


-- =====================================================================
-- 2. custom_agents —— 自定义智能体
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.custom_agents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    personality     TEXT,
    system_prompt   TEXT NOT NULL,
    avatar_gradient TEXT NOT NULL DEFAULT 'linear-gradient(135deg, #F5B400 0%, #D49700 100%)',
    visibility      TEXT NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('private','public')),
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','pending','banned')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 自动维护 updated_at 的触发器（复用 schema.sql 中已定义的 set_updated_at 函数）
DROP TRIGGER IF EXISTS custom_agents_set_updated_at ON public.custom_agents;
CREATE TRIGGER custom_agents_set_updated_at
    BEFORE UPDATE ON public.custom_agents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_custom_agents_creator_id
    ON public.custom_agents(creator_id);

CREATE INDEX IF NOT EXISTS idx_custom_agents_visibility
    ON public.custom_agents(visibility);


-- =====================================================================
-- 3. agent_favorites —— 智能体收藏
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.agent_favorites (
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id    TEXT NOT NULL,
    agent_type  TEXT NOT NULL CHECK (agent_type IN ('official','custom')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, agent_id, agent_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_favorites_user_id
    ON public.agent_favorites(user_id);


-- =====================================================================
-- 4. checkins —— 每日签到
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.checkins (
    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    check_date     DATE NOT NULL,
    streak_days    INTEGER NOT NULL DEFAULT 1,
    points_earned  INTEGER NOT NULL DEFAULT 10,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, check_date)
);

CREATE INDEX IF NOT EXISTS idx_checkins_user_id
    ON public.checkins(user_id);


-- =====================================================================
-- 5. shared_conversations —— 对话分享
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.shared_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_conversations_creator_id
    ON public.shared_conversations(creator_id);

CREATE INDEX IF NOT EXISTS idx_shared_conversations_slug
    ON public.shared_conversations(slug);


-- =====================================================================
-- 6. creative_works —— 创意作品
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.creative_works (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('script','video','image','article','game','voice')),
    title       TEXT NOT NULL,
    input       JSONB NOT NULL DEFAULT '{}',
    result      JSONB,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','done','failed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_works_creator_id
    ON public.creative_works(creator_id);

CREATE INDEX IF NOT EXISTS idx_creative_works_type
    ON public.creative_works(type);


-- =====================================================================
-- 7. game_saves —— 游戏存档
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.game_saves (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_type   TEXT NOT NULL,
    title       TEXT,
    state       JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 自动维护 updated_at 的触发器（复用 schema.sql 中已定义的 set_updated_at 函数）
DROP TRIGGER IF EXISTS game_saves_set_updated_at ON public.game_saves;
CREATE TRIGGER game_saves_set_updated_at
    BEFORE UPDATE ON public.game_saves
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_game_saves_user_id
    ON public.game_saves(user_id);


-- =====================================================================
-- =====================================================================
--                         Realtime 启用
-- =====================================================================
-- =====================================================================
-- 启用 forum_posts 与 messages 表的 Realtime 全量副本标识
-- （需在 Supabase Dashboard → Database → Replication 中确认已开启 publication）
-- =====================================================================
ALTER TABLE public.forum_posts REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;


-- =====================================================================
-- =====================================================================
--                         Row Level Security (RLS)
-- =====================================================================
-- =====================================================================
-- 复用 schema.sql 中已定义的 public.is_admin() 辅助函数
-- =====================================================================


-- ---------- custom_agents ----------
ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;

-- 公开可读：visibility='public' 或 status='active'，或创建者本人
DROP POLICY IF EXISTS "Anyone can read public or active custom agents" ON public.custom_agents;
CREATE POLICY "Anyone can read public or active custom agents"
    ON public.custom_agents FOR SELECT
    USING (
        visibility = 'public'
        OR status = 'active'
        OR auth.uid() = creator_id
        OR public.is_admin()
    );

-- 创建者可插入自己的智能体
DROP POLICY IF EXISTS "Creators can insert own custom agents" ON public.custom_agents;
CREATE POLICY "Creators can insert own custom agents"
    ON public.custom_agents FOR INSERT
    WITH CHECK (auth.uid() = creator_id);

-- 创建者可更新自己的智能体
DROP POLICY IF EXISTS "Creators can update own custom agents" ON public.custom_agents;
CREATE POLICY "Creators can update own custom agents"
    ON public.custom_agents FOR UPDATE
    USING (auth.uid() = creator_id OR public.is_admin())
    WITH CHECK (auth.uid() = creator_id OR public.is_admin());

-- 创建者可删除自己的智能体
DROP POLICY IF EXISTS "Creators can delete own custom agents" ON public.custom_agents;
CREATE POLICY "Creators can delete own custom agents"
    ON public.custom_agents FOR DELETE
    USING (auth.uid() = creator_id OR public.is_admin());


-- ---------- agent_favorites ----------
ALTER TABLE public.agent_favorites ENABLE ROW LEVEL SECURITY;

-- 仅本人可查看收藏
DROP POLICY IF EXISTS "Users can view own agent favorites" ON public.agent_favorites;
CREATE POLICY "Users can view own agent favorites"
    ON public.agent_favorites FOR SELECT
    USING (auth.uid() = user_id);

-- 仅本人可添加收藏
DROP POLICY IF EXISTS "Users can insert own agent favorites" ON public.agent_favorites;
CREATE POLICY "Users can insert own agent favorites"
    ON public.agent_favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 仅本人可更新收藏（一般场景较少，保留以便扩展）
DROP POLICY IF EXISTS "Users can update own agent favorites" ON public.agent_favorites;
CREATE POLICY "Users can update own agent favorites"
    ON public.agent_favorites FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 仅本人可删除收藏
DROP POLICY IF EXISTS "Users can delete own agent favorites" ON public.agent_favorites;
CREATE POLICY "Users can delete own agent favorites"
    ON public.agent_favorites FOR DELETE
    USING (auth.uid() = user_id);


-- ---------- checkins ----------
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

-- 仅本人可查看签到记录
DROP POLICY IF EXISTS "Users can view own checkins" ON public.checkins;
CREATE POLICY "Users can view own checkins"
    ON public.checkins FOR SELECT
    USING (auth.uid() = user_id);

-- 仅本人可签到
DROP POLICY IF EXISTS "Users can insert own checkins" ON public.checkins;
CREATE POLICY "Users can insert own checkins"
    ON public.checkins FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 仅本人可更新签到记录
DROP POLICY IF EXISTS "Users can update own checkins" ON public.checkins;
CREATE POLICY "Users can update own checkins"
    ON public.checkins FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 仅本人可删除签到记录
DROP POLICY IF EXISTS "Users can delete own checkins" ON public.checkins;
CREATE POLICY "Users can delete own checkins"
    ON public.checkins FOR DELETE
    USING (auth.uid() = user_id);


-- ---------- shared_conversations ----------
ALTER TABLE public.shared_conversations ENABLE ROW LEVEL SECURITY;

-- 公开可读：任何人都能查看分享的对话
DROP POLICY IF EXISTS "Anyone can read shared conversations" ON public.shared_conversations;
CREATE POLICY "Anyone can read shared conversations"
    ON public.shared_conversations FOR SELECT
    USING (true);

-- 创建者可插入分享
DROP POLICY IF EXISTS "Creators can insert own shared conversations" ON public.shared_conversations;
CREATE POLICY "Creators can insert own shared conversations"
    ON public.shared_conversations FOR INSERT
    WITH CHECK (auth.uid() = creator_id);

-- 创建者可删除分享
DROP POLICY IF EXISTS "Creators can delete own shared conversations" ON public.shared_conversations;
CREATE POLICY "Creators can delete own shared conversations"
    ON public.shared_conversations FOR DELETE
    USING (auth.uid() = creator_id OR public.is_admin());


-- ---------- creative_works ----------
ALTER TABLE public.creative_works ENABLE ROW LEVEL SECURITY;

-- 公开可读：任何人都能查看创意作品
DROP POLICY IF EXISTS "Anyone can read creative works" ON public.creative_works;
CREATE POLICY "Anyone can read creative works"
    ON public.creative_works FOR SELECT
    USING (true);

-- 创建者可插入作品
DROP POLICY IF EXISTS "Creators can insert own creative works" ON public.creative_works;
CREATE POLICY "Creators can insert own creative works"
    ON public.creative_works FOR INSERT
    WITH CHECK (auth.uid() = creator_id);

-- 创建者可更新作品
DROP POLICY IF EXISTS "Creators can update own creative works" ON public.creative_works;
CREATE POLICY "Creators can update own creative works"
    ON public.creative_works FOR UPDATE
    USING (auth.uid() = creator_id OR public.is_admin())
    WITH CHECK (auth.uid() = creator_id OR public.is_admin());

-- 创建者可删除作品
DROP POLICY IF EXISTS "Creators can delete own creative works" ON public.creative_works;
CREATE POLICY "Creators can delete own creative works"
    ON public.creative_works FOR DELETE
    USING (auth.uid() = creator_id OR public.is_admin());


-- ---------- game_saves ----------
ALTER TABLE public.game_saves ENABLE ROW LEVEL SECURITY;

-- 仅本人可查看存档
DROP POLICY IF EXISTS "Users can view own game saves" ON public.game_saves;
CREATE POLICY "Users can view own game saves"
    ON public.game_saves FOR SELECT
    USING (auth.uid() = user_id);

-- 仅本人可插入存档
DROP POLICY IF EXISTS "Users can insert own game saves" ON public.game_saves;
CREATE POLICY "Users can insert own game saves"
    ON public.game_saves FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 仅本人可更新存档
DROP POLICY IF EXISTS "Users can update own game saves" ON public.game_saves;
CREATE POLICY "Users can update own game saves"
    ON public.game_saves FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 仅本人可删除存档
DROP POLICY IF EXISTS "Users can delete own game saves" ON public.game_saves;
CREATE POLICY "Users can delete own game saves"
    ON public.game_saves FOR DELETE
    USING (auth.uid() = user_id);
