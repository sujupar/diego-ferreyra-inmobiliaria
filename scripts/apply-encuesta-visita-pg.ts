/**
 * Aplica `20261015000002_encuesta_de_visita.sql` y VERIFICA lo que importa, TODO dentro de UNA
 * transacción: si cualquier verificación falla se hace ROLLBACK de la migración entera y el
 * proceso sale con código 1. Las pruebas que escriben filas corren en SAVEPOINT que se deshacen
 * antes del COMMIT: no dejan nada.
 *
 *   node --env-file=../../../.env.local --import tsx scripts/apply-encuesta-visita-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function rechaza(c: Client, nombre: string, sql: string, params: unknown[]): Promise<boolean> {
  await c.query(`SAVEPOINT ${nombre}`)
  try {
    await c.query(sql, params)
    await c.query(`RELEASE SAVEPOINT ${nombre}`)
    return false
  } catch {
    await c.query(`ROLLBACK TO SAVEPOINT ${nombre}`)
    return true
  }
}

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    await c.query("SET lock_timeout = '5s'")
    await c.query('BEGIN')
    await c.query(readFileSync('supabase/migrations/20261015000002_encuesta_de_visita.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const tablas = (await c.query(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relnamespace='public'::regnamespace AND relname = ANY($1)`,
      [['visit_surveys', 'visit_survey_settings', 'property_survey_gifts', 'visit_questionnaires', 'visit_questionnaire_tokens']])).rows
    const porNombre = new Map(tablas.map(t => [t.relname as string, t.relrowsecurity as boolean]))
    for (const t of ['visit_surveys', 'visit_survey_settings', 'property_survey_gifts']) {
      ok(porNombre.get(t) === true, `${t} existe y tiene RLS`)
    }
    ok(!porNombre.has('visit_questionnaires') && !porNombre.has('visit_questionnaire_tokens'), 'las tablas viejas del cuestionario ya no existen')

    const permisos = (await c.query(
      `SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name = ANY($1) AND grantee IN ('anon','authenticated')
          AND privilege_type IN ('INSERT','UPDATE','DELETE')`,
      [['visit_surveys', 'visit_survey_settings', 'property_survey_gifts']])).rows
    ok(permisos.length === 0, 'anon y authenticated NO pueden escribir las tablas nuevas')

    const ajustes = (await c.query(`SELECT * FROM visit_survey_settings`)).rows
    ok(ajustes.length === 1 && ajustes[0].envio_automatico === false && ajustes[0].solo_con_regalo === true
      && ajustes[0].regalo_por_whatsapp === false && ajustes[0].telefonos_prueba.length === 0,
      'una fila de ajustes con todo apagado y "solo con regalo" prendido')

    const bucket = (await c.query(`SELECT public, file_size_limit FROM storage.buckets WHERE id='visit-survey-gifts'`)).rows[0]
    ok(bucket && bucket.public === false && Number(bucket.file_size_limit) === 20971520, 'bucket visit-survey-gifts privado de 20 MB')

    const origen = (await c.query(
      `SELECT pg_get_constraintdef(oid) d, convalidated FROM pg_constraint WHERE conname='whatsapp_messages_origen_check'`)).rows[0]
    ok(origen && String(origen.d).includes('encuesta_visita') && origen.convalidated === true, 'CHECK de origen con encuesta_visita, validado')

    const grantFn = (await c.query(
      `SELECT has_function_privilege('authenticated', 'public.visit_survey_registrar(text,text,integer)', 'EXECUTE') a,
              has_function_privilege('service_role', 'public.visit_survey_registrar(text,text,integer)', 'EXECUTE') s`)).rows[0]
    ok(grantFn.a === false && grantFn.s === true, 'visit_survey_registrar: solo service_role')

    // ─── Lógica (como postgres) en un SAVEPOINT que se deshace ───
    await c.query('SAVEPOINT logica')
    try {
      const { rows: prop } = await c.query(`SELECT id FROM properties WHERE status='approved' LIMIT 1`)
      const { rows: v } = await c.query(
        `INSERT INTO property_visits (property_id, client_name, client_phone, scheduled_at, status, origin)
         VALUES ($1, '[TEST] encuesta', '+5491100000000', now() - interval '1 day', 'completed', 'cartel') RETURNING id`, [prop[0].id])
      const token = 'Ab3xK9pQ2rTz8LmN4vWq1Y'
      await c.query(`INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, $2, now() + interval '30 days')`, [v[0].id, token])

      ok(await rechaza(c, 's_dup', `INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, 'Zz3xK9pQ2rTz8LmN4vWq1Y', now())`, [v[0].id]),
        'una segunda encuesta para la misma visita se rechaza (UNIQUE visit_id)')
      ok(await rechaza(c, 's_tok', `UPDATE visit_surveys SET token='corto' WHERE visit_id=$1`, [v[0].id]), 'un token que no tiene 22 caracteres base64url se rechaza')
      ok(await rechaza(c, 's_est', `UPDATE visit_surveys SET send_status='mandada' WHERE visit_id=$1`, [v[0].id]), 'un estado de envío fuera del catálogo se rechaza')

      const r1 = (await c.query(`SELECT visit_survey_registrar($1,'abierta',2) r`, [token])).rows[0].r
      const r2 = (await c.query(`SELECT visit_survey_registrar($1,'escritura',2) r`, [token])).rows[0].r
      const r3 = (await c.query(`SELECT visit_survey_registrar($1,'escritura',2) r`, [token])).rows[0].r
      ok(r1 === true && r2 === true && r3 === false, 'el límite por link corta en el tope')
      const abierta = (await c.query(`SELECT opened_at, open_count, write_count FROM visit_surveys WHERE token=$1`, [token])).rows[0]
      ok(abierta.opened_at !== null && abierta.open_count === 1 && abierta.write_count === 2, '"abierta" marca opened_at y open_count una vez')

      ok(await rechaza(c, 's_path',
        `INSERT INTO property_survey_gifts (property_id, title, file_path, file_name, file_size)
         VALUES ($1, 'Guía', 'properties/11111111-1111-4111-8111-111111111111/regalo-11111111-1111-4111-8111-111111111111.pdf', 'g.pdf', 10)`,
        [prop[0].id]), 'un path de regalo de OTRA propiedad se rechaza')
      // $1 se castea en los dos usos: sin eso Postgres deduce tipos distintos (uuid y text) y falla.
      ok(!(await rechaza(c, 's_path_ok',
        `INSERT INTO property_survey_gifts (property_id, title, file_path, file_name, file_size)
         VALUES ($1::uuid, 'Guía', 'properties/' || $1::text || '/regalo-11111111-1111-4111-8111-111111111111.pdf', 'g.pdf', 10)`,
        [prop[0].id])), 'el path de regalo de ESTA propiedad se acepta')

      await c.query(`DELETE FROM property_visits WHERE id=$1`, [v[0].id])
      const quedan = (await c.query(`SELECT count(*)::int n FROM visit_surveys WHERE token=$1`, [token])).rows[0].n
      ok(quedan === 0, 'borrar la visita borra su encuesta (CASCADE)')
    } finally {
      await c.query('ROLLBACK TO SAVEPOINT logica')
    }

    // ─── RLS con sesión simulada: el abogado no ve nada; nadie autenticado escribe ───
    await c.query('SAVEPOINT rls')
    try {
      const { rows: prop } = await c.query(`SELECT id FROM properties WHERE status='approved' LIMIT 1`)
      const { rows: v } = await c.query(
        `INSERT INTO property_visits (property_id, client_name, client_phone, scheduled_at, status, origin)
         VALUES ($1, '[TEST] encuesta rls', '+5491100000000', now() - interval '1 day', 'completed', 'cartel') RETURNING id`, [prop[0].id])
      await c.query(`INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, 'Qq3xK9pQ2rTz8LmN4vWq1Y', now() + interval '30 days')`, [v[0].id])
      const { rows: abogados } = await c.query(`SELECT id FROM profiles WHERE role='abogado' LIMIT 1`)
      if (abogados[0]) {
        await c.query('SET LOCAL ROLE authenticated')
        await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: abogados[0].id, role: 'authenticated' })])
        ok((await c.query(`SELECT 1 FROM visit_surveys`)).rowCount === 0, 'el abogado no ve encuestas')
        ok((await c.query(`SELECT 1 FROM visit_survey_settings`)).rowCount === 0, 'el abogado no ve los ajustes')
        ok(await rechaza(c, 's_ins', `INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, 'Ww3xK9pQ2rTz8LmN4vWq1Y', now())`, [v[0].id]),
          'un usuario autenticado no puede insertar encuestas')
        await c.query('RESET ROLE')
      } else {
        console.log('⚠ no hay ningún perfil role=abogado: no se pudo probar la lectura del abogado')
      }
    } finally {
      await c.query('RESET ROLE')
      await c.query('ROLLBACK TO SAVEPOINT rls')
    }

    const resto = (await c.query(`SELECT count(*)::int n FROM property_visits WHERE client_name LIKE '[TEST] encuesta%'`)).rows[0].n
    ok(resto === 0, 'ninguna fila de prueba quedó')

    await c.query('COMMIT')
    console.log('\n✅ aplicada y verificada (COMMIT)')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await c.end()
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
