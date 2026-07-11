// =====================================================================
// 服务端 Supabase 客户端
// ---------------------------------------------------------------------
// 用 service_role key 创建客户端，绕过 RLS，用于所有服务端数据库操作。
// 兼容旧的 NEXT_PUBLIC_ 前缀和无前缀的环境变量名。
// =====================================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    '[supabase] 警告：未配置 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量，数据库操作将失败。'
  )
}

/** 服务端 Supabase 客户端（service_role，绕过 RLS） */
export const supabase = createClient(
  supabaseUrl ?? '',
  serviceRoleKey ?? '',
  { auth: { persistSession: false } }
)
