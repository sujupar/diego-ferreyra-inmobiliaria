/**
 * Aplica `20261022000003_informe_guardar_captura.sql` y VERIFICA en UNA transacción: si algo no
 * cuadra, ROLLBACK y código 1. Las escrituras de prueba van en SAVEPOINT y se deshacen.
 * Idempotente.
 *
 *   node --env-file=../../../.env.local --import tsx scripts/apply-informe-captura-pg.ts
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
    await c.query(readFileSync('supabase/migrations/20261022000003_informe_guardar_captura.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const prop = (await c.query(`SELECT id FROM public.properties LIMIT 1`)).rows[0]?.id
    ok(!!prop, 'hay al menos una propiedad para probar')
    await c.query('SAVEPOINT prueba')
    const id = (await c.query(`INSERT INTO public.property_reports (property_id, desde, hasta, origen) VALUES ($1,'2026-01-01','2026-01-15','manual') RETURNING id`, [prop])).rows[0].id
    const llamar = async (cual: string, path: string | null) =>
      (await c.query(`SELECT public.informe_guardar_captura($1, $2, $3) AS r`, [id, cual, path])).rows[0].r
    const r1 = await llamar('zonaprop', 'informes/x/zp.png')
    const r2 = await llamar('argenprop', 'informes/x/ap.png')
    ok(r2.capturas.zonaprop === 'informes/x/zp.png' && r2.capturas.argenprop === 'informes/x/ap.png' && r1.anterior === null,
      'guarda cada captura sin pisar la otra')
    const r3 = await llamar('zonaprop', 'informes/x/zp2.png')
    ok(r3.anterior === 'informes/x/zp.png' && r3.capturas.zonaprop === 'informes/x/zp2.png', 'devuelve la anterior al reemplazar')
    const r4 = await llamar('argenprop', null)
    ok(!('argenprop' in r4.capturas) && r4.anterior === 'informes/x/ap.png' && r4.capturas.zonaprop === 'informes/x/zp2.png', 'quita solo la pedida')
    await c.query('SAVEPOINT mala')
    let rechazo = false
    try { await llamar('otra', 'x') } catch { rechazo = true }
    await c.query('ROLLBACK TO SAVEPOINT mala')
    ok(rechazo, 'rechaza una captura desconocida')
    await c.query(`UPDATE public.property_reports SET estado='listo', listo_at=now(), pdf_path='informes/' || id || '/informe-' || id || '.pdf' WHERE id=$1`, [id])
    ok((await llamar('tiktok', 'informes/x/tk.png')) === null, 'no toca un informe ya "listo"')
    await c.query('ROLLBACK TO SAVEPOINT prueba')

    const ex = (await c.query(`SELECT has_function_privilege('authenticated', 'public.informe_guardar_captura(uuid,text,text)', 'EXECUTE') AS a`)).rows[0].a
    ok(ex === false, 'authenticated NO puede ejecutar informe_guardar_captura')
    const sr = (await c.query(`SELECT has_function_privilege('service_role', 'public.informe_guardar_captura(uuid,text,text)', 'EXECUTE') AS a`)).rows[0].a
    ok(sr === true, 'service_role sí puede')

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
