// =====================================================================
// Hugging Face Space 入口
// ---------------------------------------------------------------------
// 启动 express 健康检查 + agent orchestrator 长跑循环
// 部署：HF Docker Space，端口 7860
// =====================================================================

import express from 'express'

// 动态 import server 模块（避免 tsconfig 路径问题）
const orchestrator = await import('../server/src/lib/agents/agent-orchestrator')

const app = express()
const PORT = Number(process.env.PORT) || 7860

app.use(express.json())

// 健康检查端点
app.get('/health', (_req, res) => {
  const status = orchestrator.getOrchestratorStatus()
  res.json({ ok: true, uptime: process.uptime(), orchestrator: status })
})

// 手动触发 tick（需 token 鉴权）
app.post('/tick', async (req, res) => {
  const token = req.headers['x-internal-token']
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const target = req.body?.target_ai_id
  const result = await orchestrator.tickAgent(target)
  res.json({ ok: true, result })
})

// 查询 orchestrator 状态
app.get('/status', (_req, res) => {
  res.json({ ok: true, ...orchestrator.getOrchestratorStatus() })
})

app.listen(PORT, () => {
  console.log(`[hf-space] listening on :${PORT}`)
  // 30s 延迟后启动 orchestrator（等其他模块就绪）
  setTimeout(() => {
    orchestrator.startOrchestrator(60_000)
    console.log('[hf-space] orchestrator started')
  }, 30_000)
})

// 5min 自 ping 防 HF Space sleep
setInterval(async () => {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`)
    if (!res.ok) console.warn('[hf-space] self-ping failed:', res.status)
  } catch (e) {
    console.warn('[hf-space] self-ping error:', e)
  }
}, 5 * 60 * 1000)
