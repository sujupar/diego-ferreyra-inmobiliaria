/**
 * Aplica `20261128000001_video_bienvenida.sql` y VERIFICA lo que importa (design.md D2):
 * RLS, CHECK del código (incluida la `o`), UNIQUE por contacto, que `anon` no lea ni ejecute,
 * que crear sea idempotente y deje la unión `bv:`, la apertura, el envío y el respaldo de una
 * sola vez. Las pruebas corren dentro de una transacción con ROLLBACK: no deja filas.
 *
 *   node --env-file=<.env.local> --import tsx scripts/apply-video-bienvenida-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const ARCHIVO = 'supabase/migrations/20261128000001_video_bienvenida.sql'

function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(`✗ ${msg}`)
  console.log(`✓ ${msg}`)
}

async function falla(c: Client, sql: string, params: unknown[] = []): Promise<boolean> {
  await c.query('SAVEPOINT p')
  try {
    await c.query(sql, params)
    await c.query('RELEASE SAVEPOINT p')
    return false
  } catch {
    await c.query('ROLLBACK TO SAVEPOINT p')
    return true
  }
}

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(readFileSync(ARCHIVO, 'utf8'))
  console.log('migración aplicada\n')

  const { rows: t } = await c.query(
    `SELECT relrowsecurity AS rls FROM pg_class WHERE relname='video_bienvenida_enlaces' AND relnamespace='public'::regnamespace`)
  ok(t.length === 1, 'la tabla existe')
  ok(t[0].rls, 'la tabla tiene RLS')

  await c.query('BEGIN')
  try {
    const { rows: [contacto] } = await c.query(`INSERT INTO contacts (full_name) VALUES ('[TEST] Video bienvenida') RETURNING id`)
    const { rows: [otro] } = await c.query(`INSERT INTO contacts (full_name) VALUES ('[TEST] Video bienvenida 2') RETURNING id`)

    ok(await falla(c, `INSERT INTO video_bienvenida_enlaces (codigo, contact_id, origen) VALUES ('k7Hq2mXb9', $1, 'manual')`, [otro.id]),
      'el CHECK rechaza un código de 9 caracteres')
    ok(await falla(c, `INSERT INTO video_bienvenida_enlaces (codigo, contact_id, origen) VALUES ('k7Hq2mXb9O', $1, 'manual')`, [otro.id]),
      'el CHECK rechaza la O mayúscula')
    ok(await falla(c, `INSERT INTO video_bienvenida_enlaces (codigo, contact_id, origen) VALUES ('k7Hq2mXb9T', $1, 'otro')`, [otro.id]),
      'el CHECK rechaza un origen desconocido')

    const crear = (codigo: string, contactId: string) => c.query(
      `SELECT public.video_bienvenida_obtener_o_crear($1, NULL, 'Ana', 'whatsapp', NULL, $2) AS codigo`, [contactId, codigo])
    const { rows: [a] } = await crear('ooooHq2mXb', contacto.id)
    ok(a.codigo === 'ooooHq2mXb', 'acepta un código con o minúscula y lo crea')
    const { rows: [b] } = await crear('zzzzHq2mXb', contacto.id)
    ok(b.codigo === 'ooooHq2mXb', 'crear dos veces para el mismo contacto devuelve el mismo código')
    ok(await falla(c, `INSERT INTO video_bienvenida_enlaces (codigo, contact_id, origen) VALUES ('yyyyHq2mXb', $1, 'manual')`, [contacto.id]),
      'el UNIQUE rechaza un segundo enlace del mismo contacto')
    const { rows: [u] } = await c.query(`SELECT contact_id FROM anon_identity WHERE anon_id = 'bv:ooooHq2mXb'`)
    ok(u?.contact_id === contacto.id, 'la unión bv:<codigo> quedó con ese contacto')

    const { rows: [ap1] } = await c.query(`SELECT public.video_bienvenida_registrar_apertura('ooooHq2mXb') AS ok`)
    await c.query(`SELECT public.video_bienvenida_registrar_apertura('ooooHq2mXb')`)
    const { rows: [ap0] } = await c.query(`SELECT public.video_bienvenida_registrar_apertura('NNNNNNNNNN') AS ok`)
    const { rows: [e1] } = await c.query(`SELECT aperturas, primera_apertura IS NOT NULL AS p FROM video_bienvenida_enlaces WHERE codigo='ooooHq2mXb'`)
    ok(ap1.ok === true && ap0.ok === false, 'la apertura devuelve true con un código real y false con uno inexistente')
    ok(e1.aperturas === 2 && e1.p, 'dos aperturas suman 2 y guardan la primera')

    await c.query(`SELECT public.video_bienvenida_marcar_enviado('ooooHq2mXb', 'wamid.TEST1')`)
    const { rows: r1 } = await c.query(`SELECT * FROM public.video_bienvenida_tomar_respaldo('wamid.TEST1')`)
    const { rows: r2 } = await c.query(`SELECT * FROM public.video_bienvenida_tomar_respaldo('wamid.TEST1')`)
    ok(r1.length === 1 && r1[0].contact_id === contacto.id && r1[0].nombre === 'Ana', 'el respaldo devuelve el contacto la primera vez')
    ok(r2.length === 0, 'un aviso repetido no devuelve nada (una sola vez)')

    await c.query(`INSERT INTO video_view_state (anon_id, video_key, watched_buckets, playback_started, watch_seconds, max_percent)
                   VALUES ('bv:ooooHq2mXb', 'bienvenida-tasacion-v1', B'1111', true, 4, 4)`)
    const { rows: cart } = await c.query(`SELECT * FROM public.cartera_video_bienvenida(ARRAY[$1::uuid])`, [contacto.id])
    ok(cart.length === 1 && cart[0].aperturas === 2 && cart[0].playback_started === true && cart[0].watched_buckets === '1111' && cart[0].envio_fallido_at,
      'la lectura de la cartera trae aperturas, play, tramos y el fallo')
    const { rows: [vv] } = await c.query(`SELECT contact_id FROM video_view_state WHERE anon_id='bv:ooooHq2mXb'`)
    ok(vv.contact_id === null || vv.contact_id === contacto.id, 'la fila de video no queda en otro contacto')

    // /embudos: la vista del video de bienvenida (embudo nulo) cae en 'otro', que el panel no muestra.
    const { rows: est } = await c.query(
      `SELECT funnel FROM public.funnel_video_stats(now() - interval '1 day', now() + interval '1 day') WHERE video_key = 'bienvenida-tasacion-v1'`)
    ok(est.length > 0 && est.every((r) => r.funnel === 'otro'), 'en /embudos el video de bienvenida queda en "otro" (fuera de tasación y clase)')

    // Lo que ve alguien sin sesión (rol anon de la API).
    await c.query('SAVEPOINT anon')
    await c.query('SET LOCAL ROLE anon')
    const { rows: leidas } = await c.query('SELECT count(*)::int AS n FROM video_bienvenida_enlaces')
    ok(leidas[0].n === 0, 'anon lee 0 filas')
    for (const f of [
      `SELECT public.video_bienvenida_registrar_apertura('ooooHq2mXb')`,
      `SELECT * FROM public.video_bienvenida_tomar_respaldo('x')`,
      `SELECT * FROM public.cartera_video_bienvenida(ARRAY[]::uuid[])`,
    ]) ok(await falla(c, f), `anon no puede ejecutar: ${f.slice(7, 60)}`)
    await c.query('ROLLBACK TO SAVEPOINT anon')

    // Y un usuario con sesión tampoco ejecuta las funciones.
    await c.query('SAVEPOINT auth')
    await c.query('SET LOCAL ROLE authenticated')
    ok(await falla(c, `SELECT public.video_bienvenida_registrar_apertura('ooooHq2mXb')`), 'authenticated no puede ejecutar la apertura')
    await c.query('ROLLBACK TO SAVEPOINT auth')
  } finally {
    await c.query('ROLLBACK')
  }

  const { rows: [n] } = await c.query(`SELECT count(*)::int AS n FROM video_bienvenida_enlaces`)
  const { rows: [m] } = await c.query(`SELECT count(*)::int AS n FROM contacts WHERE full_name LIKE '[TEST] Video bienvenida%'`)
  ok(m.n === 0, `sin contactos de prueba sueltos (enlaces en la tabla: ${n.n})`)
  await c.end()
  console.log('\n✅ aplicada y verificada')
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
