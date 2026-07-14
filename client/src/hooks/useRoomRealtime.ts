// =====================================================================
// 房间实时消息 Hook（Supabase Realtime）
// ---------------------------------------------------------------------
// - 拉取历史消息（通过 API，绕过 RLS）
// - 订阅 room_messages 表 INSERT 事件，实时接收新消息
// - 处理流式占位帖替换：AI 消息（__stream_ 前缀）和本地乐观帖（__local_ 前缀）
// =====================================================================

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import type { RoomMessage } from '@shared/types'

export function useRoomRealtime(roomId: string | undefined) {
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomId) {
      setLoading(false)
      return
    }
    setLoading(true)

    // 拉取历史消息（通过 API，不用 supabase 直查以绕过 RLS）
    apiFetch<{ messages: RoomMessage[] }>(`/rooms/${roomId}`)
      .then((res) => setMessages(res.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false))

    // 订阅实时消息
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMsg = payload.new as RoomMessage
          setMessages((prev) => {
            // 避免重复（按 id 去重）
            if (prev.some((m) => m.id === newMsg.id)) return prev

            // AI 消息：替换流式占位帖（id 以 __stream_ 开头）
            if (newMsg.role === 'assistant') {
              const streamIdx = prev.findIndex((m) =>
                m.id.startsWith('__stream_'),
              )
              if (streamIdx >= 0) {
                const next = [...prev]
                next[streamIdx] = newMsg
                return next
              }
            }

            // 用户消息：替换本地乐观帖（id 以 __local_ 开头，匹配 user_id + content）
            if (newMsg.role === 'user' && newMsg.user_id) {
              const localIdx = prev.findIndex(
                (m) =>
                  m.id.startsWith('__local_') &&
                  m.user_id === newMsg.user_id &&
                  m.content === newMsg.content,
              )
              if (localIdx >= 0) {
                const next = [...prev]
                next[localIdx] = newMsg
                return next
              }
            }

            return [...prev, newMsg]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return { messages, loading, setMessages }
}
