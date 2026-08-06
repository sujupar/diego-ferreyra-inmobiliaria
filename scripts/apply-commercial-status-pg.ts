/**
 * Aplica `20260806000001_property_commercial_status.sql` y VERIFICA:
 * las 4 columnas nuevas, el CHECK con los 5 valores, la tabla de eventos con
 * su índice y su RLS, y que el backfill alcanzó exactamente a las propiedades
 * con status='descartada' — ni una más.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-commercial-status-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const VALORES = ['disponible', 'reservada', 'vendida', 'dada_de_baja', 'descartada']

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const antes = await c.query(`
    SELECT (SELECT count(*) FROM properties)                          AS props,
           (SELECT count(*) FROM properties WHERE status='descartada') AS descartadas`)

  await c.query(readFileSync('supabase/migrations/20260806000001_property_commercial_status.sql', 'utf8'))

  const { rows: cols } = await c.query(`
    SELECT column_name, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='properties'
       AND column_name IN ('commercial_status','sold_price','sold_currency','sold_at')
     ORDER BY column_name`)
  const { rows: chk } = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid='public.properties'::regclass AND conname='properties_commercial_status_check'`)
  const { rows: tabla } = await c.query(`SELECT to_regclass('public.property_status_events') AS t`)
  const { rows: idx } = await c.query(`
    SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND indexname='idx_property_status_events_property'`)
  const { rows: rls } = await c.query(`
    SELECT relrowsecurity FROM pg_class WHERE oid='public.property_status_events'::regclass`)
  const despues = await c.query(`
    SELECT (SELECT count(*) FROM properties)                                    AS props,
           (SELECT count(*) FROM properties WHERE status='descartada')          AS descartadas,
           (SELECT count(*) FROM properties WHERE commercial_status='descartada') AS com_descartadas,
           (SELECT count(*) FROM properties WHERE commercial_status='disponible') AS disponibles,
           (SELECT count(*) FROM properties
             WHERE commercial_status NOT IN ('disponible','descartada'))        AS raras`)
  await c.end()

  const a = antes.rows[0], d = despues.rows[0]
  console.log(`propiedades ${a.props}→${d.props}`)
  console.log(`columnas nuevas: ${cols.map(r => r.column_name).join(', ')}`)
  console.log(`CHECK: ${chk[0]?.def ?? '(no existe)'}`)
  console.log(`tabla de eventos: ${tabla[0].t} · índice: ${idx[0]?.indexname ?? '(falta)'} · RLS: ${rls[0]?.relrowsecurity}`)
  console.log(`descartadas: status=${d.descartadas} · commercial=${d.com_descartadas} · disponibles=${d.disponibles}`)

  if (a.props !== d.props) throw new Error('¡ALERTA! cambió la cantidad de propiedades')
  if (cols.length !== 4) throw new Error(`faltan columnas: solo ${cols.length} de 4`)
  const cs = cols.find(r => r.column_name === 'commercial_status')
  if (cs?.is_nullable !== 'NO') throw new Error('commercial_status debería ser NOT NULL')
  if (!String(cs?.column_default ?? '').includes('disponible')) throw new Error("el default de commercial_status no es 'disponible'")
  for (const v of VALORES) {
    if (!chk[0]?.def?.includes(`'${v}'`)) throw new Error(`el CHECK no incluye '${v}'`)
  }
  if (!tabla[0].t) throw new Error('no se creó property_status_events')
  if (!idx[0]) throw new Error('falta el índice de property_status_events')
  if (rls[0]?.relrowsecurity !== true) throw new Error('property_status_events quedó sin RLS')
  if (Number(d.com_descartadas) !== Number(d.descartadas)) {
    throw new Error(`backfill inconsistente: ${d.descartadas} con status descartada vs ${d.com_descartadas} con commercial`)
  }
  if (Number(d.raras) !== 0) throw new Error(`${d.raras} propiedades quedaron con un estado inesperado`)

  console.log('\n✅ migración aplicada y verificada')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
