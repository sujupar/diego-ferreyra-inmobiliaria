/**
 * Aplica `20260919000003_mapa_lugares.sql` (PostGIS + tablas + función, aditivo)
 * y verifica cada pieza, incluida una llamada real a la función.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-mapa-lugares-pg.ts
 * (requiere `pg`: npm i --no-save pg)
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  const { rows: antes } = await c.query('SELECT count(*)::int AS n FROM properties')
  await c.query(readFileSync('supabase/migrations/20260919000003_mapa_lugares.sql', 'utf8'))
  const { rows: ext } = await c.query("SELECT extversion FROM pg_extension WHERE extname = 'postgis'")
  const { rows: tablas } = await c.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('mapa_lugares','mapa_celdas') AND relkind = 'r'")
  const { rows: idx } = await c.query("SELECT indexname FROM pg_indexes WHERE tablename = 'mapa_lugares' AND indexname = 'idx_mapa_lugares_ubicacion'")
  const { rows: prueba } = await c.query(`SELECT count(*)::int AS n FROM lugares_cercanos(-34.61, -58.39, '{"subte":1500}'::jsonb)`)
  const { rows: permisos } = await c.query("SELECT has_function_privilege('anon', 'lugares_cercanos(double precision, double precision, jsonb)', 'EXECUTE') AS anon")
  const { rows: despues } = await c.query('SELECT count(*)::int AS n FROM properties')
  await c.end()
  console.log(`postgis: ${ext[0]?.extversion ?? 'NO'}`)
  console.log(`tablas: ${tablas.map(t => `${t.relname} (RLS ${t.relrowsecurity ? 'sí' : 'NO'})`).join(', ')}`)
  console.log(`índice GiST: ${idx.length ? 'sí' : 'NO'} · función responde: ${prueba[0].n} filas (tabla vacía todavía) · anon puede ejecutarla: ${permisos[0].anon}`)
  if (!ext[0]) throw new Error('PostGIS no quedó activado')
  if (tablas.length !== 2 || tablas.some(t => !t.relrowsecurity)) throw new Error('faltan tablas o RLS')
  if (!idx.length) throw new Error('falta el índice GiST')
  if (permisos[0].anon) throw new Error('anon NO debería poder ejecutar la función')
  if (antes[0].n !== despues[0].n) throw new Error('¡ALERTA! cambió la cantidad de propiedades')
  console.log('\n✅ migración aplicada y verificada')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
