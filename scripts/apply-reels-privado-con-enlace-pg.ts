/**
 * Aplica `20260923000001_reels_privado_con_enlace.sql` y VERIFICA el resultado:
 * el default del botón, que ningún reel quedó con los textos viejos de fábrica,
 * y que la base rechace de verdad un privado de 641 o un botón de 21 (dentro de
 * una transacción que se deshace).
 *
 * Uso (desde la raíz del worktree):
 *   node --env-file=<ruta>/.env.local --import tsx scripts/apply-reels-privado-con-enlace-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20260923000001_reels_privado_con_enlace.sql'

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    await c.query(readFileSync(MIGRACION, 'utf8'))
    console.log('migración aplicada')

    const { rows: [def] } = await c.query(
      `SELECT column_default FROM information_schema.columns
        WHERE table_schema='public' AND table_name='property_reels' AND column_name='dm_boton'`,
    )
    if (!String(def?.column_default).includes('Ver la propiedad')) throw new Error(`default del botón mal: ${def?.column_default}`)
    console.log('✓ default del botón:', def.column_default)

    const { rows: viejos } = await c.query(
      `SELECT id FROM public.property_reels WHERE dm_boton = 'Sí, pasámela' OR dm_texto LIKE 'Hola! Vi que comentaste en el reel.%'`,
    )
    if (viejos.length) throw new Error(`quedaron ${viejos.length} reels con los textos viejos`)
    const { rows: reels } = await c.query(`SELECT id, dm_boton, dm_texto FROM public.property_reels`)
    console.log('✓ reels con los textos nuevos:', reels)

    if (reels[0]) {
      for (const [nombre, sql, valor] of [
        ['un privado de 641', `UPDATE public.property_reels SET dm_texto = $1 WHERE id = $2`, 'x'.repeat(641)],
        ['un botón de 21', `UPDATE public.property_reels SET dm_boton = $1 WHERE id = $2`, 'x'.repeat(21)],
      ] as const) {
        await c.query('BEGIN')
        try {
          await c.query(sql, [valor, reels[0].id])
          throw new Error(`la base ACEPTÓ ${nombre}`)
        } catch (e) {
          if ((e as { code?: string }).code !== '23514') throw e
          console.log(`✓ la base rechaza ${nombre} (23514)`)
        } finally {
          await c.query('ROLLBACK')
        }
      }
    }
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
