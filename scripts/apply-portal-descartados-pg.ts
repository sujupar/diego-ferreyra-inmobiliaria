/**
 * Aplica `20260925000001_portal_emails_descartados.sql` y VERIFICA lo que
 * importa: que la tabla exista, que tenga RLS, y que se pueda anotar dos veces
 * el mismo correo sin romper (el cron vuelve a ver el mismo mensaje mientras
 * siga dentro de su ventana de búsqueda).
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
    user:'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20260925000001_portal_emails_descartados.sql','utf8'))

  const { rows: tabla } = await c.query(
    `SELECT relrowsecurity AS rls FROM pg_class WHERE relname='portal_emails_descartados' AND relnamespace='public'::regnamespace`)
  if (tabla.length === 0) throw new Error('la tabla no existe')
  console.log(`tabla portal_emails_descartados: existe · RLS ${tabla[0].rls ? 'ON ✓' : 'OFF ✗'}`)
  if (!tabla[0].rls) throw new Error('¡ALERTA! quedó sin RLS')

  const { rows: pol } = await c.query(
    `SELECT polname FROM pg_policy WHERE polrelid='public.portal_emails_descartados'::regclass`)
  console.log('políticas:', pol.map(p => p.polname).join(', ') || '(ninguna)')

  // Anotar el mismo correo dos veces no puede romper el cron.
  await c.query(`INSERT INTO portal_emails_descartados (gmail_message_id, portal, asunto, motivo)
                 VALUES ('__selftest','argenprop','prueba','prueba de idempotencia')
                 ON CONFLICT (gmail_message_id) DO NOTHING`)
  await c.query(`INSERT INTO portal_emails_descartados (gmail_message_id, portal, asunto, motivo)
                 VALUES ('__selftest','argenprop','prueba','prueba de idempotencia')
                 ON CONFLICT (gmail_message_id) DO NOTHING`)
  const { rows: n } = await c.query(`SELECT count(*)::int AS n FROM portal_emails_descartados WHERE gmail_message_id='__selftest'`)
  console.log(`anotar dos veces el mismo correo: quedaron ${n[0].n} fila(s) ${n[0].n === 1 ? '✓' : '✗'}`)
  if (n[0].n !== 1) throw new Error('la clave no está deduplicando')
  await c.query(`DELETE FROM portal_emails_descartados WHERE gmail_message_id='__selftest'`)

  const { rows: total } = await c.query('SELECT count(*)::int AS n FROM portal_emails_descartados')
  await c.end()
  console.log(`filas en la tabla: ${total[0].n}`)
  console.log('\n✅ aplicada y verificada')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
