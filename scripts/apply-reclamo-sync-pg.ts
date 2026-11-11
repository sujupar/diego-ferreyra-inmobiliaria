/**
 * Aplica 20261111000002_reclamo_sync_listing.sql y la PRUEBA sin dejar rastros:
 * dentro de BEGIN…ROLLBACK sobre un listing real: reservar (true), reservar con
 * otro token (false), liberar con un token ajeno (no libera), liberar con el
 * propio, reservar de nuevo (true), y que ninguna otra clave de la metadata cambie.
 * APLICAR ANTES de deployar el código de portales/sincronizar. Correr:
 *   node --env-file=.env.local --import tsx scripts/apply-reclamo-sync-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20261111000002_reclamo_sync_listing.sql', 'utf8'))

  // Permisos: solo service_role puede ejecutarlas.
  const { rows: permisos } = await c.query(`
    SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS puede
      FROM pg_proc p CROSS JOIN pg_roles r
     WHERE p.proname IN ('reclamar_sync_listing', 'liberar_sync_listing')
       AND r.rolname IN ('anon', 'authenticated', 'service_role')`)
  for (const p of permisos) {
    const esperado = p.rolname === 'service_role'
    if (p.puede !== esperado) throw new Error(`permiso inesperado: ${p.rolname} ${p.puede ? 'puede' : 'no puede'} ejecutar ${p.proname}`)
  }

  const { rows: [pl] } = await c.query(`
    SELECT id, metadata FROM property_listings
     WHERE metadata->>'sync_en_curso' IS NULL
     ORDER BY updated_at DESC LIMIT 1`)
  if (!pl) throw new Error('no hay un listing sin reserva para probar')
  const limite = `now() - interval '3 minutes'`
  const reservar = async (token: string) =>
    (await c.query(`SELECT public.reclamar_sync_listing($1, $2, ${limite}) AS ok`, [pl.id, token])).rows[0].ok as boolean
  const liberar = (token: string) => c.query(`SELECT public.liberar_sync_listing($1, $2)`, [pl.id, token])
  const meta = async () => (await c.query(`SELECT metadata FROM property_listings WHERE id = $1`, [pl.id])).rows[0].metadata

  await c.query('BEGIN')
  try {
    if (!(await reservar('t1'))) throw new Error('la primera reserva debía dar true')
    if (await reservar('t2')) throw new Error('la segunda reserva (otro token) debía dar false')
    await liberar('t2')
    if ((await meta())?.sync_en_curso !== 't1') throw new Error('un token ajeno liberó la reserva')
    await liberar('t1')
    const tras = await meta()
    if (tras?.sync_en_curso !== undefined || tras?.sync_en_curso_desde !== undefined) throw new Error('liberar no quitó las claves')
    if (JSON.stringify(tras ?? {}) !== JSON.stringify(pl.metadata ?? {})) throw new Error('reservar/liberar tocó otras claves de la metadata')
    if (!(await reservar('t3'))) throw new Error('tras liberar, reservar de nuevo debía dar true')
    console.log('metadata con reserva:', JSON.stringify(await meta()))
  } finally {
    await c.query('ROLLBACK')
  }
  await c.end()
  console.log('OK: funciones aplicadas y verificadas (prueba revertida)')
}
main().catch(e => { console.error(e); process.exit(1) })
