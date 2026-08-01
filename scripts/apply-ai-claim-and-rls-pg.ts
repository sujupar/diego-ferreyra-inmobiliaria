/**
 * Aplica los dos arreglos de la revisión adversarial que viven en la base:
 *
 *   20260803000004 → función atómica `claim_agent_message_slot` (el tope de
 *                    mensajes del agente dejaba de contar bien ante dos
 *                    webhooks concurrentes).
 *   20260803000005 → RLS de `conversation_ai_state` / `ai_agent_settings`
 *                    alineada con `whatsapp_messages` (antes cualquier
 *                    logueado no-abogado leía los resúmenes de IA de todos).
 *
 * Verifica DESPUÉS de aplicar: que las dos políticas quedaron en
 * `is_operations_user()`, que la función existe y NO es ejecutable por `anon`
 * ni `authenticated`, que el agente sigue APAGADO, y que no cambió ninguna
 * fila de mensajes, visitas ni estados de conversación.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
    user:'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()

  const antes = await c.query(`
    SELECT (SELECT count(*) FROM whatsapp_messages)      AS mensajes,
           (SELECT count(*) FROM property_visits)        AS visitas,
           (SELECT count(*) FROM conversation_ai_state)  AS estados`)

  await c.query(readFileSync('supabase/migrations/20260803000004_claim_agent_message_slot.sql','utf8'))
  await c.query(readFileSync('supabase/migrations/20260803000005_conversation_ai_state_rls.sql','utf8'))

  const despues = await c.query(`
    SELECT (SELECT count(*) FROM whatsapp_messages)      AS mensajes,
           (SELECT count(*) FROM property_visits)        AS visitas,
           (SELECT count(*) FROM conversation_ai_state)  AS estados`)

  const { rows: pols } = await c.query(`
    SELECT tablename, policyname, qual
      FROM pg_policies
     WHERE tablename IN ('conversation_ai_state','ai_agent_settings')
     ORDER BY tablename`)
  const { rows: fn } = await c.query(`
    SELECT p.proname,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_puede,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_puede,
           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_puede
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='claim_agent_message_slot'`)
  const { rows: cfg } = await c.query('SELECT scheduling_enabled FROM ai_agent_settings')
  await c.end()

  const a = antes.rows[0], d = despues.rows[0]
  console.log(`mensajes ${a.mensajes}→${d.mensajes} · visitas ${a.visitas}→${d.visitas} · estados de conversación ${a.estados}→${d.estados}`)
  for (const p of pols) console.log(`policy ${p.tablename}.${p.policyname}: ${p.qual}`)
  console.log(`función claim_agent_message_slot: ${fn.length ? 'existe' : 'NO EXISTE'}` +
    (fn.length ? ` · anon=${fn[0].anon_puede} authenticated=${fn[0].auth_puede} service_role=${fn[0].svc_puede}` : ''))
  console.log(`agente habilitado: ${cfg[0].scheduling_enabled}`)

  if (a.mensajes !== d.mensajes || a.visitas !== d.visitas || a.estados !== d.estados) {
    throw new Error('¡ALERTA! cambió la cantidad de filas')
  }
  if (!pols.every(p => String(p.qual).includes('is_operations_user'))) {
    throw new Error('alguna política quedó sin endurecer')
  }
  if (!fn.length) throw new Error('la función no quedó creada')
  if (fn[0].anon_puede || fn[0].auth_puede) throw new Error('la función quedó ejecutable desde el navegador')
  if (!fn[0].svc_puede) throw new Error('el backend no puede ejecutar la función')
  if (cfg[0].scheduling_enabled !== false) throw new Error('el agente NO debe quedar habilitado')
  console.log('\n✅ aplicadas y verificadas — nada cambió de contenido, el agente sigue APAGADO')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
