/**
 * Aplica `20260919000011_mapa_recorridos.sql` (ubicación como cualquier
 * geometría + tipo 'recorrido' + reserva de celdas) y verifica: un solo CHECK de tipo y con
 * 'recorrido', la columna acepta líneas, la función mide distancia a una línea,
 * y no se perdió ninguna fila.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-mapa-recorridos-pg.ts
 * (requiere `pg`: npm i --no-save pg)
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  const cuenta = async () => (await c.query('SELECT count(*)::int AS n FROM mapa_lugares')).rows[0].n as number
  const antes = await cuenta()
  await c.query(readFileSync('supabase/migrations/20260919000011_mapa_recorridos.sql', 'utf8'))
  const despues = await cuenta()

  const { rows: checks } = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.mapa_lugares'::regclass AND contype = 'c'`)
  const { rows: tipo } = await c.query(`SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute
    WHERE attrelid = 'public.mapa_lugares'::regclass AND attname = 'ubicacion'`)
  const { rows: reserva } = await c.query(`SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute
    WHERE attrelid = 'public.mapa_celdas'::regclass AND attname = 'reservada_hasta' AND NOT attisdropped`)

  // Prueba real dentro de una transacción que se deshace: una línea a ~100 m del punto.
  await c.query('BEGIN')
  await c.query(`INSERT INTO mapa_lugares (osm_id, tipo, lineas, ubicacion, celda)
    VALUES ('w_prueba', 'recorrido', '{999}', 'SRID=4326;LINESTRING(-58.40 -34.6109, -58.39 -34.6109)', (SELECT id FROM mapa_celdas LIMIT 1))`)
  const { rows: prueba } = await c.query(`SELECT osm_id, metros FROM lugares_cercanos(-34.61, -58.395, '{"recorrido":400}'::jsonb) WHERE osm_id = 'w_prueba'`)
  await c.query('ROLLBACK')
  const final = await cuenta()
  await c.end()

  console.log(`filas: antes ${antes} · después ${despues} · tras la prueba ${final}`)
  console.log(`ubicacion: ${tipo[0]?.t} · reservada_hasta: ${reserva[0]?.t ?? 'NO'}`)
  console.log(`CHECKs: ${checks.map(k => `${k.conname}: ${k.def}`).join(' | ')}`)
  console.log(`línea de prueba encontrada a ${prueba[0]?.metros ?? 'NO'} m (esperado ~100)`)
  if (antes !== despues || despues !== final) throw new Error('¡ALERTA! cambió la cantidad de filas')
  if (!/geography\(Geometry,4326\)/i.test(tipo[0]?.t ?? '')) throw new Error('la columna no quedó como Geometry')
  if (!reserva[0]) throw new Error('falta mapa_celdas.reservada_hasta')
  const deTipo = checks.filter(k => /tipo/.test(k.def))
  if (deTipo.length !== 1 || !/recorrido/.test(deTipo[0].def)) throw new Error('el CHECK de tipo no quedó bien (debe haber UNO y con recorrido)')
  if (!prueba[0] || Math.abs(prueba[0].metros - 100) > 5) throw new Error('la función no midió bien la distancia a la línea')
  console.log('\n✅ migración aplicada y verificada')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
