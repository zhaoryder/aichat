# Tasks

## 阶段一：数据库扩展与管理员授权

- [x] Task 1: 扩展数据库 schema（6 张新表 + RLS + 字段）
  - [x] SubTask 1.1: 编写 `supabase/migrations/upgrade-extend.sql`：
    - `custom_agents`（id uuid pk / creator_id / name / description / personality / system_prompt / avatar_gradient / visibility private|public / status active|pending|banned / created_at）
    - `agent_favorites`（user_id / agent_id / agent_type official|custom / created_at，pk user_id+agent_id+agent_type）
    - `checkins`（user_id / check_date date / streak_days / points_earned，pk user_id+check_date）
    - `shared_conversations`（id / conversation_id / creator_id / slug unique / created_at）
    - `creative_works`（id / creator_id / type script|video|image|article|game|voice / title / input jsonb / result jsonb / status pending|processing|done|failed / created_at）
    - `game_saves`（id / user_id / game_type / state jsonb / updated_at）
    - `profiles` 表若无 `points` 字段则 ALTER ADD default 0
  - [x] SubTask 1.2: 为 6 张表编写 RLS（custom_agents 公开可读+创建者可改删；favorites/checkins/game_saves 仅本人；shares 公开可读+创建者可删；creative_works 公开可读+创建者可改删）
  - [x] SubTask 1.3: 启用 Supabase Realtime on `forum_posts` 与 `messages`（ALTER TABLE ... REPLICA IDENTITY FULL）
  - [x] SubTask 1.4: 验证：SQL Editor 执行后表结构与 RLS 正确

- [x] Task 2: 管理员授权脚本
  - [x] SubTask 2.1: 编写 `scripts/promote-admin.sql`，按邮箱 `zhaoryder@icloud.com` 查 auth.users 再 UPDATE profiles.role='admin'
  - [x] SubTask 2.2: 执行并验证 role 变为 admin

## 阶段二：搞笑强化 + 新增智能体

- [x] Task 3: 强化所有智能体搞笑 systemPrompt + 新增 10 名人
  - [x] SubTask 3.1: 在 `agents/index.ts` 为现有 7 个智能体 systemPrompt 末尾追加强制搞笑指令段（"你必须输出搞笑内容，每条回复至少 1 个梗/反转/包袱，拒绝也要搞笑地拒绝"）
  - [x] SubTask 3.2: 新增 10 个 AgentConfig：李白、鲁迅、马斯克、奥本海默、秦始皇、武则天、苏格拉底、达芬奇、贝多芬、林黛玉，每个 systemPrompt 含人格+口头禅+热梗+强制搞笑约束
  - [x] SubTask 3.3: 设计 10 个独特头像渐变
  - [x] SubTask 3.4: 编写 `supabase/migrations/seed-extra-agents.sql` 插入 10 个新智能体
  - [x] SubTask 3.5: 在 `lib/ai-client.ts` 拼接 systemPrompt 时追加通用搞笑基准（"你是搞笑 AI 平台的智能体，核心使命是让用户笑"）
  - [x] SubTask 3.6: 验证：17 个智能体对话均搞笑有梗

## 阶段三：真流式输出（1v1 对话）

- [x] Task 4: AI 客户端流式函数 + 搞笑指令注入
  - [x] SubTask 4.1: `lib/ai-client.ts` 新增 `chatCompletionStream(messages, agentId, options)` 返回 `AsyncGenerator<string>`，用 OpenAI SDK `stream: true`
  - [x] SubTask 4.2: 调用前一次性拉热梗（Promise.all 与历史加载并行）
  - [x] SubTask 4.3: 流结束后调用 `incrementMemeUsage()`（不阻塞）
  - [x] SubTask 4.4: 错误分类复用 classifyError
  - [x] SubTask 4.5: 验证：脚本调用能逐块产出 token

- [x] Task 5: 对话 API 改 SSE
  - [x] SubTask 5.1: 重写 `app/api/chat/route.ts` 返回 `text/event-stream`
  - [x] SubTask 5.2: 流程：鉴权→校验→封禁→敏感词→创建/获取对话→保存用户消息→Promise.all(历史, 热梗)→流式调用→边推 token 边累计→流结束保存完整回复→推 done
  - [x] SubTask 5.3: 事件格式 token/done/error
  - [x] SubTask 5.4: AbortController 支持客户端取消
  - [x] SubTask 5.5: 验证：curl 看到 token 逐个推送

- [x] Task 6: ChatWindow 接 SSE
  - [x] SubTask 6.1: 移除 TYPING_INTERVAL_MS 逐字模拟
  - [x] SubTask 6.2: fetch + ReadableStream 接收 SSE
  - [x] SubTask 6.3: token 追加气泡，done 结束 loading
  - [x] SubTask 6.4: 发新消息取消上一个流
  - [x] SubTask 6.5: 验证：首字 < 300ms，流畅追加

## 阶段四：论坛重构 + 流式 + 随时插话

- [x] Task 7: 论坛 API 改流式 + AI 自发讨论
  - [x] SubTask 7.1: `app/api/forum/create/route.ts` 改 SSE：创建话题后流式推送各被@智能体首条回复（并行流式 + 逐个推 token）
  - [x] SubTask 7.2: 新增 `app/api/forum/reply-stream/route.ts`：用户回帖后流式推送 AI 回复 + 交叉讨论
  - [x] SubTask 7.3: AI 自发讨论：话题有 2+ AI 参与时，后台按概率触发 AI 互相接梗（不必等用户发言）
  - [x] SubTask 7.4: 流式过程中保存完整回复到 forum_posts（流结束后一次保存，避免半成品入库）
  - [x] SubTask 7.5: 验证：发起话题/回帖后 AI 流式生成

- [x] Task 8: 论坛前端流式 + Realtime + 随时插话
  - [x] SubTask 8.1: `app/forum/topic/[id]/page.tsx` 接入 SSE，发起者看到 AI 逐字生成
  - [x] SubTask 8.2: 接入 Supabase Realtime 订阅 forum_posts INSERT，其他用户实时看到新帖
  - [x] SubTask 8.3: AI 生成中显示"正在打字…"，生成完替换
  - [x] SubTask 8.4: 用户随时可发回帖（输入框始终可用，不被 AI 生成阻塞）
  - [x] SubTask 8.5: 验证：多用户场景实时同步，用户插话不被阻塞

## 阶段五：自定义智能体 + 广场

- [x] Task 9: 自定义智能体 CRUD + 类型
  - [x] SubTask 9.1: `lib/supabase/types.ts` 新增 CustomAgent 类型
  - [x] SubTask 9.2: `lib/supabase/queries.ts` 新增 createCustomAgent/listCustomAgents/getCustomAgentById/updateCustomAgent/deleteCustomAgent/listPublicCustomAgents
  - [x] SubTask 9.3: `agents/index.ts` 的 getAgentById 扩展：先官方再查 custom_agents（缓存或直查）
  - [x] SubTask 9.4: 验证：CRUD 类型正确，RLS 生效

- [x] Task 10: 创建/编辑/广场页
  - [x] SubTask 10.1: `/agents/create` 表单（名称/描述/性格/systemPrompt/头像渐变/可见性），zod 校验
  - [x] SubTask 10.2: `/agents/[id]/edit` 仅创建者可访问
  - [x] SubTask 10.3: `/agents` 广场页（官方+公开自定义，搜索+筛选）
  - [x] SubTask 10.4: `app/chat/[agentId]/page.tsx` 适配自定义智能体
  - [x] SubTask 10.5: 验证：创建公开智能体→广场可见→能对话

## 阶段六：创意工坊（6 个功能，每个完整实现）

- [x] Task 11: 创意工坊基础设施
  - [x] SubTask 11.1: `/studio` 首页（6 个功能入口卡片 + 我的作品列表）
  - [x] SubTask 11.2: `lib/supabase/queries.ts` 新增 createCreativeWork/listCreativeWorks/getCreativeWorkById/updateCreativeWorkStatus
  - [x] SubTask 11.3: 验证：作品 CRUD 正常

- [x] Task 12: 搞笑剧本 `/studio/script`
  - [x] SubTask 12.1: 表单（主题/场景/参与智能体多选/期望时长）
  - [x] SubTask 12.2: `app/api/studio/script/route.ts` 调用 GLM 生成多角色剧本（流式展示生成过程）
  - [x] SubTask 12.3: 剧本排版渲染（场景描述 + 角色对白高亮 + 舞台指示），复制/下载 txt/分享
  - [x] SubTask 12.4: 保存到 creative_works，含 3+ 反转包袱
  - [x] SubTask 12.5: 验证：生成剧本完整可用

- [x] Task 13: 搞笑视频 `/studio/video`
  - [x] SubTask 13.1: 表单（主题/风格/时长）
  - [x] SubTask 13.2: `lib/ai-client.ts` 新增 `generateVideo(prompt, options)` 调用智谱 CogVideoX 异步接口
  - [x] SubTask 13.3: `app/api/studio/video/create/route.ts` 提交任务，`/api/studio/video/status/[id]` 轮询
  - [x] SubTask 13.4: 前端轮询 + 进度条 + 完成后 `<video>` 播放 + 下载 + 分享
  - [x] SubTask 13.5: 失败重试 + 超时处理
  - [x] SubTask 13.6: 验证：真实生成 mp4 并可播放下载

- [x] Task 14: 搞笑图片 `/studio/image`
  - [x] SubTask 14.1: 表单（描述/风格/数量 1-4）
  - [x] SubTask 14.2: `lib/ai-client.ts` 新增 `generateImage(prompt, options)` 调用智谱 CogView4
  - [x] SubTask 14.3: `app/api/studio/image/route.ts` 批量生成
  - [x] SubTask 14.4: 画廊网格 + 放大 + 单独/全部下载 + 分享 + 配字幕做表情包
  - [x] SubTask 14.5: 验证：真实生成图片并可下载

- [x] Task 15: 搞笑文章 `/studio/article`
  - [x] SubTask 15.1: 表单（主题/文体/字数）
  - [x] SubTask 15.2: `app/api/studio/article/route.ts` 调用 GLM 流式生成结构化文章（标题/导语/正文/金句/配图建议）
  - [x] SubTask 15.3: 富文本排版 + 金句卡片 + 一键生成配图（调 CogView4）+ 复制/下载 md/分享
  - [x] SubTask 15.4: 验证：文章文体特色鲜明含 3+ 金句

- [x] Task 16: 搞笑游戏 `/studio/game`
  - [x] SubTask 16.1: 游戏类型选择（文字冒险/海龟汤/情景选择/接梗大战）
  - [x] SubTask 16.2: `app/api/studio/game/start/route.ts` 开局生成开场剧情+3-4 选项
  - [x] SubTask 16.3: `app/api/studio/game/choice/route.ts` 用户选选项→AI 生成下一段+新选项，多结局
  - [x] SubTask 16.4: `game_saves` 存档/读档，多周目
  - [x] SubTask 16.5: 游戏界面（剧情文本+选项按钮+存档栏+结局回顾）
  - [x] SubTask 16.6: 验证：完整一局游戏可玩多结局

- [x] Task 17: 搞笑语音 `/studio/voice`
  - [x] SubTask 17.1: 表单（文本/音色选择/智能体声音）
  - [x] SubTask 17.2: `lib/ai-client.ts` 新增 `generateSpeech(text, options)` 调用智谱 TTS
  - [x] SubTask 17.3: `app/api/studio/voice/route.ts` 生成语音
  - [x] SubTask 17.4: 在线播放 + 下载 mp3 + 分享 + 一键把剧本/文章转语音
  - [x] SubTask 17.5: 验证：真实生成 mp3 可播放下载

## 阶段七：好玩功能 + 性能优化

- [x] Task 18: 每日签到 + 积分
  - [x] SubTask 18.1: `app/api/checkin/route.ts` POST 签到（当日仅一次，积分+10，连续加成）
  - [x] SubTask 18.2: 个人中心签到日历 + 按钮 + 积分显示
  - [x] SubTask 18.3: 验证：签到增积分，重复拒

- [x] Task 19: 智能体收藏
  - [x] SubTask 19.1: `app/api/favorite/route.ts` toggle 收藏
  - [x] SubTask 19.2: AgentCard/对话页收藏按钮
  - [x] SubTask 19.3: 个人中心我的收藏
  - [x] SubTask 19.4: 验证：收藏生效

- [x] Task 20: 对话分享
  - [x] SubTask 20.1: `app/api/share/route.ts` 生成 slug
  - [x] SubTask 20.2: `/share/[slug]` 只读页
  - [x] SubTask 20.3: 对话页分享按钮复制链接
  - [x] SubTask 20.4: 验证：链接可访问查看

- [x] Task 21: 性能优化
  - [x] SubTask 21.1: `/api/chat` Promise.all 并行历史+热梗
  - [x] SubTask 21.2: 主页/广场卡片懒加载
  - [x] SubTask 21.3: 验证：首字<300ms，主页 LCP<1.5s

## 阶段八：端到端验证

- [x] Task 22: 端到端验证
  - [x] SubTask 22.1: webapp-testing 覆盖：注册→登录→签到→创建智能体→广场→对话(流式)→论坛(流式+插话)→创意工坊6功能→收藏→分享→管理员后台
  - [x] SubTask 22.2: web-design-guidelines 审查新增页面
  - [x] SubTask 22.3: 修复发现的问题
  - [x] SubTask 22.4: 最终回归测试

# Task Dependencies
- Task 1、2 并行（数据库+管理员）
- Task 3 依赖 Task 1（seed 插入）
- Task 4 独立（ai-client 流式）
- Task 5 依赖 Task 4
- Task 6 依赖 Task 5
- Task 7 依赖 Task 4（流式函数）
- Task 8 依赖 Task 7
- Task 9 依赖 Task 1（custom_agents 表）
- Task 10 依赖 Task 9
- Task 11 依赖 Task 1（creative_works 表）
- Task 12-17 依赖 Task 11
- Task 13/14/17 依赖 Task 4（多媒体生成函数）
- Task 18-20 依赖 Task 1
- Task 21 依赖 Task 5
- Task 22 依赖所有
