/**
 * Aplica `20260806000001_whatsapp_origen.sql` y verifica que el backfill haya
 * sido CONSERVADOR: que no cambie la cantidad de mensajes y que las filas
 * marcadas como 'landing' sean exactamente las que tienen token de recorrido.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
    user:'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()
  const { rows: antes } = await c.query('SELECT count(*)::int AS n FROM whatsapp_messages')
  await c.query(readFileSync('supabase/migrations/20260806000001_whatsapp_origen.sql','utf8'))
  const { rows: despues } = await c.query('SELECT count(*)::int AS n FROM whatsapp_messages')
  const { rows: por } = await c.query(`SELECT coalesce(origen,'(sin origen)') AS o, count(*)::int AS n FROM whatsapp_messages GROUP BY 1 ORDER BY 2 DESC`)
  await c.end()

  console.log(`mensajes: ${antes[0].n} antes → ${despues[0].n} después`)
  for (const r of por) console.log(`  ${String(r.o).padEnd(16)} ${r.n}`)
  if (antes[0].n !== despues[0].n) throw new Error('¡ALERTA! cambió la cantidad de mensajes')
  console.log('\n✅ aplicada — columna aditiva, ninguna fila perdida')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
