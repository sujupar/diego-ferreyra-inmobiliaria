/**
 * Aplica 20261111000001_requeue_sin_precio.sql y la PRUEBA sin dejar rastros:
 * dentro de BEGIN…ROLLBACK cambia el precio (NO debe marcar nada) y luego las
 * expensas (debe dejar cambios_ficha = ["expensas"] y needs_update = true).
 * APLICAR DESPUÉS de deployar. Correr:
 *   node --env-file=.env.local --import tsx scripts/apply-requeue-sin-precio-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20261111000001_requeue_sin_precio.sql', 'utf8'))
  const { rows: [def] } = await c.query(`SELECT pg_get_functiondef('public.requeue_listings_on_update'::regproc) AS d`)
  if (!def.d.includes('photos') || !def.d.includes('expensas') || def.d.includes('asking_price')) {
    throw new Error('la función no quedó actualizada (debe tener photos y expensas, y NO asking_price)')
  }

  // El listing elegido debe arrancar limpio: una marca vieja contaminaría la prueba.
  const { rows: [pl] } = await c.query(`
    SELECT pl.id, pl.property_id FROM property_listings pl JOIN properties p ON p.id = pl.property_id
     WHERE pl.status = 'published' AND p.status = 'approved'
       AND pl.metadata->'cambios_ficha' IS NULL
       AND COALESCE((pl.metadata->>'needs_update')::boolean, false) = false
     LIMIT 1`)
  if (!pl) throw new Error('no hay listing publicado y limpio (sin cambios_ficha/needs_update previos) para probar')
  await c.query('BEGIN')
  try {
    await c.query(`UPDATE properties SET asking_price = asking_price + 1 WHERE id = $1`, [pl.property_id])
    const { rows: [a] } = await c.query(`SELECT metadata FROM property_listings WHERE id = $1`, [pl.id])
    console.log('metadata tras cambiar el precio:', JSON.stringify(a.metadata))
    if (a.metadata?.needs_update === true || a.metadata?.cambios_ficha != null) {
      throw new Error('el cambio de precio todavía marca el listing para reenviar')
    }

    await c.query(`UPDATE properties SET expensas = COALESCE(expensas, 0) + 1 WHERE id = $1`, [pl.property_id])
    const { rows: [b] } = await c.query(`SELECT metadata FROM property_listings WHERE id = $1`, [pl.id])
    console.log('metadata tras cambiar expensas:', JSON.stringify(b.metadata))
    if (JSON.stringify(b.metadata?.cambios_ficha) !== '["expensas"]') throw new Error('cambios_ficha inesperado tras expensas')
    if (b.metadata.needs_update !== true) throw new Error('needs_update no quedó en true tras expensas')
  } finally {
    await c.query('ROLLBACK')
  }
  await c.end()
  console.log('OK: trigger aplicado y verificado (prueba revertida)')
}
main().catch(e => { console.error(e); process.exit(1) })
