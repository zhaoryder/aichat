// =====================================================================
// Agent Memory API（Batch E1.4）
// ---------------------------------------------------------------------
// GET    /api/memory         列出当前用户的全部记忆（最多 200 条）
// POST   /api/memory         新增一条记忆（key + value，source 默认 'user'）
// PUT    /api/memory/:id     修改记忆的 value（可选 key）
// DELETE /api/memory/:id     删除一条记忆
//
// 表：agent_memory（见 server/src/db/upgrade-agent-memory.sql）
// RLS：仅 owner 可 CRUD（auth.uid() = user_id）
// =====================================================================

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import type { AgentMemory } from '../../shared/types'

export const memoryRouter = Router()

// ---------------------------------------------------------------------
// GET /api/memory —— 列出当前用户的全部记忆
// ---------------------------------------------------------------------
// 返回 { memories: AgentMemory[] }
// 按 created_at 降序，最多 200 条
// ---------------------------------------------------------------------

memoryRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const { data, error } = await supabase
      .from('agent_memory')
      .select('id, user_id, key, value, source, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    res.json({ memories: (data ?? []) as AgentMemory[] })
  } catch (err) {
    console.error('[GET /api/memory] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '加载记忆失败',
    })
  }
})

// ---------------------------------------------------------------------
// POST /api/memory —— 新增一条记忆
// ---------------------------------------------------------------------
// 请求体：{ key: string, value: string, source?: 'user' | 'system' }
// 同一 (user_id, key) 已存在时 upsert（更新 value）
// 返回 { memory: AgentMemory }
// ---------------------------------------------------------------------

interface CreateMemoryBody {
  key?: unknown
  value?: unknown
  source?: unknown
}

memoryRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!

  try {
    const body = req.body as CreateMemoryBody
    const key = typeof body.key === 'string' ? body.key.trim() : ''
    const value = typeof body.value === 'string' ? body.value.trim() : ''
    const source =
      body.source === 'system' ? 'system' : 'user'

    if (!key) {
      res.status(400).json({ error: 'key 不能为空' })
      return
    }
    if (key.length > 100) {
      res.status(400).json({ error: 'key 最长 100 字符' })
      return
    }
    if (!value) {
      res.status(400).json({ error: 'value 不能为空' })
      return
    }
    if (value.length > 5000) {
      res.status(400).json({ error: 'value 最长 5000 字符' })
      return
    }

    const { data, error } = await supabase
      .from('agent_memory')
      .upsert(
        { user_id: user.id, key, value, source },
        { onConflict: 'user_id,key' }
      )
      .select('id, user_id, key, value, source, created_at')
      .single()

    if (error) throw error

    res.json({ memory: data as AgentMemory })
  } catch (err) {
    console.error('[POST /api/memory] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '保存记忆失败',
    })
  }
})

// ---------------------------------------------------------------------
// PUT /api/memory/:id —— 修改记忆
// ---------------------------------------------------------------------
// 请求体：{ value?: string, key?: string }
// 仅更新提供的字段
// 返回 { memory: AgentMemory }
// ---------------------------------------------------------------------

interface UpdateMemoryBody {
  value?: unknown
  key?: unknown
}

memoryRouter.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  const id = req.params.id

  try {
    const body = req.body as UpdateMemoryBody
    const updates: { value?: string; key?: string } = {}

    if (typeof body.value === 'string') {
      const v = body.value.trim()
      if (!v) {
        res.status(400).json({ error: 'value 不能为空' })
        return
      }
      if (v.length > 5000) {
        res.status(400).json({ error: 'value 最长 5000 字符' })
        return
      }
      updates.value = v
    }
    if (typeof body.key === 'string') {
      const k = body.key.trim()
      if (!k) {
        res.status(400).json({ error: 'key 不能为空' })
        return
      }
      if (k.length > 100) {
        res.status(400).json({ error: 'key 最长 100 字符' })
        return
      }
      updates.key = k
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: '未提供要更新的字段' })
      return
    }

    // RLS 会自动限制仅本人可更新
    const { data, error } = await supabase
      .from('agent_memory')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, user_id, key, value, source, created_at')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: '记忆不存在或无权修改' })
        return
      }
      throw error
    }

    res.json({ memory: data as AgentMemory })
  } catch (err) {
    console.error('[PUT /api/memory/:id] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '更新记忆失败',
    })
  }
})

// ---------------------------------------------------------------------
// DELETE /api/memory/:id —— 删除一条记忆
// ---------------------------------------------------------------------

memoryRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!
  const id = req.params.id

  try {
    const { error, count } = await supabase
      .from('agent_memory')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error

    if (count === 0) {
      res.status(404).json({ error: '记忆不存在或无权删除' })
      return
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/memory/:id] error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '删除记忆失败',
    })
  }
})
