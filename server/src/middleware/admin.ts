// =====================================================================
// Express 管理员中间件
// ---------------------------------------------------------------------
// 检查 req.user.role === 'admin'，否则返回 403。
// 必须在 authMiddleware 之后使用。
// =====================================================================

import { Request, Response, NextFunction } from 'express'

/** 管理员权限校验中间件（需在 authMiddleware 之后挂载） */
export function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: '未登录' })
    return
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' })
    return
  }
  next()
}
