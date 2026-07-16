-- =====================================================================
-- Agent 超级大升级 v4.0.0 — 合并数据库迁移
-- ---------------------------------------------------------------------
-- 包含 5 个迁移：
--   1. upgrade-skills.sql        (Batch A: Skill 市场)
--   2. upgrade-plans.sql         (Batch B: Plan Mode)
--   3. upgrade-team.sql          (Batch C: AI Teamwork)
--   4. upgrade-sandbox.sql      (Batch D: WebContainer 沙箱)
--   5. upgrade-agent-memory.sql (Batch E: Agent Memory)
--
-- 使用方法：在 Supabase Dashboard → SQL Editor 中整段执行本文件
-- 幂等设计：所有 create 语句都带 if not exists
-- =====================================================================

-- =====================================================================
-- 1. skills + user_skills（Batch A）
-- =====================================================================
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  category text not null,
  manifest jsonb not null,
  author_id uuid references auth.users(id) on delete set null,
  version text default '1.0.0',
  status text default 'pending' check(status in ('pending','published','rejected')),
  install_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.skills enable row level security;
drop policy if exists "skills public read" on public.skills;
create policy "skills public read" on public.skills for select using (status = 'published' or author_id = auth.uid());
drop policy if exists "skills owner insert" on public.skills;
create policy "skills owner insert" on public.skills for insert with check (author_id = auth.uid());
drop policy if exists "skills owner update" on public.skills;
create policy "skills owner update" on public.skills for update using (author_id = auth.uid());

create table if not exists public.user_skills (
  user_id uuid references auth.users(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete cascade,
  enabled boolean default true,
  config jsonb default '{}'::jsonb,
  installed_at timestamptz default now(),
  primary key (user_id, skill_id)
);
alter table public.user_skills enable row level security;
drop policy if exists "user_skills owner select" on public.user_skills;
create policy "user_skills owner select" on public.user_skills for select using (user_id = auth.uid());
drop policy if exists "user_skills owner insert" on public.user_skills;
create policy "user_skills owner insert" on public.user_skills for insert with check (user_id = auth.uid());
drop policy if exists "user_skills owner update" on public.user_skills;
create policy "user_skills owner update" on public.user_skills for update using (user_id = auth.uid());
drop policy if exists "user_skills owner delete" on public.user_skills;
create policy "user_skills owner delete" on public.user_skills for delete using (user_id = auth.uid());

create index if not exists idx_skills_category on public.skills(category);
create index if not exists idx_skills_status on public.skills(status);
create index if not exists idx_user_skills_user_id on public.user_skills(user_id);

-- Seed 7 内置 skills（幂等）
insert into public.skills (slug, name, description, category, manifest, status, author_id) values
  ('builtin.web-search', '联网搜索', '通过 DuckDuckGo 搜索互联网获取实时信息', 'search', '{"name":"web-search","description":"联网搜索","tools":[{"name":"webSearch","description":"搜索互联网","parameters":{"query":"string"}}]}'::jsonb, 'published', null),
  ('builtin.image-gen', '图片生成', '根据文字描述生成图片', 'media', '{"name":"image-gen","description":"图片生成","tools":[{"name":"generateImage","description":"生成图片","parameters":{"prompt":"string"}}]}'::jsonb, 'published', null),
  ('builtin.video-gen', '视频生成', '根据文字描述生成短视频', 'media', '{"name":"video-gen","description":"视频生成","tools":[{"name":"generateVideo","description":"生成视频","parameters":{"prompt":"string","duration":"number?"}}]}'::jsonb, 'published', null),
  ('builtin.code-exec', '代码执行', '在沙箱中执行 JavaScript 代码', 'code', '{"name":"code-exec","description":"代码执行","tools":[{"name":"executeCode","description":"执行JS代码","parameters":{"code":"string"}}]}'::jsonb, 'published', null),
  ('builtin.bash', 'Bash 命令', '在 WebContainer 沙箱中执行 shell 命令', 'code', '{"name":"bash","description":"Bash命令","tools":[{"name":"bash","description":"执行shell命令","parameters":{"command":"string"}}]}'::jsonb, 'published', null),
  ('builtin.file-io', '文件读写', '在沙箱中读写文件', 'utility', '{"name":"file-io","description":"文件读写","tools":[{"name":"writeFile","description":"写文件","parameters":{"path":"string","content":"string"}},{"name":"readFile","description":"读文件","parameters":{"path":"string"}}]}'::jsonb, 'published', null),
  ('builtin.memory', '长期记忆', '记住用户偏好和历史决策', 'utility', '{"name":"memory","description":"长期记忆","tools":[{"name":"saveMemory","description":"保存记忆","parameters":{"key":"string","value":"string"}},{"name":"recallMemory","description":"回忆","parameters":{"query":"string"}}]}'::jsonb, 'published', null)
on conflict (slug) do nothing;

-- =====================================================================
-- 2. plans（Batch B）
-- =====================================================================
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text,
  goal text not null,
  steps jsonb not null default '[]'::jsonb,
  current_step int default 0,
  status text not null default 'draft' check(status in ('draft','planning','ready','executing','paused','completed','failed')),
  mode text default 'single' check(mode in ('single','plan','team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.plans enable row level security;
drop policy if exists "plans owner crud" on public.plans;
create policy "plans owner crud" on public.plans for all using (user_id = auth.uid());
create index if not exists idx_plans_user_id on public.plans(user_id);
create index if not exists idx_plans_status on public.plans(status);

-- =====================================================================
-- 3. team_sessions（Batch C）
-- =====================================================================
create table if not exists public.team_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  goal text not null,
  roles jsonb not null default '[]'::jsonb,
  current_role_name text,
  status text not null default 'active' check(status in ('active','paused','completed','failed')),
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.team_sessions enable row level security;
drop policy if exists "team_sessions owner crud" on public.team_sessions;
create policy "team_sessions owner crud" on public.team_sessions for all using (user_id = auth.uid());
create index if not exists idx_team_sessions_user_id on public.team_sessions(user_id);
create index if not exists idx_team_sessions_status on public.team_sessions(status);

-- =====================================================================
-- 4. sandbox_snapshots（Batch D）
-- =====================================================================
create table if not exists public.sandbox_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  files jsonb not null default '[]'::jsonb,
  preview_html text,
  share_slug text unique,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sandbox_snapshots enable row level security;
drop policy if exists "sandbox owner crud" on public.sandbox_snapshots;
create policy "sandbox owner crud" on public.sandbox_snapshots for all using (owner_id = auth.uid());
drop policy if exists "sandbox public read" on public.sandbox_snapshots;
create policy "sandbox public read" on public.sandbox_snapshots for select using (share_slug is not null);
create index if not exists idx_sandbox_owner_id on public.sandbox_snapshots(owner_id);
create index if not exists idx_sandbox_share_slug on public.sandbox_snapshots(share_slug);

-- =====================================================================
-- 5. agent_memory（Batch E）
-- =====================================================================
create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  source text default 'agent',
  created_at timestamptz default now()
);
alter table public.agent_memory enable row level security;
drop policy if exists "agent_memory owner crud" on public.agent_memory;
create policy "agent_memory owner crud" on public.agent_memory for all using (user_id = auth.uid());
create index if not exists idx_agent_memory_user_id on public.agent_memory(user_id);
create index if not exists idx_agent_memory_user_key on public.agent_memory(user_id, key);
create unique index if not exists idx_agent_memory_user_key_unique on public.agent_memory(user_id, key);

-- =====================================================================
-- 触发器：updated_at 自动维护
-- =====================================================================
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_skills_updated on public.skills;
create trigger trg_skills_updated before update on public.skills
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_plans_updated on public.plans;
create trigger trg_plans_updated before update on public.plans
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_team_sessions_updated on public.team_sessions;
create trigger trg_team_sessions_updated before update on public.team_sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_sandbox_snapshots_updated on public.sandbox_snapshots;
create trigger trg_sandbox_snapshots_updated before update on public.sandbox_snapshots
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- 完成
-- =====================================================================
-- 验证：select count(*) from public.skills where slug like 'builtin.%';
-- 预期返回 7
