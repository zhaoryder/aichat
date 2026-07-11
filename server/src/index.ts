// Express 服务入口
import express from 'express'
import cors from 'cors'

import { chatRouter } from './routes/chat'
import { forumRouter } from './routes/forum'
import { agentsRouter } from './routes/agents'
import { studioRouter } from './routes/studio'
import { usersRouter } from './routes/users'
import { checkinRouter } from './routes/checkin'
import { favoriteRouter } from './routes/favorite'
import { shareRouter } from './routes/share'
import { adminRouter } from './routes/admin'

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
app.use('/api/users', usersRouter)
app.use('/api/checkin', checkinRouter)
app.use('/api/favorite', favoriteRouter)
app.use('/api/share', shareRouter)
app.use('/api/admin', adminRouter)

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
