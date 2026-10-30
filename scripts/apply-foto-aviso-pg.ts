/**
 * Aplica `20261030000001_portal_inquiries_foto_aviso.sql` y la VERIFICA en UNA
 * transacción: si algo no cuadra, ROLLBACK y código 1. La escritura de prueba va
 * en SAVEPOINT y se deshace. Idempotente.
 *
 *   node --env-file=../../../.env.local --import tsx scripts/apply-foto-aviso-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    await c.query("SET lock_timeout = '5s'")
    await c.query('BEGIN')
    const antes = Number((await c.query('SELECT count(*) AS n FROM public.portal_inquiries')).rows[0].n)
    await c.query(readFileSync('supabase/migrations/20261030000001_portal_inquiries_foto_aviso.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const col = (await c.query(`SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='portal_inquiries' AND column_name='property_photo_url'`)).rows[0]
    ok(col?.data_type === 'text', 'existe portal_inquiries.property_photo_url (text)')
    const despues = Number((await c.query('SELECT count(*) AS n FROM public.portal_inquiries')).rows[0].n)
    ok(antes === despues, `no cambió la cantidad de consultas (${despues})`)

    const una = (await c.query('SELECT id FROM public.portal_inquiries LIMIT 1')).rows[0]?.id
    ok(!!una, 'hay al menos una consulta para probar')
    await c.query('SAVEPOINT mala')
    let rechazo = false
    try { await c.query(`UPDATE public.portal_inquiries SET property_photo_url='http://x.com/a.jpg' WHERE id=$1`, [una]) } catch { rechazo = true }
    await c.query('ROLLBACK TO SAVEPOINT mala')
    ok(rechazo, 'la base rechaza una foto que no es https')
    await c.query('SAVEPOINT buena')
    await c.query(`UPDATE public.portal_inquiries SET property_photo_url='https://imgar.zonapropcdn.com/avisos/a.jpg' WHERE id=$1`, [una])
    await c.query('ROLLBACK TO SAVEPOINT buena')
    console.log('✓ acepta una foto https (deshecho)')

    await c.query('COMMIT')
    console.log('COMMIT: aplicada y verificada')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  } finally {
    await c.end()
  }
}

main()
