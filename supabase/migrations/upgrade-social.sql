-- =====================================================================
-- AI Lab 社媒化改版 - 数据库迁移
-- 文件：supabase/migrations/upgrade-social.sql
-- 说明：新增 posts / follows / likes / comments / notifications 五张表
-- 依赖：先执行 supabase/schema.sql
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. posts —— 用户动态（社媒核心表）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.posts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type        TEXT NOT NULL DEFAULT 'text'
                CHECK (type IN ('text', 'conversation_share', 'project_share', 'image_share', 'repost')),
    content     TEXT NOT NULL DEFAULT '',
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    repost_of   UUID REFERENCES public.posts(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_type ON public.posts(type);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_select_public" ON public.posts;
CREATE POLICY "posts_select_public" ON public.posts
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own" ON public.posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own" ON public.posts
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
-- 2. follows —— 关注关系（用户关注用户 / 用户关注智能体）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.follows (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    followee_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    followee_type TEXT NOT NULL DEFAULT 'user'
                  CHECK (followee_type IN ('user', 'agent')),
    agent_id      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(follower_id, followee_id, followee_type),
    UNIQUE(follower_id, agent_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON public.follows(followee_id);
CREATE INDEX IF NOT EXISTS idx_follows_agent ON public.follows(agent_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows_select_public" ON public.follows;
CREATE POLICY "follows_select_public" ON public.follows
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "follows_insert_own" ON public.follows;
CREATE POLICY "follows_insert_own" ON public.follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);
DROP POLICY IF EXISTS "follows_delete_own" ON public.follows;
CREATE POLICY "follows_delete_own" ON public.follows
    FOR DELETE USING (auth.uid() = follower_id);

-- =====================================================================
-- 3. likes —— 点赞
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.likes (
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes(post_id);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "likes_select_public" ON public.likes;
CREATE POLICY "likes_select_public" ON public.likes
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "likes_insert_own" ON public.likes;
CREATE POLICY "likes_insert_own" ON public.likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "likes_delete_own" ON public.likes;
CREATE POLICY "likes_delete_own" ON public.likes
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
-- 4. comments —— 评论
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at DESC);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments_select_public" ON public.comments;
CREATE POLICY "comments_select_public" ON public.comments
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own" ON public.comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own" ON public.comments
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
-- 5. notifications —— 通知
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type         TEXT NOT NULL
                 CHECK (type IN ('follow', 'like', 'comment', 'repost', 'system')),
    actor_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_id    UUID,
    target_type  TEXT,
    read         BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);
