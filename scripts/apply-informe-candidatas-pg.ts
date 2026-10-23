/**
 * Aplica `20261022000004_informe_candidatas.sql` y VERIFICA en UNA transacción: si algo no cuadra, ROLLBACK y
 * código 1. Las escrituras de prueba van en SAVEPOINT y se deshacen. Idempotente.
 *
 *   node --env-file=../../../.env.local --import tsx scripts/apply-informe-candidatas-pg.ts
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
    await c.query(readFileSync('supabase/migrations/20261022000004_informe_candidatas.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const col = (await c.query(`SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name='property_reports' AND column_name='candidatas'`)).rows
    ok(col.length === 1 && col[0].is_nullable === 'NO', 'columna candidatas existe y no admite null')

    const prop = (await c.query(`SELECT id FROM public.properties LIMIT 1`)).rows[0]?.id
    await c.query('SAVEPOINT prueba')
    const id = (await c.query(`INSERT INTO public.property_reports (property_id, desde, hasta, origen) VALUES ($1,'2026-01-01','2026-01-15','manual') RETURNING id, candidatas`, [prop])).rows[0]
    ok(JSON.stringify(id.candidatas) === '{"detalles":{}}', 'un informe nuevo arranca con detalles vacío')
    const guardar = async (camino: string[], valor: unknown) =>
      (await c.query(`SELECT public.informe_guardar_candidatas($1, $2, $3::jsonb) AS r`, [id.id, camino, JSON.stringify(valor)])).rows[0].r
    ok(await guardar(['argenprop'], { estado: 'ok', avisos: [{ url: 'https://a' }] }) === true, 'guarda la búsqueda de Argenprop')
    ok(await guardar(['mercadolibre'], { estado: 'ok', avisos: [] }) === true, 'guarda la de MercadoLibre sin pisar la otra')
    ok(await guardar(['detalles', 'https://a'], { disposicion: 'frente' }) === true, 'guarda el detalle de un aviso')
    const fila = (await c.query(`SELECT candidatas FROM public.property_reports WHERE id=$1`, [id.id])).rows[0].candidatas
    ok(fila.argenprop?.avisos?.length === 1 && fila.mercadolibre?.estado === 'ok' && fila.detalles['https://a']?.disposicion === 'frente',
      'las tres claves conviven')
    for (const [nombre, camino] of [['clave desconocida', ['otra']], ['detalle sin https', ['detalles', 'javascript:x']], ['camino largo', ['detalles', 'https://a', 'x']]] as const) {
      await c.query('SAVEPOINT mala')
      let rechazo = false
      try { await guardar([...camino], {}) } catch { rechazo = true }
      await c.query('ROLLBACK TO SAVEPOINT mala')
      ok(rechazo, `rechaza ${nombre}`)
    }
    await c.query(`UPDATE public.property_reports SET estado='listo', listo_at=now(), pdf_path='informes/' || id || '/informe-' || id || '.pdf' WHERE id=$1`, [id.id])
    ok(await guardar(['argenprop'], { estado: 'ok' }) === false, 'no toca un informe ya "listo"')
    await c.query('ROLLBACK TO SAVEPOINT prueba')

    const ex = (await c.query(`SELECT has_function_privilege('authenticated', 'public.informe_guardar_candidatas(uuid,text[],jsonb)', 'EXECUTE') AS a`)).rows[0].a
    ok(ex === false, 'authenticated NO puede ejecutar informe_guardar_candidatas')

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
