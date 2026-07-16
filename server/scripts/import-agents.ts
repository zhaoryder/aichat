// 批量导入 agents 到 Supabase
// 用法: npx tsx scripts/import-agents.ts
import { agents } from '../shared/agents'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jadxupuypxilxdwownyb.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphZHh1cHV5cHhpbHhkd293bnliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzYwMTYxMCwiZXhwIjoyMDk5MTc3NjEwfQ.0sro3mUqhKxewzoK6vMEI_kY79L3XEEZAXZ1xukydpY'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  console.log(`准备导入 ${agents.length} 个 agent`)

  // 分批插入（每批 50 个，避免请求体过大）
  const BATCH_SIZE = 50
  let inserted = 0
  let errors = 0

  for (let i = 0; i < agents.length; i += BATCH_SIZE) {
    const batch = agents.slice(i, i + BATCH_SIZE)
    const rows = batch.map((a) => ({
      id: a.id,
      name: a.name,
      era: a.era || '',
      title: a.title || '',
      tagline: a.tagline || '',
      avatar_gradient: a.avatarGradient || '',
      system_prompt: a.systemPrompt,
      topics: a.topics || [],
    }))

    const { error } = await supabase
      .from('agents')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })

    if (error) {
      console.error(`  批次 ${i / BATCH_SIZE + 1} 失败:`, error.message)
      errors += batch.length
    } else {
      inserted += batch.length
      console.log(`  批次 ${i / BATCH_SIZE + 1}: 成功 ${batch.length} 个 (累计 ${inserted})`)
    }
  }

  console.log(`\n完成: 成功 ${inserted}, 失败 ${errors}`)
}

main().catch(console.error)
