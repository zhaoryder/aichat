// Express 服务入口
import express from 'express'
import cors from 'cors'

import { chatRouter } from './routes/chat'
import { forumRouter } from './routes/forum'
import { agentsRouter } from './routes/agents'
import { studioRouter } from './routes/studio'
import { vibeCodeRouter } from './routes/vibe-code'
import { usersRouter } from './routes/users'
import { checkinRouter } from './routes/checkin'
import { favoriteRouter } from './routes/favorite'
import { shareRouter } from './routes/share'
import { adminRouter } from './routes/admin'
import { galleryRouter } from './routes/gallery'
import { promptsRouter } from './routes/prompts'
import { achievementsRouter } from './routes/achievements'
import { leaderboardRouter } from './routes/leaderboard'
import { aiFeedRouter } from './routes/ai-feed'
import { emoWallRouter } from './routes/emo-wall'
import './lib/ai-feed-cron'

const app = express()
const PORT = process.env.PORT || 3001

// 中间件
app.use(cors())
app.use(express.json())

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 业务路由
app.use('/api/chat', chatRouter)
app.use('/api/forum', forumRouter)
app.use('/api/agents', agentsRouter)
app.use('/api/studio', studioRouter)
app.use('/api/vibe-code', vibeCodeRouter)
app.use('/api/users', usersRouter)
app.use('/api/checkin', checkinRouter)
app.use('/api/favorite', favoriteRouter)
app.use('/api/share', shareRouter)
app.use('/api/admin', adminRouter)
app.use('/api/gallery', galleryRouter)
app.use('/api/prompts', promptsRouter)
app.use('/api/achievements', achievementsRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/ai-posts', aiFeedRouter)
app.use('/api/emo-wall', emoWallRouter)

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
