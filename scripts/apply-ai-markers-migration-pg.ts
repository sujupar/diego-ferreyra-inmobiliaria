/**
 * Aplica las DOS marcas de "esto lo hizo la IA" vía session pooler. ADITIVAS:
 * solo agregan columnas con DEFAULT false + índices parciales. Ninguna fila
 * existente cambia de contenido.
 *
 *   20260803000002 → whatsapp_messages.ai_generated
 *   20260803000003 → property_visits.created_by_ai
 *
 * Verifica antes/después que NO cambió la cantidad de mensajes ni de visitas,
 * y que el agente sigue APAGADO.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
    user:'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()

  const { rows: msgAntes } = await c.query('SELECT count(*)::int AS n FROM whatsapp_messages')
  const { rows: visAntes } = await c.query('SELECT count(*)::int AS n FROM property_visits')

  await c.query(readFileSync('supabase/migrations/20260803000002_whatsapp_messages_ai_generated.sql','utf8'))
  await c.query(readFileSync('supabase/migrations/20260803000003_property_visits_created_by_ai.sql','utf8'))

  const { rows: msgDespues } = await c.query('SELECT count(*)::int AS n FROM whatsapp_messages')
  const { rows: visDespues } = await c.query('SELECT count(*)::int AS n FROM property_visits')
  const { rows: colMsg } = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='whatsapp_messages' AND column_name='ai_generated'`)
  const { rows: colVis } = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='property_visits' AND column_name='created_by_ai'`)
  // Ninguna fila vieja puede quedar marcada como "de la IA".
  const { rows: marcados } = await c.query('SELECT count(*)::int AS n FROM whatsapp_messages WHERE ai_generated')
  const { rows: visMarcadas } = await c.query('SELECT count(*)::int AS n FROM property_visits WHERE created_by_ai')
  const { rows: cfg } = await c.query('SELECT scheduling_enabled FROM ai_agent_settings')
  await c.end()

  console.log(`whatsapp_messages: ${msgAntes[0].n} antes → ${msgDespues[0].n} después  (columna ai_generated: ${colMsg.length ? 'sí' : 'NO'})`)
  console.log(`property_visits:   ${visAntes[0].n} antes → ${visDespues[0].n} después  (columna created_by_ai: ${colVis.length ? 'sí' : 'NO'})`)
  console.log(`marcados como IA: ${marcados[0].n} mensajes, ${visMarcadas[0].n} visitas`)
  console.log(`agente habilitado: ${cfg[0].scheduling_enabled}`)

  if (msgAntes[0].n !== msgDespues[0].n) throw new Error('¡ALERTA! cambió la cantidad de mensajes')
  if (visAntes[0].n !== visDespues[0].n) throw new Error('¡ALERTA! cambió la cantidad de visitas')
  if (!colMsg.length || !colVis.length) throw new Error('alguna columna no quedó creada')
  if (marcados[0].n !== 0 || visMarcadas[0].n !== 0) throw new Error('¡ALERTA! filas viejas quedaron marcadas como IA')
  if (cfg[0].scheduling_enabled !== false) throw new Error('el agente NO debe quedar habilitado')
  console.log('\n✅ aplicadas y verificadas — nada cambió de contenido, el agente sigue APAGADO')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
