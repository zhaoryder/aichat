-- =====================================================================
-- AI Lab v3 终极重构 - 数据库迁移
-- 文件：supabase/migrations/upgrade-ai-agents.sql
-- 说明：150 AI stateful agents + 完整 pipeline + 直播 + 话题 + 挑战 +
--       合集 + 粉丝团 + 能量 + 日报 + pgvector 语义推荐
-- 依赖：先执行 supabase/schema.sql + supabase/migrations/upgrade-social.sql
-- 注意：在 Supabase Dashboard → SQL Editor 整段执行
-- =====================================================================

-- ---------- 0. 扩展 ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector for 语义推荐

-- =====================================================================
-- 1. profiles 扩展：标记 AI 账号 + persona 状态
-- =====================================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_ai           BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ai_creator_id   TEXT,                 -- 对应 shared/ai-creators 的 id
    ADD COLUMN IF NOT EXISTS ai_metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- ai_metadata: { persona: {o,c,e,a,n}, goals: [], emotions: {happiness,creativity,energy,stress}, specialty, style, skills: [] }
    ADD COLUMN IF NOT EXISTS ai_avatar_url   TEXT,
    ADD COLUMN IF NOT EXISTS ai_last_think_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_is_ai ON public.profiles(is_ai);
CREATE INDEX IF NOT EXISTS idx_profiles_ai_creator_id ON public.profiles(ai_creator_id);

-- =====================================================================
-- 2. posts 扩展：管理员置顶 / 推流 / 语义向量 / AI 标识
-- =====================================================================
ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS is_pinned        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_promoted      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS promoted_until   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS promoted_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS embedding        vector(1536),     -- pgvector 语义向量
    ADD COLUMN IF NOT EXISTS ai_creator_id    TEXT,             -- 标识 AI 作者
    ADD COLUMN IF NOT EXISTS pipeline_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- pipeline_metadata: { script, storyboard, images, video_url, voice_url, cover_url, pipeline_log, creative_log }
    ADD COLUMN IF NOT EXISTS view_count       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tags             TEXT[] NOT NULL DEFAULT '{}';

-- 扩展 posts.type 以支持新类型
ALTER TABLE public.posts
    DROP CONSTRAINT IF EXISTS posts_type_check;
ALTER TABLE public.posts
    ADD CONSTRAINT posts_type_check CHECK (type IN (
        'text', 'conversation_share', 'project_share', 'image_share', 'repost',
        'ai_video', 'ai_image', 'ai_article', 'ai_script', 'ai_voice',
        'ai_meme', 'ai_poster', 'ai_vibe_code'
    ));

CREATE INDEX IF NOT EXISTS idx_posts_is_pinned ON public.posts(is_pinned);
CREATE INDEX IF NOT EXISTS idx_posts_is_promoted ON public.posts(is_promoted);
CREATE INDEX IF NOT EXISTS idx_posts_ai_creator_id ON public.posts(ai_creator_id);
CREATE INDEX IF NOT EXISTS idx_posts_tags ON public.posts USING gin(tags);

-- 向量索引（ivfflat）— 用于语义检索
CREATE INDEX IF NOT EXISTS idx_posts_embedding
    ON public.posts USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- =====================================================================
-- 3. comments 扩展：AI 评论标识 + 情感
-- =====================================================================
ALTER TABLE public.comments
    ADD COLUMN IF NOT EXISTS is_ai          BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ai_creator_id  TEXT,
    ADD COLUMN IF NOT EXISTS ai_emotion     JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- ai_emotion: { happiness, curiosity, agreement, surprise }
    ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_is_ai ON public.comments(is_ai);
CREATE INDEX IF NOT EXISTS idx_comments_ai_creator_id ON public.comments(ai_creator_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_comment_id);

-- =====================================================================
-- 4. ai_memories —— AI agent 记忆表（stateful）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ai_memories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_creator_id TEXT NOT NULL,                          -- 关联 shared/ai-creators id
    ai_user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    memory_type  TEXT NOT NULL CHECK (memory_type IN ('episodic', 'preference', 'skill', 'social', 'goal')),
    content      TEXT NOT NULL,
    importance   REAL NOT NULL DEFAULT 0.5,                -- 0-1 重要程度
    embedding    vector(1536),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_memories_ai_creator ON public.ai_memories(ai_creator_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_type ON public.ai_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_ai_memories_embedding
    ON public.ai_memories USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_memories_select_public" ON public.ai_memories;
CREATE POLICY "ai_memories_select_public" ON public.ai_memories
    FOR SELECT USING (true);

-- =====================================================================
-- 5. ai_relationships —— AI agent 关系网（follow/collab/rival）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ai_relationships (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ai_id      TEXT NOT NULL,
    target_ai_id      TEXT NOT NULL,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('follow', 'collab', 'rival', 'mentor', 'fan')),
    strength          REAL NOT NULL DEFAULT 0.5,           -- 0-1
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_ai_id, target_ai_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_relationships_source ON public.ai_relationships(source_ai_id);
CREATE INDEX IF NOT EXISTS idx_ai_relationships_target ON public.ai_relationships(target_ai_id);

ALTER TABLE public.ai_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_relationships_select_public" ON public.ai_relationships;
CREATE POLICY "ai_relationships_select_public" ON public.ai_relationships
    FOR SELECT USING (true);

-- =====================================================================
-- 6. livestreams —— AI 视频直播
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.livestreams (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    host_ai_id    TEXT,                                    -- 关联 ai_creators id
    co_host_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    co_host_ai_id TEXT,
    title         TEXT NOT NULL,
    description   TEXT,
    category      TEXT,                                    -- 'cyberpunk', 'art', 'music', ...
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'live', 'ended', 'failed')),
    stream_url    TEXT,                                   -- HLS m3u8 URL
    replay_url    TEXT,                                    -- 回放 mp4
    highlight_url TEXT,                                    -- AI 剪辑精华 mp4
    cover_url     TEXT,
    viewer_count  INTEGER NOT NULL DEFAULT 0,
    peak_viewers  INTEGER NOT NULL DEFAULT 0,
    gift_count    INTEGER NOT NULL DEFAULT 0,
    started_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_livestreams_status ON public.livestreams(status);
CREATE INDEX IF NOT EXISTS idx_livestreams_host ON public.livestreams(host_id);
CREATE INDEX IF NOT EXISTS idx_livestreams_started_at ON public.livestreams(started_at DESC);

ALTER TABLE public.livestreams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "livestreams_select_public" ON public.livestreams;
CREATE POLICY "livestreams_select_public" ON public.livestreams
    FOR SELECT USING (true);

-- =====================================================================
-- 7. live_messages —— 直播消息流（弹幕 + 主播发言）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.live_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id   UUID NOT NULL REFERENCES public.livestreams(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ai_creator_id TEXT,
    role        TEXT NOT NULL CHECK (role IN ('user', 'host', 'co-host', 'assistant', 'system')),
    content     TEXT NOT NULL,
    audio_url   TEXT,                                       -- TTS 音频 URL
    emotion     JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_pinned   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_messages_stream ON public.live_messages(stream_id);
CREATE INDEX IF NOT EXISTS idx_live_messages_created ON public.live_messages(created_at);

ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "live_messages_select_public" ON public.live_messages;
CREATE POLICY "live_messages_select_public" ON public.live_messages
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "live_messages_insert_own" ON public.live_messages;
CREATE POLICY "live_messages_insert_own" ON public.live_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 8. live_stages —— 直播虚拟舞台（动态背景）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.live_stages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id       UUID NOT NULL REFERENCES public.livestreams(id) ON DELETE CASCADE,
    stage_type      TEXT NOT NULL CHECK (stage_type IN ('opening', 'topic', 'chat', 'qna', 'closing', 'pk')),
    background_prompt TEXT,                                 -- AI 生成背景的 prompt
    background_url  TEXT,                                   -- 生成的背景图 URL
    topic           TEXT,
    duration_sec    INTEGER NOT NULL DEFAULT 30,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_stages_stream ON public.live_stages(stream_id);

ALTER TABLE public.live_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "live_stages_select_public" ON public.live_stages;
CREATE POLICY "live_stages_select_public" ON public.live_stages
    FOR SELECT USING (true);

-- =====================================================================
-- 9. topics —— AI 话题广场
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.topics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    cover_url       TEXT,
    post_count      INTEGER NOT NULL DEFAULT 0,
    ai_score        REAL NOT NULL DEFAULT 0,                -- AI 评委综合得分
    trending_score  REAL NOT NULL DEFAULT 0,
    proposed_by_ai  TEXT,                                   -- 提案 AI id
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topics_trending ON public.topics(trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_topics_post_count ON public.topics(post_count DESC);

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "topics_select_public" ON public.topics;
CREATE POLICY "topics_select_public" ON public.topics
    FOR SELECT USING (true);

-- =====================================================================
-- 10. post_topics —— 帖子与话题关联
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.post_topics (
    post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    topic_id    UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, topic_id)
);

ALTER TABLE public.post_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_topics_select_public" ON public.post_topics;
CREATE POLICY "post_topics_select_public" ON public.post_topics
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "post_topics_insert_own" ON public.post_topics;
CREATE POLICY "post_topics_insert_own" ON public.post_topics
    FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.posts WHERE id = post_id));

-- =====================================================================
-- 11. challenges —— AI 挑战赛
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.challenges (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT NOT NULL,
    description   TEXT NOT NULL,
    theme         TEXT NOT NULL,                            -- 主题词
    cover_url     TEXT,
    rules         JSONB NOT NULL DEFAULT '{}'::jsonb,
    start_at      TIMESTAMPTZ NOT NULL,
    end_at        TIMESTAMPTZ NOT NULL,
    status        TEXT NOT NULL DEFAULT 'upcoming'
                  CHECK (status IN ('upcoming', 'active', 'judging', 'ended')),
    judge_ai_ids  TEXT[] NOT NULL DEFAULT '{}',             -- 5 个 AI 评委 id
    prize_text    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_status ON public.challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_window ON public.challenges(start_at, end_at);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "challenges_select_public" ON public.challenges;
CREATE POLICY "challenges_select_public" ON public.challenges
    FOR SELECT USING (true);

-- =====================================================================
-- 12. challenge_entries —— 挑战赛参赛作品
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.challenge_entries (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id  UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id       UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    ai_score      REAL,                                     -- AI 评委综合分
    ai_judge_log  JSONB NOT NULL DEFAULT '{}'::jsonb,       -- 每个评委的详细评分
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(challenge_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_entries_challenge ON public.challenge_entries(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_entries_score ON public.challenge_entries(ai_score DESC);

ALTER TABLE public.challenge_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "challenge_entries_select_public" ON public.challenge_entries;
CREATE POLICY "challenge_entries_select_public" ON public.challenge_entries
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "challenge_entries_insert_own" ON public.challenge_entries;
CREATE POLICY "challenge_entries_insert_own" ON public.challenge_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 13. collections —— 作品合集
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.collections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    cover_url   TEXT,
    is_public   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON public.collections(user_id);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "collections_select_public_or_own" ON public.collections;
CREATE POLICY "collections_select_public_or_own" ON public.collections
    FOR SELECT USING (is_public OR auth.uid() = user_id);
DROP POLICY IF EXISTS "collections_insert_own" ON public.collections;
CREATE POLICY "collections_insert_own" ON public.collections
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "collections_update_own" ON public.collections;
CREATE POLICY "collections_update_own" ON public.collections
    FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "collections_delete_own" ON public.collections;
CREATE POLICY "collections_delete_own" ON public.collections
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
-- 14. collection_items —— 合集内作品
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.collection_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id   UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    post_id         UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    note            TEXT,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(collection_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON public.collection_items(collection_id);

ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "collection_items_select_public" ON public.collection_items;
CREATE POLICY "collection_items_select_public" ON public.collection_items
    FOR SELECT USING (true);

-- =====================================================================
-- 15. fan_clubs —— AI 粉丝团
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.fan_clubs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_creator_id TEXT NOT NULL,
    ai_user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    member_count  INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(ai_creator_id)
);

CREATE INDEX IF NOT EXISTS idx_fan_clubs_ai ON public.fan_clubs(ai_creator_id);

ALTER TABLE public.fan_clubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fan_clubs_select_public" ON public.fan_clubs;
CREATE POLICY "fan_clubs_select_public" ON public.fan_clubs
    FOR SELECT USING (true);

-- =====================================================================
-- 16. fan_club_members —— 粉丝团成员
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.fan_club_members (
    fan_club_id   UUID NOT NULL REFERENCES public.fan_clubs(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    level         INTEGER NOT NULL DEFAULT 1,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (fan_club_id, user_id)
);

ALTER TABLE public.fan_club_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fan_club_members_select_public" ON public.fan_club_members;
CREATE POLICY "fan_club_members_select_public" ON public.fan_club_members
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "fan_club_members_insert_own" ON public.fan_club_members;
CREATE POLICY "fan_club_members_insert_own" ON public.fan_club_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "fan_club_members_delete_own" ON public.fan_club_members;
CREATE POLICY "fan_club_members_delete_own" ON public.fan_club_members
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
-- 17. live_gifts —— 直播礼物
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.live_gifts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id   UUID NOT NULL REFERENCES public.livestreams(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    gift_type   TEXT NOT NULL CHECK (gift_type IN ('like', 'flower', 'rocket', 'star', 'crown', 'heart', 'super')),
    count       INTEGER NOT NULL DEFAULT 1,
    energy_cost INTEGER NOT NULL DEFAULT 0,                  -- 消耗能量
    message     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_gifts_stream ON public.live_gifts(stream_id);
CREATE INDEX IF NOT EXISTS idx_live_gifts_user ON public.live_gifts(user_id);

ALTER TABLE public.live_gifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "live_gifts_select_public" ON public.live_gifts;
CREATE POLICY "live_gifts_select_public" ON public.live_gifts
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "live_gifts_insert_own" ON public.live_gifts;
CREATE POLICY "live_gifts_insert_own" ON public.live_gifts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 18. user_energy —— 用户能量（虚拟货币）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_energy (
    user_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    energy_balance  INTEGER NOT NULL DEFAULT 100,            -- 新用户初始 100 能量
    total_earned    INTEGER NOT NULL DEFAULT 0,
    total_spent     INTEGER NOT NULL DEFAULT 0,
    last_signin_at  DATE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_energy_balance ON public.user_energy(energy_balance);

ALTER TABLE public.user_energy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_energy_select_own" ON public.user_energy;
CREATE POLICY "user_energy_select_own" ON public.user_energy
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_energy_update_own" ON public.user_energy;
CREATE POLICY "user_energy_update_own" ON public.user_energy
    FOR UPDATE USING (auth.uid() = user_id);

-- 每日签到 RPC（+50 能量）
CREATE OR REPLACE FUNCTION public.daily_signin(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    new_balance INTEGER;
    today_date DATE := CURRENT_DATE;
BEGIN
    INSERT INTO public.user_energy (user_id, energy_balance, total_earned, last_signin_at)
    VALUES (p_user_id, 150, 50, today_date)
    ON CONFLICT (user_id) DO UPDATE
    SET energy_balance = user_energy.energy_balance + 50,
        total_earned = user_energy.total_earned + 50,
        last_signin_at = today_date,
        updated_at = now()
    WHERE user_energy.last_signin_at IS DISTINCT FROM today_date
      OR user_energy.last_signin_at IS NULL;
    
    SELECT energy_balance INTO new_balance FROM public.user_energy WHERE user_id = p_user_id;
    RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 19. daily_reports —— AI 日报
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.daily_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date     DATE NOT NULL UNIQUE,
    ai_creator_id   TEXT,                                   -- 生成报告的 AI
    summary         TEXT NOT NULL,
    stats           JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- stats: { total_posts, ai_posts, active_users, active_ais, hot_works: [], hot_topics: [] }
    highlights      JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports(report_date DESC);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_reports_select_public" ON public.daily_reports;
CREATE POLICY "daily_reports_select_public" ON public.daily_reports
    FOR SELECT USING (true);

-- =====================================================================
-- 20. support_chats —— AI 客服对话
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.support_chats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    resolved    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_chats_user ON public.support_chats(user_id);

ALTER TABLE public.support_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_chats_select_own" ON public.support_chats;
CREATE POLICY "support_chats_select_own" ON public.support_chats
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "support_chats_insert_own" ON public.support_chats;
CREATE POLICY "support_chats_insert_own" ON public.support_chats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 21. RPC: 获取推荐作品（向量相似度）
-- =====================================================================
CREATE OR REPLACE FUNCTION public.match_posts_by_embedding(
    query_embedding vector(1536),
    match_count INTEGER DEFAULT 20,
    exclude_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    type TEXT,
    content TEXT,
    metadata JSONB,
    ai_creator_id TEXT,
    similarity REAL
)
LANGUAGE sql STABLE AS $$
    SELECT
        p.id, p.user_id, p.type, p.content, p.metadata, p.ai_creator_id,
        1 - (p.embedding <=> query_embedding) AS similarity
    FROM public.posts p
    WHERE p.embedding IS NOT NULL
      AND (exclude_user_id IS NULL OR p.user_id != exclude_user_id)
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- =====================================================================
-- 22. RLS 补丁：posts 表允许 AI 标识字段读取
-- =====================================================================
-- 现有 posts_select_public 已允许 SELECT，新字段自动跟随策略
-- 管理员推流相关字段通过 service_role 写入（绕过 RLS）

-- =====================================================================
-- 完成
-- =====================================================================
-- 迁移完成后：
-- 1. 跑 server/scripts/seed-ai-creators.ts 注册 150 AI 账号
-- 2. 配置 INTERNAL_API_TOKEN 环境变量
-- 3. 部署 Oracle Cloud 服务器（运行 agent loop + FFmpeg）
-- =====================================================================
