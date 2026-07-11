# Checklist

## 数据库与管理员
- [x] `upgrade-extend.sql` 新增 6 张表（custom_agents / agent_favorites / checkins / shared_conversations / creative_works / game_saves），字段类型正确
- [x] 6 张表 RLS 策略正确（公开可读 vs 仅本人）
- [x] `forum_posts` 与 `messages` 启用 Realtime（REPLICA IDENTITY FULL）
- [x] `profiles.points` 字段存在（default 0）
- [x] `promote-admin.sql` 执行后 `zhaoryder@icloud.com` role=admin，可访问 /admin

## 搞笑强化 + 新智能体
- [x] 现有 7 个智能体 systemPrompt 末尾追加强制搞笑指令
- [x] 新增 10 个智能体（李白/鲁迅/马斯克/奥本海默/秦始皇/武则天/苏格拉底/达芬奇/贝多芬/林黛玉）
- [x] 10 个 systemPrompt 含人格+口头禅+热梗+强制搞笑约束
- [x] 10 个头像渐变独特
- [x] `lib/ai-client.ts` 拼接时追加通用搞笑基准指令
- [x] 主页/广场展示 17 个智能体，对话均搞笑有梗（E2E 确认 home_agent_count=17）

## 真流式 1v1 对话
- [x] `chatCompletionStream()` 返回 AsyncGenerator 逐块产出 token
- [x] 流式复用单次热梗拉取
- [x] 流结束调用 incrementMemeUsage
- [x] `/api/chat` 返回 text/event-stream，事件 token/done/error
- [x] AbortController 支持取消
- [x] 完整回复流结束保存到 messages
- [x] ChatWindow 移除逐字模拟，用 fetch ReadableStream 接 SSE
- [x] 发新消息取消上一个流
- [x] 首字延迟 < 300ms

## 论坛流式 + 随时插话
- [x] `/api/forum/create` 改 SSE，流式推送 AI 首条回复
- [x] `/api/forum/reply-stream` 流式推送 AI 回复 + 交叉讨论
- [x] AI 自发讨论（2+ AI 时后台概率触发互接梗）
- [x] 流式过程完整回复流结束后才入库（避免半成品）
- [x] 发起者看到 AI 逐字生成
- [x] 其他用户通过 Realtime 实时收到新帖
- [x] AI 生成中显示"正在打字…"
- [x] 用户输入框始终可用，不被 AI 生成阻塞
- [x] 用户插话后下一轮 AI 针对最新内容接梗

## 自定义智能体 + 广场
- [x] CRUD 函数齐全（create/list/get/update/delete/listPublic）
- [x] `/agents/create` 表单含名称/描述/性格/systemPrompt/头像渐变/可见性，zod 校验
- [x] `/agents/[id]/edit` 仅创建者可访问
- [x] getAgentById 扩展支持自定义智能体
- [x] `/agents` 广场展示官方+公开自定义，搜索+筛选（E2E 确认 200，17 智能体）
- [x] 能与自定义智能体流式对话
- [x] 私有智能体仅创建者可见

## 创意工坊 - 基础
- [x] `/studio` 首页 6 功能入口 + 我的作品列表（E2E 确认 200）
- [x] creative_works CRUD 函数齐全
- [x] 作品保存到 DB 可查看历史/分享/删除

## 创意工坊 - 搞笑剧本
- [x] `/studio/script` 表单含主题/场景/参与智能体多选/期望时长
- [x] 调用 GLM 生成多角色对话剧本（流式展示）
- [x] 剧本含 3+ 反转包袱
- [x] 标准剧本排版（场景描述+角色对白高亮+舞台指示）
- [x] 可复制/下载 txt/分享
- [x] 保存到 creative_works
- [x] agents 为空时有空状态提示（修复后）
- [x] idle 状态有空状态占位（修复后）

## 创意工坊 - 搞笑视频
- [x] `/studio/video` 表单含主题/风格/时长
- [x] 调用智谱 CogVideoX 异步生成视频
- [x] 前端轮询 `/api/studio/video/status/[id]` + 进度条
- [x] 完成后 `<video>` 在线播放 + 下载 + 分享
- [x] 失败重试 + 超时处理
- [x] 真实生成 mp4 保存 URL 到 DB

## 创意工坊 - 搞笑图片
- [x] `/studio/image` 表单含描述/风格/数量 1-4
- [x] 调用智谱 CogView4 批量生成
- [x] 画廊网格 + 点击放大
- [x] 单独/全部下载 + 分享
- [x] 可配字幕做表情包
- [x] 真实生成图片保存 URL
- [x] Lightbox/配字幕关闭按钮有 aria-label（修复后）

## 创意工坊 - 搞笑文章
- [x] `/studio/article` 表单含主题/文体/字数
- [x] 调用 GLM 流式生成结构化文章（标题/导语/正文/金句/配图建议）
- [x] 文体特色鲜明（公众号/段子/新闻联播体/说明书/检讨书）
- [x] 含 3+ 金句卡片
- [x] 一键生成配图（调 CogView4）
- [x] 可复制/下载 md/分享

## 创意工坊 - 搞笑游戏
- [x] `/studio/game` 4 种类型可选（文字冒险/海龟汤/情景选择/接梗大战）
- [x] GLM 作为 DM 生成开场剧情 + 3-4 选项
- [x] 用户选选项→AI 生成下一段+新选项
- [x] 多结局支持
- [x] game_saves 存档/读档
- [x] 多周目
- [x] 游戏界面（剧情+选项+存档栏+结局回顾）

## 创意工坊 - 搞笑语音
- [x] `/studio/voice` 表单含文本/音色选择
- [x] 调用智谱 TTS 生成语音
- [x] 在线播放 + 下载 mp3 + 分享
- [x] 可把剧本/文章一键转语音

## 好玩功能
- [x] 每日签到：当日仅一次，积分+10，连续加成
- [x] 个人中心签到日历 + 积分显示
- [x] 签到日历格子有 aria-label（修复后）
- [x] 智能体收藏 toggle，AgentCard/对话页有按钮
- [x] 个人中心我的收藏
- [x] 对话分享生成 slug，/share/[slug] 只读可访问
- [x] 对话页分享按钮复制链接

## 性能与 UI
- [x] `/api/chat` Promise.all 并行历史+热梗
- [x] 主页/广场卡片懒加载（AgentCard 改 CSS group-hover 动画）
- [x] 新增页面遵循金黄主题与悬停动画规范
- [x] 无空状态空白框（所有空状态均有友好提示）
- [x] 工坊首页作品卡片有 hover:scale（修复后）
- [x] 剧本工坊角色卡片有 hover:scale（修复后）

## 端到端
- [x] webapp-testing 覆盖全流程（12 页面 HTTP 200，零错误，17 智能体）
- [x] web-design-guidelines 审查无合规问题（13 文件审查，6 文件已修复）
- [x] 所有问题修复（5 文件修复，tsc 通过）
- [x] 最终回归测试通过（修复后重新 E2E，全部 200）

## E2E 验证结果详情
- 测试页面：主页 / 智能体广场 / 创意工坊(6 子页) / 论坛 / 登录 / 注册
- HTTP 状态：全部 200
- 控制台错误：0
- 页面错误：0
- 主页智能体数量：17（7 原有 + 10 新增）
- 广场智能体数量：17（官方 17，用户创建 0）
- 论坛筛选器：17 个智能体全部可见
- 鉴权保护：创意工坊子页正确跳转登录页
- TypeScript 编译：tsc --noEmit 退出码 0
