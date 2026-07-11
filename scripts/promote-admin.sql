-- =====================================================================
-- 管理员授权脚本
-- 文件：scripts/promote-admin.sql
-- 说明：将指定邮箱用户提升为管理员（role = 'admin'）
-- 使用：在 Supabase Dashboard → SQL Editor 中执行
-- =====================================================================

-- 通过子查询按邮箱查找 auth.users 表中的用户 id，
-- 然后将其在 profiles 表中的 role 更新为 'admin'。
UPDATE public.profiles
SET role       = 'admin',
    updated_at = now()
WHERE id = (
    SELECT id
    FROM auth.users
    WHERE email = 'zhaoryder@icloud.com'
);
