FROM node:20-slim

# 安装 FFmpeg + x264（为 Batch B 视频合成预留）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    x264 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 server 依赖文件并安装
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && (npm ci --omit=dev || npm install --omit=dev)

# 复制 shared 与 server 源码
COPY shared ./shared
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY server/tsconfig.json ./server/tsconfig.json

# 复制 HF Space 入口
COPY huggingface-space/package.json huggingface-space/index.ts ./huggingface-space/

# 安装 tsx 用于直接运行 TypeScript（避免构建步骤）
RUN cd server && npm install --save-dev tsx typescript @types/node

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:7860/health || exit 1

CMD ["npx", "tsx", "huggingface-space/index.ts"]
