/**
 * Aplica `20260803000006_ai_analysis_switch.sql`: el interruptor propio del
 * ANÁLISIS de IA (arranca apagado) y el apagado de `ai_scheduling_enabled` en
 * las propiedades existentes.
 *
 * Verifica que los TRES interruptores quedan apagados y que no cambió la
 * cantidad de filas de ninguna tabla del sistema. Es idempotente: el UPDATE
 * masivo de propiedades corre una sola vez (guarda `DO $$` en la migración).
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
    user:'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()

  const antes = await c.query(`
    SELECT (SELECT count(*) FROM properties)          AS props,
           (SELECT count(*) FROM whatsapp_messages)   AS mensajes,
           (SELECT count(*) FROM property_visits)     AS visitas,
           (SELECT count(*) FROM properties WHERE ai_scheduling_enabled) AS props_con_ia`)

  await c.query(readFileSync('supabase/migrations/20260803000006_ai_analysis_switch.sql','utf8'))

  const despues = await c.query(`
    SELECT (SELECT count(*) FROM properties)          AS props,
           (SELECT count(*) FROM whatsapp_messages)   AS mensajes,
           (SELECT count(*) FROM property_visits)     AS visitas,
           (SELECT count(*) FROM properties WHERE ai_scheduling_enabled) AS props_con_ia`)
  const { rows: cfg } = await c.query('SELECT analysis_enabled, scheduling_enabled, max_messages_per_conversation FROM ai_agent_settings')
  const { rows: def } = await c.query(`
    SELECT column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='properties' AND column_name='ai_scheduling_enabled'`)
  await c.end()

  const a = antes.rows[0], d = despues.rows[0]
  console.log(`propiedades ${a.props}→${d.props} · mensajes ${a.mensajes}→${d.mensajes} · visitas ${a.visitas}→${d.visitas}`)
  console.log(`propiedades con el agente habilitado: ${a.props_con_ia} → ${d.props_con_ia}  (default de la columna: ${def[0]?.column_default})`)
  console.log(`análisis habilitado: ${cfg[0].analysis_enabled} · agente que escribe: ${cfg[0].scheduling_enabled} · tope ${cfg[0].max_messages_per_conversation}`)

  if (a.props !== d.props || a.mensajes !== d.mensajes || a.visitas !== d.visitas) {
    throw new Error('¡ALERTA! cambió la cantidad de filas')
  }
  if (cfg[0].analysis_enabled !== false) throw new Error('el ANÁLISIS no debe quedar habilitado')
  if (cfg[0].scheduling_enabled !== false) throw new Error('el agente que escribe no debe quedar habilitado')
  if (Number(d.props_con_ia) !== 0) throw new Error('quedaron propiedades con el agente habilitado')
  if (def[0]?.column_default !== 'false') throw new Error('el default de ai_scheduling_enabled no quedó en false')
  console.log('\n✅ aplicada — los tres interruptores apagados, cero filas perdidas')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
