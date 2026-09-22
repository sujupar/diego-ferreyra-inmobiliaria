/**
 * Aplica `20260922000003_instagram_cuentas_de_prueba.sql` y VERIFICA el resultado.
 *
 * Aborta si la columna no quedó como `text[] NOT NULL`, o si los interruptores
 * globales aparecen prendidos: esta migración no los toca, así que verlos
 * prendidos significaría que alguien los cambió sin que nadie lo decidiera acá.
 *
 * Uso (desde la raíz del worktree):
 *   node --env-file=<ruta>/.env.local --import tsx scripts/apply-instagram-cuentas-prueba-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20260922000003_instagram_cuentas_de_prueba.sql'

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) {
    throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  }

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

    const { rows: [col] } = await c.query(
      `SELECT data_type, udt_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'instagram_ajustes'
          AND column_name = 'cuentas_de_prueba'`,
    )
    if (!col) throw new Error('la columna cuentas_de_prueba NO existe')
    if (col.udt_name !== '_text' || col.is_nullable !== 'NO') {
      throw new Error(`la columna quedó mal: ${JSON.stringify(col)}`)
    }
    console.log(`✓ cuentas_de_prueba: text[] NOT NULL, default ${col.column_default}`)

    const { rows: [fila] } = await c.query(
      `SELECT automatizacion_habilitada, dm_habilitado, cuentas_de_prueba
         FROM public.instagram_ajustes WHERE id = 'default'`,
    )
    if (!fila) throw new Error('no está la fila default de instagram_ajustes')
    console.log('✓ fila default:', JSON.stringify(fila))
    if (fila.automatizacion_habilitada || fila.dm_habilitado) {
      throw new Error('los interruptores globales están PRENDIDOS y esta migración no los toca: revisar quién los prendió')
    }
    console.log('✓ interruptores globales apagados')
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
