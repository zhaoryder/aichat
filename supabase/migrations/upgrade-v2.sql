-- =====================================================================
-- AI 智能体对话平台 - 2.0 数据库升级迁移
-- 文件：supabase/migrations/upgrade-v2.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可
-- 依赖：先执行 supabase/schema.sql 与 supabase/migrations/upgrade-extend.sql
-- =====================================================================

-- ---------- 0. 扩展（pgcrypto 用于 gen_random_uuid()，Supabase 默认已开启）----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =====================================================================
-- =====================================================================
--                            1. 新建数据表
-- =====================================================================
-- =====================================================================

-- =====================================================================
-- 1.1 image_gallery —— AI 绘画广场
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.image_gallery (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt      TEXT NOT NULL,
    url         TEXT NOT NULL,
    title       TEXT,
    likes       INTEGER DEFAULT 0,
    is_public   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_gallery_created_at
    ON public.image_gallery(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_image_gallery_likes
    ON public.image_gallery(likes DESC);


-- =====================================================================
-- 1.2 prompt_market —— 提示词市场
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.prompt_market (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT '通用',
    uses        INTEGER DEFAULT 0,
    likes       INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_market_category
    ON public.prompt_market(category);

CREATE INDEX IF NOT EXISTS idx_prompt_market_likes
    ON public.prompt_market(likes DESC);


-- =====================================================================
-- 1.3 achievements —— 成就定义
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.achievements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    icon        TEXT,
    category    TEXT DEFAULT 'general',
    threshold   INTEGER DEFAULT 1,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- =====================================================================
-- 1.4 user_achievements —— 用户成就
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_achievements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE,
    progress       INTEGER DEFAULT 0,
    unlocked       BOOLEAN DEFAULT false,
    unlocked_at    TIMESTAMPTZ,
    UNIQUE(user_id, achievement_id)
);


-- =====================================================================
-- 1.5 ai_posts —— AI 朋友圈
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ai_posts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    TEXT NOT NULL,
    content     TEXT NOT NULL,
    mood        TEXT,
    likes       INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_posts_created_at
    ON public.ai_posts(created_at DESC);


-- =====================================================================
-- 1.6 ai_post_comments —— AI 朋友圈评论
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ai_post_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID REFERENCES public.ai_posts(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    agent_id    TEXT,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_post_comments_post_id
    ON public.ai_post_comments(post_id);


-- =====================================================================
-- 1.7 emo_wall —— 深夜emo墙
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.emo_wall (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymous_name  TEXT NOT NULL,
    content         TEXT NOT NULL,
    ai_comment      TEXT,
    likes           INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emo_wall_created_at
    ON public.emo_wall(created_at DESC);


-- =====================================================================
-- 1.8 vibe_projects —— Vibe Coding 项目
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.vibe_projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    code        TEXT NOT NULL,
    prompt      TEXT,
    is_public   BOOLEAN DEFAULT false,
    likes       INTEGER DEFAULT 0,
    remix_of    UUID REFERENCES public.vibe_projects(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vibe_projects_user_id
    ON public.vibe_projects(user_id);

CREATE INDEX IF NOT EXISTS idx_vibe_projects_public
    ON public.vibe_projects(is_public, created_at DESC);


-- =====================================================================
-- 1.9 agent_unlocks —— 角色卡牌解锁
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.agent_unlocks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id     TEXT NOT NULL,
    unlock_count INTEGER DEFAULT 0,
    unlocked     BOOLEAN DEFAULT false,
    unlocked_at  TIMESTAMPTZ,
    UNIQUE(user_id, agent_id)
);


-- =====================================================================
-- =====================================================================
--                    2. 默认成就数据（seed）
-- =====================================================================
-- =====================================================================
INSERT INTO public.achievements (code, title, description, icon, category, threshold) VALUES
    ('first_chat',    '初次对话',    '完成第一次 AI 对话',         'message-circle',  'chat',    1),
    ('chat_10',       '话唠',        '完成 10 次对话',             'messages',        'chat',    10),
    ('chat_100',      '话痨大师',    '完成 100 次对话',            'message-square',   'chat',    100),
    ('first_work',    '初出茅庐',    '创作第一个作品',             'sparkles',         'studio',  1),
    ('work_10',       '创作达人',    '创作 10 个作品',             'palette',          'studio',  10),
    ('checkin_7',     '坚持一周',    '连续签到 7 天',              'calendar-check',   'checkin', 7),
    ('checkin_30',    '坚持一月',    '连续签到 30 天',             'calendar-days',    'checkin', 30),
    ('favorite_5',    '收藏家',      '收藏 5 个智能体',            'heart',            'social',  5),
    ('vibe_first',    'Vibe Coder',  '完成第一个 Vibe Coding 项目', 'code',             'vibe',    1),
    ('vibe_10',       'Vibe 大师',   '完成 10 个 Vibe Coding 项目', 'code-2',           'vibe',    10),
    ('agent_creator', '造物主',      '创建一个自定义智能体',        'user-plus',        'agent',   1),
    ('gallery_post',  '艺术家',      '发布第一张作品到广场',        'image',            'gallery', 1)
ON CONFLICT (code) DO NOTHING;


-- =====================================================================
-- =====================================================================
--                      3. Realtime 实时推送
-- =====================================================================
-- =====================================================================
-- 将以下表加入 supabase_realtime publication，并设置 REPLICA IDENTITY FULL
-- 以保证客户端能收到 INSERT / UPDATE / DELETE 事件
-- =====================================================================
ALTER TABLE public.image_gallery    REPLICA IDENTITY FULL;
ALTER TABLE public.ai_posts         REPLICA IDENTITY FULL;
ALTER TABLE public.ai_post_comments REPLICA IDENTITY FULL;
ALTER TABLE public.emo_wall         REPLICA IDENTITY FULL;
ALTER TABLE public.vibe_projects    REPLICA IDENTITY FULL;

-- 注意：ALTER PUBLICATION ... ADD TABLE 不支持 IF NOT EXISTS，
-- 若表已加入 publication 再次执行会报错，可用 DO 块容错
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'image_gallery'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.image_gallery;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'ai_posts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_posts;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'ai_post_comments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_post_comments;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'emo_wall'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.emo_wall;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'vibe_projects'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.vibe_projects;
    END IF;
END $$;


-- =====================================================================
-- =====================================================================
--                  4. Row Level Security (RLS)
-- =====================================================================
-- =====================================================================
-- 所有策略先 DROP IF EXISTS 再 CREATE，保证可重复执行且策略名不冲突
-- 复用 schema.sql 中已定义的 public.is_admin() 辅助函数
-- =====================================================================


-- ---------- image_gallery ----------
ALTER TABLE public.image_gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_gallery_select" ON public.image_gallery;
CREATE POLICY "image_gallery_select"
    ON public.image_gallery FOR SELECT
    USING (is_public = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "image_gallery_insert" ON public.image_gallery;
CREATE POLICY "image_gallery_insert"
    ON public.image_gallery FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_gallery_update" ON public.image_gallery;
CREATE POLICY "image_gallery_update"
    ON public.image_gallery FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_gallery_delete" ON public.image_gallery;
CREATE POLICY "image_gallery_delete"
    ON public.image_gallery FOR DELETE
    USING (user_id = auth.uid());


-- ---------- prompt_market ----------
ALTER TABLE public.prompt_market ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_market_select" ON public.prompt_market;
CREATE POLICY "prompt_market_select"
    ON public.prompt_market FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "prompt_market_insert" ON public.prompt_market;
CREATE POLICY "prompt_market_insert"
    ON public.prompt_market FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "prompt_market_update" ON public.prompt_market;
CREATE POLICY "prompt_market_update"
    ON public.prompt_market FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "prompt_market_delete" ON public.prompt_market;
CREATE POLICY "prompt_market_delete"
    ON public.prompt_market FOR DELETE
    USING (user_id = auth.uid());


-- ---------- achievements（所有人可读）----------
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "achievements_select" ON public.achievements;
CREATE POLICY "achievements_select"
    ON public.achievements FOR SELECT
    USING (true);


-- ---------- user_achievements ----------
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_achievements_select" ON public.user_achievements;
CREATE POLICY "user_achievements_select"
    ON public.user_achievements FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_achievements_insert" ON public.user_achievements;
CREATE POLICY "user_achievements_insert"
    ON public.user_achievements FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_achievements_update" ON public.user_achievements;
CREATE POLICY "user_achievements_update"
    ON public.user_achievements FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


-- ---------- ai_posts（所有人可读）----------
ALTER TABLE public.ai_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_posts_select" ON public.ai_posts;
CREATE POLICY "ai_posts_select"
    ON public.ai_posts FOR SELECT
    USING (true);


-- ---------- ai_post_comments ----------
ALTER TABLE public.ai_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_post_comments_select" ON public.ai_post_comments;
CREATE POLICY "ai_post_comments_select"
    ON public.ai_post_comments FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "ai_post_comments_insert" ON public.ai_post_comments;
CREATE POLICY "ai_post_comments_insert"
    ON public.ai_post_comments FOR INSERT
    WITH CHECK (user_id = auth.uid() OR agent_id IS NOT NULL);

DROP POLICY IF EXISTS "ai_post_comments_delete" ON public.ai_post_comments;
CREATE POLICY "ai_post_comments_delete"
    ON public.ai_post_comments FOR DELETE
    USING (user_id = auth.uid());


-- ---------- emo_wall（所有人可读，匿名发布）----------
ALTER TABLE public.emo_wall ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emo_wall_select" ON public.emo_wall;
CREATE POLICY "emo_wall_select"
    ON public.emo_wall FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "emo_wall_insert" ON public.emo_wall;
CREATE POLICY "emo_wall_insert"
    ON public.emo_wall FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "emo_wall_update" ON public.emo_wall;
CREATE POLICY "emo_wall_update"
    ON public.emo_wall FOR UPDATE
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "emo_wall_delete" ON public.emo_wall;
CREATE POLICY "emo_wall_delete"
    ON public.emo_wall FOR DELETE
    USING (true);


-- ---------- vibe_projects ----------
ALTER TABLE public.vibe_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vibe_projects_select" ON public.vibe_projects;
CREATE POLICY "vibe_projects_select"
    ON public.vibe_projects FOR SELECT
    USING (is_public = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "vibe_projects_insert" ON public.vibe_projects;
CREATE POLICY "vibe_projects_insert"
    ON public.vibe_projects FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "vibe_projects_update" ON public.vibe_projects;
CREATE POLICY "vibe_projects_update"
    ON public.vibe_projects FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "vibe_projects_delete" ON public.vibe_projects;
CREATE POLICY "vibe_projects_delete"
    ON public.vibe_projects FOR DELETE
    USING (user_id = auth.uid());


-- ---------- agent_unlocks ----------
ALTER TABLE public.agent_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_unlocks_select" ON public.agent_unlocks;
CREATE POLICY "agent_unlocks_select"
    ON public.agent_unlocks FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "agent_unlocks_insert" ON public.agent_unlocks;
CREATE POLICY "agent_unlocks_insert"
    ON public.agent_unlocks FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "agent_unlocks_update" ON public.agent_unlocks;
CREATE POLICY "agent_unlocks_update"
    ON public.agent_unlocks FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


-- =====================================================================
-- =====================================================================
--                          5. 表注释
-- =====================================================================
-- =====================================================================
COMMENT ON TABLE public.image_gallery     IS 'AI 绘画广场 - 用户生成的 AI 图片';
COMMENT ON TABLE public.prompt_market     IS '提示词市场 - 用户分享的优质 prompt';
COMMENT ON TABLE public.achievements     IS '成就定义';
COMMENT ON TABLE public.user_achievements IS '用户成就进度';
COMMENT ON TABLE public.ai_posts          IS 'AI 朋友圈 - 智能体自发动态';
COMMENT ON TABLE public.ai_post_comments  IS 'AI 朋友圈评论';
COMMENT ON TABLE public.emo_wall          IS '深夜emo墙 - 匿名发布';
COMMENT ON TABLE public.vibe_projects     IS 'Vibe Coding 项目';
COMMENT ON TABLE public.agent_unlocks    IS '角色卡牌解锁记录';


-- =====================================================================
-- =====================================================================
--                       执行说明
-- =====================================================================
-- =====================================================================
-- 1. 依赖前置：本文件依赖 supabase/schema.sql 与 upgrade-extend.sql 已执行
--    （需 auth.users、public.profiles、public.is_admin()、public.set_updated_at()）
-- 2. 执行方式：在 Supabase Dashboard → SQL Editor 中整段粘贴执行
-- 3. 幂等性：
--    - 所有 CREATE TABLE / CREATE INDEX 使用 IF NOT EXISTS
--    - 所有 CREATE POLICY 前置 DROP POLICY IF EXISTS
--    - INSERT 默认成就使用 ON CONFLICT (code) DO NOTHING
--    - ALTER PUBLICATION 使用 DO 块包裹，避免重复添加报错
-- 4. Realtime 验证：
--    执行后到 Dashboard → Database → Replication 确认 publication supabase_realtime
--    已包含：image_gallery / ai_posts / ai_post_comments / emo_wall / vibe_projects
-- 5. RLS 验证：
--    执行后到 Dashboard → Authentication → Policies 检查各表策略是否符合预期
-- =====================================================================
