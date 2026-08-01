/** Aplica la migración del agente de IA vía session pooler. ADITIVA. */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
async function main() {
  const c = new Client({ host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
    user:'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()
  const { rows: antes } = await c.query('SELECT count(*)::int AS n FROM whatsapp_messages')
  await c.query(readFileSync('supabase/migrations/20260803000001_conversation_ai_state.sql','utf8'))
  const { rows: cols } = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='conversation_ai_state' ORDER BY ordinal_position`)
  const { rows: cfg } = await c.query('SELECT scheduling_enabled, max_messages_per_conversation FROM ai_agent_settings')
  const { rows: despues } = await c.query('SELECT count(*)::int AS n FROM whatsapp_messages')
  console.log(`conversation_ai_state: ${cols.length} columnas`)
  console.log(`agente habilitado: ${cfg[0].scheduling_enabled}  (tope ${cfg[0].max_messages_per_conversation} mensajes)`)
  console.log(`mensajes de WhatsApp: ${antes[0].n} antes → ${despues[0].n} después`)
  await c.end()
  if (antes[0].n !== despues[0].n) throw new Error('¡ALERTA! cambió la cantidad de mensajes')
  if (cfg[0].scheduling_enabled !== false) throw new Error('el agente NO debe arrancar habilitado')
  console.log('\n✅ aplicada y verificada — el agente arranca APAGADO')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
