import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
function loadEnv() { const p='.env.local'; if(!fs.existsSync(p))return; for(const l of fs.readFileSync(p,'utf-8').split(/\r?\n/)){const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(!m||process.env[m[1]])continue;let v=m[2].trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);process.env[m[1]]=v}}
loadEnv()
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
async function main() {
  console.log('=== email_report_log ALL TIME (every record) ===')
  const { data } = await s.from('email_report_log').select('sent_at,report_type,status,error_message,recipients').order('sent_at', { ascending: true })
  console.log(`Total: ${data?.length} records`)
  const byType: Record<string, { first: string; last: string; sent: number; failed: number }> = {}
  for (const r of data || []) {
    if (!byType[r.report_type]) byType[r.report_type] = { first: r.sent_at, last: r.sent_at, sent: 0, failed: 0 }
    byType[r.report_type].last = r.sent_at
    if (r.status === 'sent') byType[r.report_type].sent++; else byType[r.report_type].failed++
  }
  for (const [t, d] of Object.entries(byType)) console.log(`  ${t}: first=${d.first} last=${d.last} sent=${d.sent} failed=${d.failed}`)

  console.log('\n=== últimos envíos failed ===')
  const { data: failed } = await s.from('email_report_log').select('*').neq('status', 'sent').order('sent_at', { ascending: false }).limit(10)
  for (const r of failed || []) {
    console.log(`  ${r.sent_at}  [${r.status}]  ${r.report_type}  err: ${r.error_message?.slice(0, 200)}`)
  }

  console.log('\n=== email_log (transactional) ===')
  const { data: tlog, error: te } = await s.from('email_log').select('*').order('created_at', { ascending: false }).limit(20)
  if (te) { console.log('  table missing:', te.message); return }
  console.log(`Total recent: ${tlog?.length}`)
  for (const r of (tlog || []).slice(0, 15)) console.log(`  ${r.created_at}  [${r.status}]  ${r.kind || r.type}  to: ${JSON.stringify(r.to).slice(0,60)}  err: ${(r.error || '').slice(0,80)}`)
}
main().catch(e => console.error(e))
