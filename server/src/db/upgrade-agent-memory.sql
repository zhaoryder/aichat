-- =====================================================================
-- Agent 超级大升级 - Batch E1：Agent Memory 长期记忆
-- 文件：server/src/db/upgrade-agent-memory.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可。
-- 依赖：先执行 supabase/schema.sql + upgrade-skills.sql（auth.users 已存在）
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. agent_memory —— 用户长期记忆（key-value 形式）
-- =====================================================================
-- 用于 agent 跨会话记住用户偏好、技术栈、历史决策。
-- 同一 user 下 key 唯一（upsert 用 idx_agent_memory_user_key_unique 索引）。
CREATE TABLE IF NOT EXISTS public.agent_memory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    -- 来源：'agent'（AI 自动保存）/ 'user'（用户手动添加）/ 'system'（系统默认）
    source      TEXT NOT NULL DEFAULT 'agent'
                  CHECK (source IN ('agent', 'user', 'system')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 启用 RLS：仅本人可读写
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- 所有操作：仅 owner 可 CRUD
DROP POLICY IF EXISTS "owner can crud" ON public.agent_memory;
CREATE POLICY "owner can crud" ON public.agent_memory
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 2. 索引
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_agent_memory_user_id
    ON public.agent_memory(user_id);

CREATE INDEX IF NOT EXISTS idx_agent_memory_user_key
    ON public.agent_memory(user_id, key);

-- 同一 user 下 key 唯一：用于 upsert（ON CONFLICT (user_id, key) DO UPDATE）
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memory_user_key_unique
    ON public.agent_memory(user_id, key);

-- =====================================================================
-- 完成
-- =====================================================================
-- 表清单：
--   1. agent_memory  ✅ 用户长期记忆（key-value，含 source）
-- + RLS：仅 owner 可 CRUD
-- + 索引：user_id / (user_id, key) / (user_id, key) 唯一
-- 重复执行幂等（CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS）
