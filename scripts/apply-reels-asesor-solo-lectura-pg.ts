/**
 * Aplica `20260922000004_reels_asesor_solo_lectura.sql` y VERIFICA el resultado.
 *
 * Aborta si alguna de las dos políticas del asesor sigue permitiendo escribir,
 * si falta el tope de las palabras, o si la base NO rechaza de verdad una lista
 * de más de 200 caracteres (se prueba dentro de una transacción que se deshace:
 * no queda nada escrito).
 *
 * Uso (desde la raíz del worktree):
 *   node --env-file=<ruta>/.env.local --import tsx scripts/apply-reels-asesor-solo-lectura-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20260922000004_reels_asesor_solo_lectura.sql'

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

    const { rows: politicas } = await c.query(
      `SELECT tablename, policyname, cmd FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('property_reels', 'reel_comentarios')
        ORDER BY tablename, policyname`,
    )
    console.table(politicas)
    for (const nombre of ['reels_asesor_own', 'reel_comentarios_asesor']) {
      const p = politicas.find((x) => x.policyname === nombre)
      if (!p) throw new Error(`falta la política ${nombre}`)
      if (p.cmd !== 'SELECT') throw new Error(`${nombre} sigue siendo ${p.cmd}: el asesor todavía puede escribir`)
    }
    console.log('✓ el asesor solo puede leer')

    const { rows: [tope] } = await c.query(
      `SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.property_reels'::regclass AND conname = 'property_reels_palabra_clave_largo'`,
    )
    if (!tope) throw new Error('falta el CHECK property_reels_palabra_clave_largo')

    // La prueba de verdad: que la base RECHACE una lista larga. Un CHECK solo se
    // evalúa sobre filas que se tocan, así que se usa un reel real dentro de una
    // transacción que se deshace siempre: no queda nada escrito.
    const { rows: [unReel] } = await c.query(`SELECT id FROM public.property_reels LIMIT 1`)
    if (unReel) {
      await c.query('BEGIN')
      try {
        await c.query(`UPDATE public.property_reels SET palabra_clave = $1 WHERE id = $2`, ['x'.repeat(201), unReel.id])
        throw new Error('la base ACEPTÓ una lista de 201 caracteres: el tope no funciona')
      } catch (e) {
        const codigo = (e as { code?: string }).code
        if (codigo !== '23514') throw e
        console.log('✓ la base rechaza una lista de más de 200 caracteres (23514)')
      } finally {
        await c.query('ROLLBACK')
      }
    } else {
      console.log('(sin reels para probar el tope en vivo; el CHECK existe)')
    }
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
