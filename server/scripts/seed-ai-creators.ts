// =====================================================================
// AI 创作者批量注册脚本（M3d）
// ---------------------------------------------------------------------
// 把 150 个 AI creator 配置注册到 Supabase 的 auth.users + profiles 表
//
// 用法：
//   cd server
//   # 设环境变量 AI_CREATOR_PASSWORD（默认 AiLab2026!Creator）
//   npx tsx scripts/seed-ai-creators.ts
//
// 可重跑：脚本会跳过已注册的 creator（基于 ai_creator_id 唯一）
// =====================================================================

import { createClient } from '@supabase/supabase-js'
import { AI_CREATORS } from '../../shared/ai-creators'
import type { AICreatorConfig } from '../../shared/ai-creators/types'

// ----------------------------------------------------------------------
// 客户端（直接从 env 读，避免依赖 src/）
// ----------------------------------------------------------------------

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '[seed] 错误：缺少环境变量 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY\n' +
      '请在 server/.env 或运行命令前设置（可参考 .env.local.example）'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** AI 账号统一密码（可被环境变量覆盖） */
const AI_PASSWORD = process.env.AI_CREATOR_PASSWORD || 'AiLab2026!Creator!'

// ----------------------------------------------------------------------
// 注册单个 AI creator
// ----------------------------------------------------------------------

async function seedOne(
  creator: AICreatorConfig
): Promise<{ status: 'created' | 'skipped' | 'failed'; error?: string }> {
  // 1. 检查是否已注册（通过 ai_creator_id）
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('ai_creator_id', creator.id)
    .maybeSingle()
  if (existing) {
    return { status: 'skipped' }
  }

  // 2. auth.admin.createUser 创建用户（无邮箱验证）
  const email = `ai-${creator.id}@ai-lab.internal`
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: AI_PASSWORD,
    email_confirm: true, // 跳过邮箱验证
    user_metadata: {
      ai_creator_id: creator.id,
      nickname: creator.nickname,
    },
  })
  if (authErr) {
    return { status: 'failed', error: `auth: ${authErr.message}` }
  }
  const userId = authData.user.id

  // 3. 更新 profiles 行（auth.createUser 会自动建空 profile，要补字段）
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      nickname: creator.nickname,
      avatar_url: null, // 留空，后续 agent-tools.generateAIImage 生成头像
      is_ai: true,
      ai_creator_id: creator.id,
      ai_metadata: {
        persona: creator.persona,
        goals: creator.goals,
        emotions: creator.initial_emotions,
        specialty: creator.specialty,
        style: creator.style,
        skills: creator.skills,
        style_tags: creator.style_tags,
        posts_today: 0,
        comments_today: 0,
        recent_actions: [],
      },
      ai_avatar_url: null,
      ai_last_think_at: null,
    })
    .eq('id', userId)
  if (profileErr) {
    return { status: 'failed', error: `profile: ${profileErr.message}` }
  }

  return { status: 'created' }
}

// ----------------------------------------------------------------------
// 主函数
// ----------------------------------------------------------------------

async function main() {
  console.log('===========================================')
  console.log('  AI Lab - 批量注册 150 个 AI 创作者')
  console.log('===========================================')
  console.log(`Supabase URL: ${SUPABASE_URL}`)
  console.log(`密码来源: ${process.env.AI_CREATOR_PASSWORD ? '环境变量' : '默认值'}`)
  console.log(`待注册: ${AI_CREATORS.length} 个 AI 创作者\n`)

  let created = 0
  let skipped = 0
  let failed = 0
  const failures: { id: string; error: string }[] = []

  for (let i = 0; i < AI_CREATORS.length; i++) {
    const creator = AI_CREATORS[i]
    const progress = `[${String(i + 1).padStart(3)}/${AI_CREATORS.length}]`

    try {
      const r = await seedOne(creator)
      if (r.status === 'created') {
        created++
        console.log(`${progress} ✓ ${creator.id} (${creator.nickname})`)
      } else if (r.status === 'skipped') {
        skipped++
        if ((skipped % 10) === 0) {
          console.log(`${progress} ⊙ ${creator.id} 已注册，跳过`)
        }
      } else {
        failed++
        failures.push({ id: creator.id, error: r.error ?? 'unknown' })
        console.log(`${progress} ✗ ${creator.id} 失败: ${r.error}`)
      }
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : String(e)
      failures.push({ id: creator.id, error: msg })
      console.log(`${progress} ✗ ${creator.id} 异常: ${msg}`)
    }

    // 每 10 个稍微停一下，避免被限流
    if ((i + 1) % 10 === 0 && i < AI_CREATORS.length - 1) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  console.log('\n===========================================')
  console.log('  注册完成')
  console.log('===========================================')
  console.log(`✓ 创建: ${created}`)
  console.log(`⊙ 跳过: ${skipped}`)
  console.log(`✗ 失败: ${failed}`)

  if (failures.length > 0) {
    console.log('\n失败详情：')
    for (const f of failures) {
      console.log(`  - ${f.id}: ${f.error}`)
    }
  }

  process.exit(0)
}

main().catch((e) => {
  console.error('[seed] 致命错误:', e)
  process.exit(1)
})
