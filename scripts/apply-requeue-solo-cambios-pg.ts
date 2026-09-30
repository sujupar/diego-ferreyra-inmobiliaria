/**
 * Aplica 20260930000001_requeue_solo_cambios.sql y la PRUEBA sin dejar rastros:
 * dentro de BEGIN…ROLLBACK cambia el precio y el título de una propiedad con
 * listing publicado y verifica que cambios_ficha = ["precio"] (el título ya no dispara).
 * Correr: node --env-file=.env.local --import tsx scripts/apply-requeue-solo-cambios-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20260930000001_requeue_solo_cambios.sql', 'utf8'))
  const { rows: [def] } = await c.query(`SELECT pg_get_functiondef('public.requeue_listings_on_update'::regproc) AS d`)
  if (!def.d.includes('cambios_ficha') || def.d.includes('OLD.title')) throw new Error('la función no quedó actualizada')

  // Si el listing elegido ya tenía cambios_ficha/needs_update de ANTES (una
  // marca vieja que quedó pendiente), el UPDATE de la prueba no puede probar
  // nada: el metadata leído después bien podría ser el rastro previo, no el
  // que dejó este UPDATE. Por eso se exige que arranque limpio.
  const { rows: [pl] } = await c.query(`
    SELECT pl.id, pl.property_id FROM property_listings pl JOIN properties p ON p.id = pl.property_id
     WHERE pl.status = 'published' AND p.status = 'approved'
       AND pl.metadata->'cambios_ficha' IS NULL
       AND COALESCE((pl.metadata->>'needs_update')::boolean, false) = false
     LIMIT 1`)
  if (!pl) throw new Error('no hay listing publicado y limpio (sin cambios_ficha/needs_update previos) para probar')
  await c.query('BEGIN')
  try {
    await c.query(`UPDATE properties SET asking_price = asking_price + 1, title = coalesce(title,'') || ' ' WHERE id = $1`, [pl.property_id])
    const { rows: [m] } = await c.query(`SELECT metadata FROM property_listings WHERE id = $1`, [pl.id])
    console.log('metadata tras el cambio:', JSON.stringify(m.metadata))
    if (JSON.stringify(m.metadata.cambios_ficha) !== '["precio"]') throw new Error('cambios_ficha inesperado')
    if (m.metadata.needs_update !== true) throw new Error('needs_update no quedó en true')
  } finally {
    await c.query('ROLLBACK')
  }
  await c.end()
  console.log('OK: trigger aplicado y verificado (prueba revertida)')
}
main().catch(e => { console.error(e); process.exit(1) })
