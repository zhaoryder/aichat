-- =====================================================================
-- AI 智能体对话平台 - 数据库 Schema
-- 文件：supabase/schema.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可
-- 依赖：Supabase 默认已启用 pgcrypto（提供 gen_random_uuid()）
-- =====================================================================

-- ---------- 0. 扩展（pgcrypto 用于 gen_random_uuid()，Supabase 默认已开启）----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. profiles —— 用户资料（扩展 Supabase auth.users）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname     TEXT NOT NULL,
    avatar_url   TEXT,
    role         TEXT NOT NULL DEFAULT 'user'
                 CHECK (role IN ('user','admin')),
    banned_until TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 自动维护 updated_at 的触发器函数
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 2. agents —— AI 智能体（预设数据，由 seed.sql 插入）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.agents (
    id              TEXT PRIMARY KEY,            -- 如 'confucius','newton'
    name            TEXT NOT NULL,
    era             TEXT,                        -- 时代/领域，如 '春秋时期'
    title           TEXT,                        -- 称号
    tagline         TEXT,                        -- 一句话标语
    avatar_gradient TEXT,                        -- CSS 渐变字符串
    system_prompt   TEXT NOT NULL,
    topics          TEXT[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 3. conversations —— 1v1 对话
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    agent_id   TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    title      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS conversations_set_updated_at ON public.conversations;
CREATE TRIGGER conversations_set_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
    ON public.conversations(user_id);

-- =====================================================================
-- 4. messages —— 对话消息
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL
                    REFERENCES public.conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON public.messages(conversation_id);

-- =====================================================================
-- 5. forum_topics —— 论坛话题
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.forum_topics (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id        UUID NOT NULL
                     REFERENCES public.profiles(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    content          TEXT NOT NULL,
    mentioned_agents TEXT[] NOT NULL DEFAULT '{}',
    views            INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_topics_author_id
    ON public.forum_topics(author_id);

-- =====================================================================
-- 6. forum_posts —— 论坛回帖
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.forum_posts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id    UUID NOT NULL
                REFERENCES public.forum_topics(id) ON DELETE CASCADE,
    author_id   UUID  -- 可空：当 author_type='agent' 时为 NULL（AI 无 profile）
                REFERENCES public.profiles(id) ON DELETE CASCADE,
    author_type TEXT NOT NULL CHECK (author_type IN ('user','agent')),
    agent_id    TEXT REFERENCES public.agents(id) ON DELETE SET NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_topic_id
    ON public.forum_posts(topic_id);

-- =====================================================================
-- 7. reports —— 举报记录
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL
                REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('message','topic','post','user')),
    target_id   UUID NOT NULL,
    reason      TEXT,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','resolved','ignored')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 8. moderation_keywords —— 审核关键词
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.moderation_keywords (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword    TEXT NOT NULL,
    pattern    TEXT,                              -- 正则表达式，可选
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 9. trending_memes —— 每日热梗
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.trending_memes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content    TEXT NOT NULL,
    source     TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active  BOOLEAN NOT NULL DEFAULT true,
    used_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_trending_memes_fetched_at
    ON public.trending_memes(fetched_at);

CREATE INDEX IF NOT EXISTS idx_trending_memes_is_active
    ON public.trending_memes(is_active);


-- =====================================================================
-- =====================================================================
--                         Row Level Security (RLS)
-- =====================================================================
-- =====================================================================
-- 辅助函数：判断当前用户是否为管理员
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ---------- profiles ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
-- 用户可更新自己的资料（nickname、avatar_url），但不能改 role 与 banned_until
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admin can manage all profiles" ON public.profiles;
CREATE POLICY "Admin can manage all profiles"
    ON public.profiles FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);


-- ---------- agents ----------
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read agents" ON public.agents;
CREATE POLICY "Anyone can read agents"
    ON public.agents FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admin can manage agents" ON public.agents;
CREATE POLICY "Admin can manage agents"
    ON public.agents FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ---------- conversations ----------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
CREATE POLICY "Users can view own conversations"
    ON public.conversations FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert own conversations" ON public.conversations;
CREATE POLICY "Users can insert own conversations"
    ON public.conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
CREATE POLICY "Users can update own conversations"
    ON public.conversations FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own conversations" ON public.conversations;
CREATE POLICY "Users can delete own conversations"
    ON public.conversations FOR DELETE
    USING (auth.uid() = user_id);


-- ---------- messages ----------
-- 通过 conversation 的 user_id 验证所有权
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages in own conversations" ON public.messages;
CREATE POLICY "Users can view messages in own conversations"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND (c.user_id = auth.uid() OR public.is_admin())
        )
    );

DROP POLICY IF EXISTS "Users can insert messages in own conversations" ON public.messages;
CREATE POLICY "Users can insert messages in own conversations"
    ON public.messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete messages in own conversations" ON public.messages;
CREATE POLICY "Users can delete messages in own conversations"
    ON public.messages FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admin can manage all messages" ON public.messages;
CREATE POLICY "Admin can manage all messages"
    ON public.messages FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ---------- forum_topics ----------
ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read forum topics" ON public.forum_topics;
CREATE POLICY "Anyone can read forum topics"
    ON public.forum_topics FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Logged-in users can insert own topics" ON public.forum_topics;
CREATE POLICY "Logged-in users can insert own topics"
    ON public.forum_topics FOR INSERT
    WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can update own topics" ON public.forum_topics;
CREATE POLICY "Authors can update own topics"
    ON public.forum_topics FOR UPDATE
    USING (auth.uid() = author_id OR public.is_admin())
    WITH CHECK (auth.uid() = author_id OR public.is_admin());

DROP POLICY IF EXISTS "Authors can delete own topics" ON public.forum_topics;
CREATE POLICY "Authors can delete own topics"
    ON public.forum_topics FOR DELETE
    USING (auth.uid() = author_id OR public.is_admin());


-- ---------- forum_posts ----------
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read forum posts" ON public.forum_posts;
CREATE POLICY "Anyone can read forum posts"
    ON public.forum_posts FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Logged-in users can insert own posts" ON public.forum_posts;
CREATE POLICY "Logged-in users can insert own posts"
    ON public.forum_posts FOR INSERT
    WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can update own posts" ON public.forum_posts;
CREATE POLICY "Authors can update own posts"
    ON public.forum_posts FOR UPDATE
    USING (auth.uid() = author_id OR public.is_admin())
    WITH CHECK (auth.uid() = author_id OR public.is_admin());

DROP POLICY IF EXISTS "Authors can delete own posts" ON public.forum_posts;
CREATE POLICY "Authors can delete own posts"
    ON public.forum_posts FOR DELETE
    USING (auth.uid() = author_id OR public.is_admin());


-- ---------- reports ----------
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
CREATE POLICY "Users can insert own reports"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admin can view all reports" ON public.reports;
CREATE POLICY "Admin can view all reports"
    ON public.reports FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
CREATE POLICY "Users can view own reports"
    ON public.reports FOR SELECT
    USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admin can update reports" ON public.reports;
CREATE POLICY "Admin can update reports"
    ON public.reports FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can delete reports" ON public.reports;
CREATE POLICY "Admin can delete reports"
    ON public.reports FOR DELETE
    USING (public.is_admin());


-- ---------- moderation_keywords ----------
ALTER TABLE public.moderation_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can read moderation keywords" ON public.moderation_keywords;
CREATE POLICY "Admin can read moderation keywords"
    ON public.moderation_keywords FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can insert moderation keywords" ON public.moderation_keywords;
CREATE POLICY "Admin can insert moderation keywords"
    ON public.moderation_keywords FOR INSERT
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can update moderation keywords" ON public.moderation_keywords;
CREATE POLICY "Admin can update moderation keywords"
    ON public.moderation_keywords FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can delete moderation keywords" ON public.moderation_keywords;
CREATE POLICY "Admin can delete moderation keywords"
    ON public.moderation_keywords FOR DELETE
    USING (public.is_admin());


-- ---------- trending_memes ----------
-- 注意：写入由服务端用 service_role key 调用 Supabase 客户端完成，
--       service_role 会自动绕过 RLS，因此此处仅为保护前端 anon 访问。
ALTER TABLE public.trending_memes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read trending memes" ON public.trending_memes;
CREATE POLICY "Anyone can read trending memes"
    ON public.trending_memes FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admin can manage trending memes" ON public.trending_memes;
CREATE POLICY "Admin can manage trending memes"
    ON public.trending_memes FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- =====================================================================
-- =====================================================================
--                         每日热梗采集系统
-- =====================================================================
-- =====================================================================
-- 原子递增 used_count 的 RPC 函数（Task 17）
-- 使用 SECURITY DEFINER 让任意调用者（含 anon）都能安全递增计数，
-- 内部 UPDATE 以函数所有者身份执行，绕过 RLS。
-- 服务端既可通过 service_role 直接 UPDATE，也可通过本 RPC 调用。
-- =====================================================================
CREATE OR REPLACE FUNCTION public.increment_meme_used_count(meme_id UUID)
RETURNS void AS $$
  UPDATE public.trending_memes SET used_count = used_count + 1 WHERE id = meme_id;
$$ LANGUAGE sql SECURITY DEFINER;
