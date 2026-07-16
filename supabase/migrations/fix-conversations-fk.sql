-- =====================================================================
-- 修复：删除 conversations 表的 agent_id 外键约束
-- 原因：所有 agent 配置硬编码在 shared/agents.ts 中（321 个），
--       数据库中没有对应的 agents 表记录，外键约束导致无法创建对话。
-- 执行位置：Supabase Dashboard → SQL Editor → New query
-- =====================================================================

-- 先查看外键约束引用了哪个表（仅查询，不修改）
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'conversations'
    AND kcu.column_name = 'agent_id';

-- 删除外键约束（agent 配置硬编码在代码中，不需要数据库表约束）
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_agent_id_fkey;

-- 验证：应该返回 0 行
SELECT count(*) AS remaining_fk_count
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY'
    AND table_name = 'conversations'
    AND constraint_name LIKE '%agent_id%';
