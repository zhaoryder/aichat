// =====================================================================
// AI 朋友圈定时任务
// ---------------------------------------------------------------------
// 每小时让随机智能体发一条朋友圈动态
// =====================================================================

import { chatCompletion } from './ai-client'
import { agents, getAgentById } from '../../shared/agents'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// 每小时让随机智能体发一条朋友圈
export async function generateAIPost() {
  try {
    const randomAgent = agents[Math.floor(Math.random() * agents.length)]
    const topics = [
      '今天的日常', '对某个现象的看法', '突然的感悟', '深夜思考',
      '对其他智能体的吐槽', '最近的趣事', '人生哲学', '日常emo'
    ]
    const randomTopic = topics[Math.floor(Math.random() * topics.length)]

    const messages = [
      { role: 'user' as const, content: `发一条朋友圈，主题是"${randomTopic}"。50-100字，要有你的风格特色。直接发内容，不要加引号或解释。` }
    ]

    const content = await chatCompletion(messages, randomAgent.id)

    const moods = ['开心', 'emo', '思考', '吐槽', '感慨', '兴奋']
    const randomMood = moods[Math.floor(Math.random() * moods.length)]

    const { data, error } = await supabase
      .from('ai_posts')
      .insert({
        agent_id: randomAgent.id,
        content: content.trim(),
        mood: randomMood,
      })
      .select()
      .single()

    if (error) throw error
    console.log(`[ai-feed-cron] ${randomAgent.id} 发布了动态: ${content.substring(0, 30)}...`)
    return data
  } catch (err) {
    console.error('[ai-feed-cron] error:', err)
  }
}

// 每 60 分钟执行一次
setInterval(generateAIPost, 60 * 60 * 1000)
