/**
 * Aplica `20260919000003_heatmap_clics_por_etapa.sql` y VERIFICA lo que importa:
 * que la suma de clics que devuelve `heatmap_section_stats` deje de superar a los
 * clics REALES de cada página (antes los de los registrados se repetían una vez por
 * etapa). Mide antes y después, y aborta si después sigue habiendo inflación.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-heatmap-clics-por-etapa-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const DESDE = '2026-06-01T00:00:00Z'
const HASTA = '2027-01-01T00:00:00Z'

async function medir(c: Client) {
  const { rows } = await c.query(
    `with fn as (
       select page, sum(clicks)::int as segun_funcion
       from public.heatmap_section_stats($1, $2) group by page
     ), reales as (
       select page, count(*)::int as reales
       from public.heatmap_clicks
       where created_at >= $1 and created_at < $2 and section is not null
       group by page
     )
     select coalesce(fn.page, reales.page) as page,
            coalesce(fn.segun_funcion, 0) as segun_funcion,
            coalesce(reales.reales, 0) as reales
     from fn full join reales using (page) order by 1`,
    [DESDE, HASTA],
  )
  return rows as { page: string; segun_funcion: number; reales: number }[]
}

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()

  console.log('ANTES de la migración:')
  console.table(await medir(c))

  await c.query(readFileSync('supabase/migrations/20260919000003_heatmap_clics_por_etapa.sql', 'utf8'))

  const despues = await medir(c)
  console.log('DESPUÉS de la migración:')
  console.table(despues)

  const inflados = despues.filter((r) => r.segun_funcion > r.reales)
  await c.end()
  if (inflados.length) throw new Error('¡ALERTA! sigue habiendo páginas con más clics que los reales: ' + inflados.map((r) => r.page).join(', '))
  console.log('\n✅ aplicada y verificada: ninguna página muestra más clics que los reales')
  console.log('(puede mostrar MENOS: un clic en una sección que esa sesión no llegó a registrar como sección no se cuenta — igual que antes)')
}
main().catch((e) => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
