/**
 * Aplica `20260911000001_cron_market_data_zonaprop_off.sql` (apaga el scraping de
 * tipos por barrio) y VERIFICA: que `market-data-zonaprop` ya no esté en cron.job y
 * que `market-data-core` SIGA programado (el PDF todavía usa stock y escrituras).
 * No borra datos.
 *
 * Correr: node --env-file=../../../.env.local --import tsx scripts/apply-market-data-zonaprop-off-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const antes = await c.query(`SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'market-data%' ORDER BY jobname`)
  console.log('antes:', antes.rows.map((r: { jobname: string; schedule: string }) => `${r.jobname} (${r.schedule})`).join(' · ') || 'ninguno')

  await c.query(readFileSync('supabase/migrations/20260911000001_cron_market_data_zonaprop_off.sql', 'utf8'))

  const despues = await c.query(`SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'market-data%' ORDER BY jobname`)
  const nombres = despues.rows.map((r: { jobname: string }) => r.jobname)
  console.log('después:', despues.rows.map((r: { jobname: string; schedule: string }) => `${r.jobname} (${r.schedule})`).join(' · ') || 'ninguno')
  if (nombres.includes('market-data-zonaprop')) throw new Error('¡ALERTA! market-data-zonaprop sigue programado')
  if (!nombres.includes('market-data-core')) throw new Error('¡ALERTA! market-data-core desapareció y el PDF lo necesita')

  const { rows: estado } = await c.query(`SELECT id, last_status, left(last_error, 60) AS nota FROM market_data_refresh_state ORDER BY id`)
  console.log('estado:', JSON.stringify(estado))
  const { rows: n } = await c.query(`SELECT count(*)::int AS filas FROM market_snapshot_neighborhood`)
  console.log(`filas por barrio conservadas: ${n[0].filas}`)
  await c.end()
  console.log('\n✅ zonaprop apagado; core sigue; datos intactos')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
