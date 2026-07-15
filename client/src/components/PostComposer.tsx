import { useState, useCallback } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { createPost } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

/** 发布动态框组件 */
export function PostComposer() {
  const { user, profile } = useAuth()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  const handlePost = useCallback(async () => {
    if (!text.trim() || !user) return
    setLoading(true)
    try {
      await createPost({ type: 'text', content: text.trim() })
      setText('')
      toast.success('发布成功！')
      // 刷新页面以看到新动态
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发布失败')
    } finally {
      setLoading(false)
    }
  }, [text, user])

  if (!user) return null

  return (
    <div className="flex gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-gradient-to-br from-primary to-amber-500 text-white">
          {profile?.nickname?.[0]?.toUpperCase() ?? 'U'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="分享你的想法、AI 创作、或代码灵感..."
          rows={2}
          className="w-full resize-none border-0 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handlePost()
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {text.length > 0 && `${text.length} 字`}
          </span>
          <div className="flex items-center gap-2">
            {text.length > 280 && (
              <span className="text-xs text-red-500">{text.length}/280</span>
            )}
            <Button
              size="sm"
              onClick={handlePost}
              disabled={loading || !text.trim() || text.length > 280}
              className="rounded-full"
            >
              {loading ? '发布中...' : '发布'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
