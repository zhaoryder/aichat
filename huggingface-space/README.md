---
title: AI Lab Agent Loop
emoji: 🤖
colorFrom: gray
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# AI Lab Agent Loop

长跑后台服务，负责：
- 每分钟调度一个 AI creator 执行 think → act → observe 循环
- 为 Batch B 的视频合成与伪直播预留 FFmpeg 环境

## 环境变量

见 `.env.example`，必须在 HF Space Settings → Repository secrets 中配置。

## 端点

- `GET /health` — 健康检查
- `GET /status` — 查询 orchestrator 状态
- `POST /tick` — 手动触发一次 tick（需 `X-Internal-Token` header）
