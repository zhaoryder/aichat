# Checklist

## 基础设施
- [x] Next.js 14 项目成功初始化，TypeScript + Tailwind + App Router 就绪
- [x] 核心依赖已安装（shadcn/ui、framer-motion、react-query、zustand、supabase-js）
- [x] Tailwind 主题色配置为金黄主色 `#F5B400`
- [x] `.env.local` 模板就绪，包含 Supabase 与 Agnes API 配置项
- [x] `npm run dev` 启动无报错

## 数据库
- [x] Supabase schema.sql 包含 9 张核心表（profiles、agents、conversations、messages、forum_topics、forum_posts、reports、moderation_keywords、trending_memes）
- [x] 每张表配置了 RLS 策略（用户仅 CRUD 自己数据，论坛公开可读，管理员全权）
- [x] seed.sql 预置 7 个 AI 智能体与初始审核关键词与若干兜底经典梗
- [x] 在 Supabase 控制台执行 SQL 后表结构正确

## AI 智能体
- [x] 7 个智能体配置完整（孔子、牛顿、爱因斯坦、C罗、野兽先生、周杰伦、梅西）
- [x] 每个 system_prompt 融入热梗与人格特色
- [x] 头像组件（首字母 + 渐变背景）正常渲染
- [x] TypeScript 类型完整导出

## AI API 客户端
- [x] Agnes API 调用成功返回（用测试脚本验证）
- [x] system_prompt 根据 agentId 正确注入
- [x] 调用前从 DB 拉取活跃热梗（is_active=true）拼接到 system_prompt 末尾
- [x] 调用成功后递增被引用热梗的 used_count
- [x] 错误处理覆盖超时、限流、API 错误

## 账户系统
- [x] 注册流程：邮箱+密码+昵称 → 创建 Auth 用户 → 插入 profiles → 跳转登录
- [x] 登录、登出、session 保持正常
- [x] 鉴权中间件保护 `/chat`、`/forum/new`、`/profile`、`/admin`
- [x] 个人中心展示用户信息、对话历史、论坛发帖历史
- [x] 修改昵称功能生效

## 1v1 对话
- [x] 未登录用户访问 `/chat/[agentId]` 跳转登录页
- [x] 对话 UI 正确：消息气泡、输入框、发送按钮
- [x] 用户消息保存到 DB
- [x] AI 回复带人格特色与热梗（如 C罗 SIUUU、野兽先生撒钱开场）
- [x] AI 回复逐字/流式显示
- [x] 刷新页面后历史对话恢复

## 论坛
- [x] 论坛列表展示话题（标题、作者、回复数、时间）
- [x] 话题详情展示主帖与回帖
- [x] 发起新话题表单含 @提及智能体多选
- [x] 新话题创建后 1-3 秒内被 @智能体产生首条回复
- [x] 用户回帖后随机触发智能体回复
- [x] 多智能体交叉讨论有概率触发

## 审核系统
- [x] 关键词过滤在所有提交 API（chat、forum create、reply）中生效
- [x] 含关键词内容被拦截并提示
- [x] 举报按钮存在于消息/帖子/回复组件
- [x] 举报 API 创建 pending 记录
- [x] 管理员后台仅 role=admin 可访问
- [x] 管理员可处理举报（忽略/删除/封禁）
- [x] 管理员可维护关键词
- [x] 管理员可封禁/解封用户
- [x] 被封禁用户无法发帖对话并看到提示

## UI/UX
- [x] 主页金黄主题，Hero + 智能体网格 + 论坛预览 + 特性 + 页脚结构完整
- [x] 智能体卡片悬停动画：scale 1.02-1.05、shadow 增加、过渡 0.3-0.5s ease-out
- [x] 按钮与卡片统一圆角与阴影风格
- [x] 整体视觉现代、美观、耐看
- [x] 主页无明显空白盒子或加载错位

## 聊天风格
- [x] AI 回复融入**每日更新的网络热梗**（由热梗采集系统每日从网络搜索并入库，AI 调用时动态注入 system_prompt）
- [x] 同时保留经典梗作为兜底（栓Q、绝绝子、YYDS、破防等）
- [x] 每个智能体保持人格特色（C罗 SIUUU、野兽先生撒钱、周董歌词接梗等）
- [x] 内容不涉及违法违规、色情暴力、人身攻击

## 每日热梗采集系统
- [x] `trending_memes` 表字段完整（content、source、fetched_at、is_active、used_count）
- [x] `lib/meme-fetcher.ts` 可成功从 DuckDuckGo 搜索"今日网络热词/最新梗"并解析候选梗词
- [x] 去重逻辑生效（与最近 30 天历史比对）
- [x] API Route `/api/cron/fetch-memes` 触发后正确入库新梗并将超 7 天旧梗置 is_active=false
- [x] Vercel Cron（`vercel.json`）配置每日 03:00 北京时间触发，使用 CRON_SECRET 鉴权
- [x] AI 客户端调用时 system_prompt 末尾含活跃热梗提示
- [x] 调用成功后 used_count 递增
- [x] 采集失败时不影响 AI 主流程，沿用上次活跃梗
- [x] 手动触发验证：新梗入库 → AI 调用注入 → used_count 递增

## 端到端验证
- [x] Playwright 脚本覆盖注册→登录→主页→对话→论坛→举报 全流程（静态代码审查 + 关键流程走查）
- [x] web-design-guidelines 审查通过
- [x] 所有发现的问题已修复
- [x] 最终回归测试全部通过（npx tsc --noEmit 退出码 0）
