// =====================================================================
// Express 认证中间件
// ---------------------------------------------------------------------
// 从 Authorization header 提取 Bearer token，用 Supabase 验证 JWT，
// 成功则注入 req.user（含 id / email / role / nickname / points）。
// 失败返回 401；账号已封禁返回 403。
// =====================================================================

import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

/** 扩展 Express Request，注入已认证用户信息 */
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string
      email: string
      role: 'user' | 'admin'
      nickname?: string
      points: number
    }
  }
}

/**
 * 验证 Supabase JWT 的 Express 中间件。
 *
 * 流程：
 *   1. 从 Authorization header 提取 Bearer token
 *   2. 用 anon key 创建临时客户端，调用 auth.getUser(jwt) 验证
 *   3. 用 service_role 客户端查 profiles 表获取 role / nickname / banned_until / points
 *   4. 若 banned_until > now，返回 403
 *   5. 成功则注入 req.user 并 next()
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' })
    return
  }

  const token = authHeader.slice(7)

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    res.status(500).json({ error: '服务端未配置 Supabase 环境变量' })
    return
  }

  // 用 anon key 创建临时客户端验证 token
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) {
    res.status(401).json({ error: 'token 无效' })
    return
  }

  // 用 service_role 客户端查 profiles 表获取角色等信息
  const adminClient = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, nickname, banned_until, points, avatar_url')
    .eq('id', data.user.id)
    .maybeSingle()

  // 判断是否处于封禁期（banned_until > now）
  const bannedUntil = profile?.banned_until as string | null | undefined
  if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) {
    res.status(403).json({ error: '账号已封禁' })
    return
  }

  req.user = {
    id: data.user.id,
    email: data.user.email!,
    role: (profile?.role as 'user' | 'admin') || 'user',
    nickname: (profile?.nickname as string | undefined) ?? undefined,
    points: (profile?.points as number | null | undefined) ?? 0,
  }
  next()
}
