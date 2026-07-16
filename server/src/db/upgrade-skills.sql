-- =====================================================================
-- Agent 超级大升级 - Batch A：Skill 市场 + 插件化 Agent
-- 文件：server/src/db/upgrade-skills.sql
-- 说明：在 Supabase Dashboard → SQL Editor 中整段执行即可。
-- 依赖：先执行 supabase/schema.sql + upgrade-v2.sql + upgrade-extend.sql
--       + upgrade-v3.sql（profiles / auth.users 已存在）
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. skills —— Skill 市场元数据仓库（官方 / 社区 / 用户自建）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.skills (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL,
    description   TEXT,
    category      TEXT NOT NULL,
    manifest      JSONB NOT NULL,
    author_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    version       TEXT NOT NULL DEFAULT '1.0.0',
    status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'published', 'rejected')),
    install_count INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- slug 全局唯一（内置 / 用户自建 slug 不可重复）
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_slug_unique ON public.skills(slug);
CREATE INDEX IF NOT EXISTS idx_skills_category ON public.skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_status ON public.skills(status);

-- 启用 RLS：只有 published 的 skill 对所有访客可读
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

-- 匿名访客可读 published skill
DROP POLICY IF EXISTS "匿名访客可读 published skill" ON public.skills;
CREATE POLICY "匿名访客可读 published skill" ON public.skills
    FOR SELECT TO anon
    USING (status = 'published');

-- 登录用户可读 published skill
DROP POLICY IF EXISTS "登录用户可读 published skill" ON public.skills;
CREATE POLICY "登录用户可读 published skill" ON public.skills
    FOR SELECT TO authenticated
    USING (status = 'published');

-- 作者可读写自己创建的 skill（任意状态：含 pending 审核中）
DROP POLICY IF EXISTS "作者可读写自己的 skill" ON public.skills;
CREATE POLICY "作者可读写自己的 skill" ON public.skills
    USING (auth.uid() = author_id);

-- =====================================================================
-- 2. user_skills —— 用户安装与启用状态
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_skills (
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill_id    UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON public.user_skills(user_id);

-- 启用 RLS：仅本人可读写
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "用户只能读写自己的 user_skills" ON public.user_skills;
CREATE POLICY "用户只能读写自己的 user_skills" ON public.user_skills
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 3. updated_at 自动维护触发器
-- =====================================================================
DROP TRIGGER IF EXISTS trg_skills_updated_at ON public.skills;
CREATE OR REPLACE FUNCTION public.set_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_skills_updated_at
    BEFORE UPDATE ON public.skills
    FOR EACH ROW
    EXECUTE FUNCTION public.set_skills_updated_at();

-- =====================================================================
-- 4. Seed 7 个内置 skills（slug 唯一，重复执行幂等）
-- =====================================================================
-- 使用 ON CONFLICT (slug) DO NOTHING 避免重复 seed

INSERT INTO public.skills (slug, name, description, category, manifest, author_id, version, status) VALUES
-- 4.1 联网搜索
(
    'builtin.web-search',
    '联网搜索',
    '搜索互联网获取实时信息（新闻、天气、事实等）。当用户询问最新新闻、需要联网才能回答的问题时自动调用。',
    'search',
    jsonb_build_object(
        'name', '联网搜索',
        'description', '搜索互联网获取实时信息',
        'tools', jsonb_build_array(jsonb_build_object(
            'name', 'webSearch',
            'description', '搜索互联网获取实时信息（新闻、天气、事实等）',
            'parameters', jsonb_build_object(
                'query', jsonb_build_object('type', 'string', 'description', '搜索关键词')
            )
        )),
        'systemPrompt', '你可以使用 webSearch 工具搜索互联网获取实时信息。当用户询问最新事件、天气、新闻或需要联网才能回答的问题时调用此工具。'
    ),
    NULL,
    '1.0.0',
    'published'
) ON CONFLICT (slug) DO NOTHING,

-- 4.2 图片生成
(
    'builtin.image-gen',
    '图片生成',
    '根据文字描述生成图片。当用户要求画图、生成图片、设计海报时调用。',
    'media',
    jsonb_build_object(
        'name', '图片生成',
        'description', '根据文字描述生成图片',
        'tools', jsonb_build_array(jsonb_build_object(
            'name', 'generateImage',
            'description', '根据文字描述生成图片',
            'parameters', jsonb_build_object(
                'prompt', jsonb_build_object('type', 'string', 'description', '图片描述（中英文均可）')
            )
        )),
        'systemPrompt', '你可以使用 generateImage 工具根据文字描述生成图片。当用户要求画图、生成图片时调用此工具。'
    ),
    NULL,
    '1.0.0',
    'published'
) ON CONFLICT (slug) DO NOTHING,

-- 4.3 视频生成
(
    'builtin.video-gen',
    '视频生成',
    '根据文字描述生成短视频（5 或 10 秒）。当用户要求生成视频、动画时调用。',
    'media',
    jsonb_build_object(
        'name', '视频生成',
        'description', '根据文字描述生成短视频',
        'tools', jsonb_build_array(jsonb_build_object(
            'name', 'generateVideo',
            'description', '根据文字描述生成短视频',
            'parameters', jsonb_build_object(
                'prompt', jsonb_build_object('type', 'string', 'description', '视频描述'),
                'duration', jsonb_build_object('type', 'number', 'description', '视频时长（秒），可选 5 或 10')
            )
        )),
        'systemPrompt', '你可以使用 generateVideo 工具根据文字描述生成短视频（5或10秒）。当用户要求生成视频、动画时调用此工具。'
    ),
    NULL,
    '1.0.0',
    'published'
) ON CONFLICT (slug) DO NOTHING,

-- 4.4 代码执行（Node vm 沙箱）
(
    'builtin.code-exec',
    '代码执行',
    '在沙箱中执行 JavaScript 代码（仅限纯计算，无 DOM/网络访问）。用于算式计算、格式转换等纯计算任务。',
    'code',
    jsonb_build_object(
        'name', '代码执行',
        'description', '在沙箱中执行 JavaScript 代码',
        'tools', jsonb_build_array(jsonb_build_object(
            'name', 'executeCode',
            'description', '在沙箱中执行 JavaScript 代码（仅限纯计算）',
            'parameters', jsonb_build_object(
                'code', jsonb_build_object('type', 'string', 'description', '要执行的 JS 代码')
            )
        )),
        'systemPrompt', '你可以使用 executeCode 工具在沙箱中执行 JavaScript 代码（3秒超时，仅纯计算）。当用户需要计算、格式转换、数据处理时调用此工具。'
    ),
    NULL,
    '1.0.0',
    'published'
) ON CONFLICT (slug) DO NOTHING,

-- 4.5 Bash 命令（占位，实际由前端 WebContainer 桥接）
(
    'builtin.bash',
    'Bash 命令',
    '在浏览器内 WebContainer 沙箱中执行 bash 命令（ls / cd / mkdir / npm / git / node 等）。实际执行由前端桥接，后端只提供工具 schema。',
    'code',
    jsonb_build_object(
        'name', 'Bash 命令',
        'description', '在浏览器内沙箱中执行 bash 命令',
        'tools', jsonb_build_array(jsonb_build_object(
            'name', 'bash',
            'description', '在浏览器内 WebContainer 沙箱中执行 bash 命令',
            'parameters', jsonb_build_object(
                'command', jsonb_build_object('type', 'string', 'description', '要执行的 shell 命令')
            )
        )),
        'systemPrompt', '你可以使用 bash 工具在浏览器内沙箱中执行 shell 命令（如 npm install、git init、node script.js 等）。命令在前端 WebContainer 中执行，结果会回传给你。'
    ),
    NULL,
    '1.0.0',
    'published'
) ON CONFLICT (slug) DO NOTHING,

-- 4.6 文件读写
(
    'builtin.file-io',
    '文件读写',
    '读写当前 Vibe 项目的文件（内存映射，支持多文件项目）。包含 writeFile 和 readFile 两个工具。',
    'utility',
    jsonb_build_object(
        'name', '文件读写',
        'description', '读写当前 Vibe 项目的文件',
        'tools', jsonb_build_array(
            jsonb_build_object(
                'name', 'writeFile',
                'description', '写入文件到当前 Vibe 项目',
                'parameters', jsonb_build_object(
                    'path', jsonb_build_object('type', 'string', 'description', '文件相对路径，如 index.html'),
                    'content', jsonb_build_object('type', 'string', 'description', '文件完整内容')
                )
            ),
            jsonb_build_object(
                'name', 'readFile',
                'description', '读取当前 Vibe 项目的文件内容',
                'parameters', jsonb_build_object(
                    'path', jsonb_build_object('type', 'string', 'description', '文件相对路径')
                )
            )
        ),
        'systemPrompt', '你可以使用 writeFile / readFile 工具读写当前 Vibe 项目的文件（支持多文件项目）。生成的代码应写入 index.html。'
    ),
    NULL,
    '1.0.0',
    'published'
) ON CONFLICT (slug) DO NOTHING,

-- 4.7 记忆
(
    'builtin.memory',
    '记忆',
    '长期记忆：保存用户偏好、历史决策、技术栈，后续对话自动引用。包含 saveMemory 和 recallMemory 两个工具。',
    'utility',
    jsonb_build_object(
        'name', '记忆',
        'description', '长期记忆：保存与回忆用户偏好',
        'tools', jsonb_build_array(
            jsonb_build_object(
                'name', 'saveMemory',
                'description', '保存一条记忆（key-value 形式）',
                'parameters', jsonb_build_object(
                    'key', jsonb_build_object('type', 'string', 'description', '记忆键，如 ui_framework'),
                    'value', jsonb_build_object('type', 'string', 'description', '记忆值，如 tailwind')
                )
            ),
            jsonb_build_object(
                'name', 'recallMemory',
                'description', '按 query 召回相关记忆',
                'parameters', jsonb_build_object(
                    'query', jsonb_build_object('type', 'string', 'description', '召回查询关键词')
                )
            )
        ),
        'systemPrompt', '你可以使用 saveMemory / recallMemory 工具记住用户偏好与历史决策。当用户表达偏好（如"我喜欢用 Tailwind"）时主动保存；需要回忆时调用 recallMemory。'
    ),
    NULL,
    '1.0.0',
    'published'
) ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- 完成
-- =====================================================================
-- 表清单：
--   1. skills        ✅ Skill 市场元数据（含 7 个内置 seed）
--   2. user_skills   ✅ 用户安装与启用状态
-- + RLS：skills published 公开可读、作者可读写自己；user_skills 仅本人可读写
-- + 索引：skills.slug 唯一 / category / status；user_skills.user_id
-- + updated_at 触发器
-- + 7 个内置 skill seed（幂等，重复执行不报错）
