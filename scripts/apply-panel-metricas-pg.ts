/**
 * Aplica `20261104000003_panel_metricas.sql` (solo tablas y funciones NUEVAS) y
 * verifica que existan, que la RLS esté prendida y que las dos funciones de
 * lectura respondan. Idempotente: se puede correr de nuevo.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20261104000003_panel_metricas.sql', 'utf8'))
  const { rows: t } = await c.query(`SELECT relname, relrowsecurity FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname IN ('ventas','gastos_fijos','hitos_metricas','meta_reach_cache') ORDER BY 1`)
  const { rows: v } = await c.query(`SELECT count(*)::int n, coalesce(sum(visitas),0)::int visitas FROM get_panel_visitas('2026-10-01','2026-10-31')`)
  const { rows: vid } = await c.query(`SELECT count(*)::int n FROM get_panel_video('2026-01-01','2026-12-31')`)
  await c.end()
  for (const r of t) console.log(`  ${r.relname.padEnd(18)} RLS ${r.relrowsecurity ? 'sí' : 'NO'}`)
  console.log(`  get_panel_visitas (oct-26): ${v[0].n} filas, ${v[0].visitas} visitas`)
  console.log(`  get_panel_video (2026): ${vid[0].n} videos`)
  if (t.length !== 4 || t.some(r => !r.relrowsecurity)) throw new Error('Falta una tabla o su RLS')
  console.log('\n✅ aplicada')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
