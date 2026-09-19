/**
 * Aplica `20260919000004_video_key_landing_b.sql` y VERIFICA lo que importa: que bajo
 * la clave de la landing A no quede NINGÚN video de 711 s (el de la B), que bajo la
 * clave nueva no haya NINGUNO de 196 s (el de la A), y que no se haya perdido ni
 * duplicado ninguna fila. Mide antes y después y aborta si algo no cuadra.
 *
 * No borra nada: reetiqueta. Se puede correr las veces que sea.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-video-key-landing-b-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function medir(c: Client) {
  const { rows } = await c.query(
    `select video_key,
            count(*)::int as filas,
            count(*) filter (where duration_s > 400)::int as video_largo_711s,
            count(*) filter (where duration_s <= 400)::int as video_corto_196s,
            count(*) filter (where duration_s is null)::int as sin_duracion
     from public.video_view_state
     where video_key in ('hero-tasacion', 'hero-tasacion-neta')
     group by 1 order by 1`,
  )
  return rows as { video_key: string; filas: number; video_largo_711s: number; video_corto_196s: number; sin_duracion: number }[]
}
const total = (r: { filas: number }[]) => r.reduce((a, x) => a + x.filas, 0)

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()

  const antes = await medir(c)
  console.log('ANTES:'); console.table(antes)

  const r = await c.query(readFileSync('supabase/migrations/20260919000004_video_key_landing_b.sql', 'utf8'))
  console.log(`filas reetiquetadas en esta corrida: ${r.rowCount ?? 0}`)

  const despues = await medir(c)
  console.log('DESPUÉS:'); console.table(despues)
  await c.end()

  const a = despues.find((x) => x.video_key === 'hero-tasacion')
  const b = despues.find((x) => x.video_key === 'hero-tasacion-neta')
  if (total(antes) !== total(despues)) throw new Error(`¡ALERTA! cambió la cantidad de filas: ${total(antes)} → ${total(despues)}`)
  if (a && a.video_largo_711s > 0) throw new Error(`¡ALERTA! quedan ${a.video_largo_711s} videos de la B bajo la clave de la A`)
  if (b && b.video_corto_196s > 0) throw new Error(`¡ALERTA! hay ${b.video_corto_196s} videos de la A bajo la clave de la B`)
  console.log('\n✅ aplicada y verificada: ninguna fila perdida, y cada clave tiene solo SU video')
}
main().catch((e) => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
