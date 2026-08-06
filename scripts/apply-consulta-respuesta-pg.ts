/**
 * Aplica `20260806000002_consulta_respuesta.sql` y deja el sistema en MODO
 * PRUEBA con el número del dueño: aunque se prenda, no le escribe a nadie más.
 *
 * Aborta si el interruptor quedara prendido: eso lo decide una persona.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const TEST_PHONE = '573107822955'

async function main() {
  const c = new Client({ host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
    user:'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()
  const { rows: antes } = await c.query('SELECT count(*)::int AS n FROM portal_inquiries')
  await c.query(readFileSync('supabase/migrations/20260806000002_consulta_respuesta.sql','utf8'))
  await c.query('UPDATE ai_agent_settings SET consulta_test_phones = $1::text[] WHERE consulta_test_phones = \'{}\'', [[TEST_PHONE]])
  const { rows: cfg } = await c.query('SELECT consulta_respuesta_enabled, consulta_test_phones FROM ai_agent_settings')
  const { rows: despues } = await c.query('SELECT count(*)::int AS n FROM portal_inquiries')
  await c.end()
  console.log(`consultas: ${antes[0].n} antes → ${despues[0].n} después`)
  console.log(`respuesta automática: ${cfg[0].consulta_respuesta_enabled}`)
  console.log(`modo prueba, solo estos números: ${JSON.stringify(cfg[0].consulta_test_phones)}`)
  if (antes[0].n !== despues[0].n) throw new Error('¡ALERTA! cambió la cantidad de consultas')
  if (cfg[0].consulta_respuesta_enabled !== false) throw new Error('no debe quedar prendido')
  if (!cfg[0].consulta_test_phones?.length) throw new Error('la lista de prueba quedó vacía')
  console.log('\n✅ aplicada — apagada, y con la lista de prueba puesta')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
