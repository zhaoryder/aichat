-- =====================================================================
-- AI 智能体对话平台 - V3.0 完整升级迁移
-- 文件：supabase/migrations/upgrade-v3.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可
-- 依赖：先执行 supabase/schema.sql + upgrade-v2.sql + upgrade-extend.sql
--       （media_assets 已在 upgrade-v3-media.sql 中创建，本文件 IF NOT EXISTS 兼容）
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. media_assets —— 个人素材库（与 upgrade-v3-media.sql 等价，IF NOT EXISTS 兼容）
-- =====================================================================
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
CREATE INDEX IF NOT EXISTS idx_media_assets_user_id ON public.media_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_type ON public.media_assets(type);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON public.media_assets(created_at DESC);
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "用户只能读写自己的素材" ON public.media_assets;
CREATE POLICY "用户只能读写自己的素材" ON public.media_assets
    USING (auth.uid() = user_id);

-- =====================================================================
-- 2. agent_teams —— 多智能体并行协作团队
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.agent_teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    agent_ids   TEXT[] NOT NULL,
    config      JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_teams_user_id ON public.agent_teams(user_id);
ALTER TABLE public.agent_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "用户只能 CRUD 自己的团队" ON public.agent_teams;
CREATE POLICY "用户只能 CRUD 自己的团队" ON public.agent_teams
    USING (auth.uid() = user_id);

-- =====================================================================
-- 3. project_snapshots —— Vibe Code 项目快照仓库
-- =====================================================================
-- 自引用表：先建表，再加 parent_id 外键
CREATE TABLE IF NOT EXISTS public.project_snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL,
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    label       TEXT,
    parent_id   UUID,
    branch      TEXT NOT NULL DEFAULT 'main',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- 自引用外键（表已存在后才能引用自身）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'project_snapshots_parent_id_fkey'
    ) THEN
        ALTER TABLE public.project_snapshots
            ADD CONSTRAINT project_snapshots_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES public.project_snapshots(id) ON DELETE SET NULL;
    END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_snapshots_project ON public.project_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_branch ON public.project_snapshots(project_id, branch);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_id ON public.project_snapshots(user_id);
ALTER TABLE public.project_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "用户只能 CRUD 自己的快照" ON public.project_snapshots;
CREATE POLICY "用户只能 CRUD 自己的快照" ON public.project_snapshots
    USING (auth.uid() = user_id);

-- =====================================================================
-- 4. chat_rooms / room_participants / room_messages —— 联机共聊房间
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.chat_rooms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    agent_id    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_status ON public.chat_rooms(status);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_host_id ON public.chat_rooms(host_id);

CREATE TABLE IF NOT EXISTS public.room_participants (
    room_id     UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_room_participants_user_id ON public.room_participants(user_id);

CREATE TABLE IF NOT EXISTS public.room_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    agent_id    TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_room_messages ON public.room_messages(room_id, created_at);

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "active 房间所有登录用户可读" ON public.chat_rooms;
CREATE POLICY "active 房间所有登录用户可读" ON public.chat_rooms
    FOR SELECT USING (status = 'active');
DROP POLICY IF EXISTS "房主可 CRUD 自己的房间" ON public.chat_rooms;
CREATE POLICY "房主可 CRUD 自己的房间" ON public.chat_rooms
    USING (auth.uid() = host_id);

ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "参与者可读自己加入的房间" ON public.room_participants;
CREATE POLICY "参与者可读自己加入的房间" ON public.room_participants
    USING (auth.uid() = user_id);

ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "房间参与者可读写消息" ON public.room_messages;
CREATE POLICY "房间参与者可读写消息" ON public.room_messages
    USING (
        EXISTS (
            SELECT 1 FROM public.room_participants
            WHERE room_id = public.room_messages.room_id
              AND user_id = auth.uid()
        )
    );

-- =====================================================================
-- 5. user_themes —— 个性化装扮
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_themes (
    user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme_id    TEXT NOT NULL DEFAULT 'default',
    custom_colors JSONB DEFAULT '{}'::jsonb,
    bubble_style TEXT NOT NULL DEFAULT 'default',
    loading_anim TEXT NOT NULL DEFAULT 'default',
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "用户只能读写自己的主题" ON public.user_themes;
CREATE POLICY "用户只能读写自己的主题" ON public.user_themes
    USING (auth.uid() = user_id);

-- =====================================================================
-- 6. forum_topics 扩展 + forum_ratings —— 社区一键复刻分享
-- =====================================================================
-- 6.1 给 forum_topics 添加 project_payload 字段（项目包：code + assets 引用）
ALTER TABLE public.forum_topics
    ADD COLUMN IF NOT EXISTS project_payload JSONB;

-- 6.2 forum_ratings —— 论坛话题评分
CREATE TABLE IF NOT EXISTS public.forum_ratings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id    UUID NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(topic_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_forum_ratings_topic_id ON public.forum_ratings(topic_id);
CREATE INDEX IF NOT EXISTS idx_forum_ratings_user_id ON public.forum_ratings(user_id);
ALTER TABLE public.forum_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "用户只能读写自己的评分" ON public.forum_ratings;
CREATE POLICY "用户只能读写自己的评分" ON public.forum_ratings
    USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "所有用户可读话题评分" ON public.forum_ratings;
CREATE POLICY "所有用户可读话题评分" ON public.forum_ratings
    FOR SELECT USING (true);

-- =====================================================================
-- 7. Supabase Realtime 配置 —— 联机房间实时消息
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'room_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'chat_rooms'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'room_participants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.room_participants;
    END IF;
END$$;

-- =====================================================================
-- 完成
-- =====================================================================
-- 表清单：
--   1. media_assets          ✅ 个人素材库
--   2. agent_teams           ✅ 多智能体团队
--   3. project_snapshots     ✅ Vibe Code 快照
--   4. chat_rooms            ✅ 联机房间
--   5. room_participants     ✅ 房间参与者
--   6. room_messages         ✅ 房间消息
--   7. user_themes           ✅ 个性化装扮
--   8. forum_ratings         ✅ 话题评分
-- + forum_topics.project_payload 字段
-- + 7 个表启用 RLS + 9 个 policy
-- + Realtime 配置（room_messages / chat_rooms / room_participants）
