// Express 服务入口
import express from 'express'
import cors from 'cors'

import { chatRouter } from './routes/chat'
import { forumRouter } from './routes/forum'
import { agentsRouter } from './routes/agents'
import { studioRouter } from './routes/studio'
import { vibeCodeRouter } from './routes/vibe-code'
import { usersRouter } from './routes/users'
import { favoriteRouter } from './routes/favorite'
import { shareRouter } from './routes/share'
import { adminRouter } from './routes/admin'
import { galleryRouter } from './routes/gallery'
import { promptsRouter } from './routes/prompts'
import { achievementsRouter } from './routes/achievements'
import { leaderboardRouter } from './routes/leaderboard'
import { aiFeedRouter } from './routes/ai-feed'
import { emoWallRouter } from './routes/emo-wall'
import { mediaRouter } from './routes/media'
import { pipelineRouter } from './routes/pipeline'
import { teamsRouter } from './routes/teams'
import { roomsRouter } from './routes/rooms'
import { themesRouter } from './routes/themes'
import { snapshotsRouter } from './routes/snapshots'
import { feedRouter } from './routes/feed'
import { followRouter } from './routes/follow'
import { notificationsRouter } from './routes/notifications'
import { internalRouter } from './routes/internal'
import { liveRouter } from './routes/live'
import { dailyRouter } from './routes/daily'
import { skillsRouter } from './routes/skills'
import { plansRouter } from './routes/plans'
import { teamRouter } from './routes/team'
import { sandboxRouter } from './routes/sandbox'
import { memoryRouter } from './routes/memory'
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
app.use('/api/favorite', favoriteRouter)
app.use('/api/share', shareRouter)
app.use('/api/admin', adminRouter)
app.use('/api/gallery', galleryRouter)
app.use('/api/prompts', promptsRouter)
app.use('/api/achievements', achievementsRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/ai-posts', aiFeedRouter)
app.use('/api/emo-wall', emoWallRouter)
app.use('/api/media', mediaRouter)
app.use('/api/pipeline', pipelineRouter)
app.use('/api/teams', teamsRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/themes', themesRouter)
app.use('/api/snapshots', snapshotsRouter)
app.use('/api/feed', feedRouter)
app.use('/api/posts', feedRouter)
app.use('/api/follow', followRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/internal', internalRouter)
app.use('/api/live', liveRouter)
app.use('/api/daily', dailyRouter)
// Skill 市场（含 /skills, /users/me/skills, /admin/skills/:id/publish）
app.use('/api', skillsRouter)
// Plan Mode（含 /vibe-code/plan, /plans/:id, /plans/:id/execute 等）
app.use('/api', plansRouter)
// AI Teamwork 多角色协作（含 /team/start, /team/:id/message 等）
app.use('/api', teamRouter)
// Sandbox 快照分享（含 /sandbox/snapshot, /sandbox/:slug, /sandbox/me, /sandbox/:id）
app.use('/api/sandbox', sandboxRouter)
// Agent Memory 长期记忆（Batch E1.4，含 /memory, /memory/:id）
app.use('/api/memory', memoryRouter)

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
