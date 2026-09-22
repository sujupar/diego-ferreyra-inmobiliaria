/**
 * Aplica `20260922000005_reels_frases_publicas.sql` y VERIFICA el resultado.
 *
 * Aborta si faltan las columnas, si un reel existente quedó sin frases, o si la
 * base NO rechaza de verdad 4 frases o una frase vacía (se prueba dentro de una
 * transacción que se deshace: no queda nada escrito).
 *
 * Uso (desde la raíz del worktree):
 *   node --env-file=<ruta>/.env.local --import tsx scripts/apply-reels-frases-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20260922000005_reels_frases_publicas.sql'

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

    const { rows: cols } = await c.query(
      `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'property_reels'
          AND column_name IN ('respuestas_con_privado', 'respuestas_sin_privado')`,
    )
    if (cols.length !== 2 || cols.some((x) => x.udt_name !== '_text' || x.is_nullable !== 'NO')) {
      throw new Error(`columnas mal: ${JSON.stringify(cols)}`)
    }
    console.log('✓ columnas text[] NOT NULL')

    const { rows: reels } = await c.query(
      `SELECT id, respuestas_con_privado, respuestas_sin_privado FROM public.property_reels`,
    )
    for (const r of reels) {
      if (!r.respuestas_con_privado?.length || !r.respuestas_sin_privado?.length) {
        throw new Error(`el reel ${r.id} quedó sin frases`)
      }
    }
    console.log(`✓ ${reels.length} reel(es) existentes con sus frases de fábrica`, reels[0] ?? '')

    if (reels[0]) {
      for (const [nombre, valor] of [
        ['4 frases', ['a1', 'b2', 'c3', 'd4']],
        ['una frase vacía', ['hola', '  ']],
        ['ninguna frase', []],
      ] as const) {
        await c.query('BEGIN')
        try {
          await c.query(`UPDATE public.property_reels SET respuestas_con_privado = $1 WHERE id = $2`, [valor, reels[0].id])
          throw new Error(`la base ACEPTÓ ${nombre}: el CHECK no funciona`)
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
