-- =====================================================================
-- Agent 超级大升级 - Batch D：WebContainer 沙箱快照分享
-- 文件：server/src/db/upgrade-sandbox.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可。
-- 依赖：先执行 supabase/schema.sql + upgrade-v2.sql + upgrade-extend.sql
--       + upgrade-v3.sql + upgrade-skills.sql（auth.users / profiles 已存在）
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. sandbox_snapshots —— WebContainer 沙箱快照分享表
-- =====================================================================
-- 用途：用户在 Vibe Coding 中将当前 WebContainer 文件树打包成快照
-- 并生成 share_slug，其他用户可通过 /share/sandbox/:slug 只读访问
CREATE TABLE IF NOT EXISTS public.sandbox_snapshots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 所有者（创建者）user id，关联 auth.users
    owner_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    -- 标题（展示用，可空）
    title         TEXT,
    -- 描述（可空，介绍这个沙箱项目是什么）
    description   TEXT,
    -- 文件树 JSON：[{ path: string, content: string, type: 'file' | 'directory' }]
    files         JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- 预览 HTML（用于分享页直接渲染 iframe srcDoc，无需启动 dev server）
    preview_html  TEXT,
    -- 分享 slug（NULL=私有；非 NULL=公开可读）
    share_slug    TEXT UNIQUE,
    -- 浏览次数（公开分享后被访问时累加）
    view_count    INT NOT NULL DEFAULT 0,
    -- 创建者昵称快照（用于在分享页展示，避免每次都 JOIN profiles）
    author_name   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：share_slug 已通过 UNIQUE 自动建索引；owner_id 加普通索引
CREATE INDEX IF NOT EXISTS idx_sandbox_snapshots_owner_id
    ON public.sandbox_snapshots(owner_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_snapshots_share_slug
    ON public.sandbox_snapshots(share_slug) WHERE share_slug IS NOT NULL;

-- =====================================================================
-- 2. RLS（Row Level Security）策略
-- =====================================================================
ALTER TABLE public.sandbox_snapshots ENABLE ROW LEVEL SECURITY;

-- 2.1 所有者可读写自己的快照（含私有未分享的）
DROP POLICY IF EXISTS "所有者可读写自己的 sandbox 快照" ON public.sandbox_snapshots;
CREATE POLICY "所有者可读写自己的 sandbox 快照" ON public.sandbox_snapshots
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- 2.2 匿名访客可读已分享的快照（share_slug 非空）
DROP POLICY IF EXISTS "匿名访客可读已分享的 sandbox 快照" ON public.sandbox_snapshots;
CREATE POLICY "匿名访客可读已分享的 sandbox 快照" ON public.sandbox_snapshots
    FOR SELECT TO anon
    USING (share_slug IS NOT NULL);

-- 2.3 登录用户可读已分享的快照
DROP POLICY IF EXISTS "登录用户可读已分享的 sandbox 快照" ON public.sandbox_snapshots;
CREATE POLICY "登录用户可读已分享的 sandbox 快照" ON public.sandbox_snapshots
    FOR SELECT TO authenticated
    USING (share_slug IS NOT NULL);

-- =====================================================================
-- 3. updated_at 自动维护触发器
-- =====================================================================
DROP TRIGGER IF EXISTS trg_sandbox_snapshots_updated_at ON public.sandbox_snapshots;
CREATE OR REPLACE FUNCTION public.set_sandbox_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sandbox_snapshots_updated_at
    BEFORE UPDATE ON public.sandbox_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION public.set_sandbox_snapshots_updated_at();

-- =====================================================================
-- 4. 浏览次数累加函数（RPC）
-- =====================================================================
-- 公开分享页访问时调用：rpc.increment_sandbox_view_count(share_slug => 'xxx')
-- 原子地增加 view_count 并返回更新后的快照行
CREATE OR REPLACE FUNCTION public.increment_sandbox_view_count(p_share_slug TEXT)
RETURNS public.sandbox_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    row public.sandbox_snapshots;
BEGIN
    UPDATE public.sandbox_snapshots
       SET view_count = view_count + 1
     WHERE share_slug = p_share_slug
     RETURNING * INTO row;
    RETURN row;
END;
$$;

-- 给 anon + authenticated 角色执行该 RPC 的权限
GRANT EXECUTE ON FUNCTION public.increment_sandbox_view_count(TEXT) TO anon, authenticated;

-- =====================================================================
-- 完成
-- =====================================================================
-- 表清单：
--   1. sandbox_snapshots ✅ 沙箱快照（含文件树 JSON / 预览 HTML / share_slug）
-- + RLS：所有者可读写；公开分享 slug 非空时 anon + authenticated 可读
-- + 索引：owner_id / share_slug（部分索引）
-- + 触发器：updated_at 自动维护
-- + RPC：increment_sandbox_view_count(share_slug) 公开浏览次数累加
