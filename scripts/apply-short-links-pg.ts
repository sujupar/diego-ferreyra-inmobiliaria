/**
 * Aplica `20260827000001_short_links.sql` y VERIFICA lo que importa:
 * que la tabla exista, que tenga RLS, y que el CHECK realmente rechace un
 * destino que no sea de WhatsApp — que es lo único que impide que
 * `inmodf.com.ar/r/xxx` se convierta en un redirector para phishing.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
    user:'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20260827000001_short_links.sql','utf8'))

  const { rows: tabla } = await c.query(
    `SELECT relrowsecurity AS rls FROM pg_class WHERE relname='short_links' AND relnamespace='public'::regnamespace`)
  if (tabla.length === 0) throw new Error('la tabla short_links no existe')
  console.log(`tabla short_links: existe · RLS ${tabla[0].rls ? 'ON ✓' : 'OFF ✗'}`)
  if (!tabla[0].rls) throw new Error('¡ALERTA! short_links quedó sin RLS')

  // El destino bueno entra.
  await c.query(`INSERT INTO short_links (code, target_url, source) VALUES ('__test1','https://wa.me/5491100000000?text=Hola','selftest')`)
  console.log('destino wa.me: aceptado ✓')

  // El destino malo NO entra: esta es la prueba que vale.
  let rechazado = false
  try {
    await c.query(`INSERT INTO short_links (code, target_url, source) VALUES ('__test2','https://banco-falso.com/login','selftest')`)
  } catch { rechazado = true }
  await c.query(`DELETE FROM short_links WHERE source='selftest'`)
  console.log(`destino ajeno: ${rechazado ? 'RECHAZADO por la base ✓' : 'ACEPTADO ✗'}`)
  if (!rechazado) throw new Error('¡ALERTA! el CHECK no frena destinos que no son de WhatsApp')

  const { rows: n } = await c.query('SELECT count(*)::int AS n FROM short_links')
  await c.end()
  console.log(`filas en short_links: ${n[0].n}`)
  console.log('\n✅ aplicada y verificada')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
