/**
 * Aplica `20260808000001_funnel_lead_jobs.sql`: la cola durable de avisos del
 * embudo y la reserva atómica del envío.
 *
 * Es 100% ADITIVA. Este script lo verifica: aborta si cambió la cantidad de
 * filas de cualquier tabla del camino del lead, si alguna fila vieja de
 * `funnel_lead_submissions` quedó fuera de 'complete' (dejaría de contar como
 * conversión), o si falta cualquiera de las piezas nuevas.
 *
 * ENSAYO (recomendado como paso previo): con `--ensayo` corre TODO adentro de una
 * transacción y hace ROLLBACK. Sirve para confirmar que el SQL es válido sin
 * dejar nada aplicado — un error de sintaxis aparece igual, pero la base queda
 * exactamente como estaba.
 *
 * Correr: npx tsx --env-file=.env.local scripts/apply-funnel-jobs-pg.ts [--ensayo]
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20260808000001_funnel_lead_jobs.sql'

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) {
    throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  }
  const ensayo = process.argv.includes('--ensayo')

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  if (ensayo) {
    console.log('— ENSAYO: todo adentro de una transacción que se revierte al final —')
    await c.query('BEGIN')
  }

  const conteos = `
    SELECT (SELECT count(*) FROM funnel_lead_submissions) AS envios,
           (SELECT count(*) FROM deals)                   AS deals,
           (SELECT count(*) FROM contacts)                AS contactos,
           (SELECT count(*) FROM tasks)                   AS tareas`
  const { rows: [antes] } = await c.query(conteos)

  await c.query(readFileSync(MIGRACION, 'utf8'))

  const { rows: [despues] } = await c.query(conteos)
  const { rows: [estados] } = await c.query(`
    SELECT count(*) FILTER (WHERE status = 'complete') AS completos,
           count(*) FILTER (WHERE status <> 'complete') AS otros
      FROM funnel_lead_submissions`)
  const { rows: [tabla] } = await c.query(`
    SELECT to_regclass('public.funnel_lead_jobs') IS NOT NULL AS existe,
           (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.funnel_lead_jobs'::regclass) AS rls,
           EXISTS (
             SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.funnel_lead_jobs'::regclass
                AND contype = 'u'
                AND pg_get_constraintdef(oid) ILIKE '%(submission_id, kind)%'
           ) AS unica`)
  const { rows: funciones } = await c.query(`
    SELECT proname, prosecdef
      FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('reservar_envio_embudo', 'completar_envio_embudo')
     ORDER BY proname`)

  if (ensayo) await c.query('ROLLBACK')
  await c.end()

  console.log(`envíos ${antes.envios}→${despues.envios} · deals ${antes.deals}→${despues.deals} · contactos ${antes.contactos}→${despues.contactos} · tareas ${antes.tareas}→${despues.tareas}`)
  console.log(`envíos por estado: complete=${estados.completos} · otros=${estados.otros}`)
  console.log(`funnel_lead_jobs: existe=${tabla.existe} · rls=${tabla.rls} · unique(submission_id,kind)=${tabla.unica}`)
  console.log('funciones:', funciones.map(f => `${f.proname}(security_definer=${f.prosecdef})`).join(' · ') || '(ninguna)')

  if (antes.envios !== despues.envios || antes.deals !== despues.deals ||
      antes.contactos !== despues.contactos || antes.tareas !== despues.tareas) {
    throw new Error('¡ALERTA! cambió la cantidad de filas — la migración debía ser aditiva')
  }
  if (Number(estados.otros) !== 0) {
    throw new Error('quedaron envíos históricos fuera de "complete": dejarían de contar como conversión')
  }
  if (tabla.existe !== true) throw new Error('no quedó creada la tabla funnel_lead_jobs')
  if (tabla.rls !== true) throw new Error('funnel_lead_jobs quedó SIN row level security')
  if (tabla.unica !== true) throw new Error('falta la UNIQUE (submission_id, kind): el encolado dejaría de ser idempotente')
  if (funciones.length !== 2) throw new Error('no quedaron las dos funciones (reservar/completar)')
  if (funciones.some(f => f.prosecdef !== true)) throw new Error('alguna función no quedó SECURITY DEFINER')

  if (ensayo) {
    console.log('\n✅ ENSAYO OK — el SQL es válido y la base quedó intacta (rollback hecho).')
    console.log('   Para aplicarla de verdad, correr el script SIN --ensayo.')
    return
  }
  console.log('\n✅ aplicada — cola creada, reserva atómica disponible, cero filas tocadas')
  console.log('   El job de pg_cron va DESPUÉS del deploy: scripts/apply-cron-funnel-side-effects-pg.ts')
}

main().catch(e => { console.error('❌', e instanceof Error ? e.message : e); process.exit(1) })
