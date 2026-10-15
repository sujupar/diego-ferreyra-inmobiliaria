/**
 * Aplica `20261015000002_encuesta_de_visita.sql` y VERIFICA lo que importa, TODO dentro de UNA
 * transacción: si cualquier verificación falla se hace ROLLBACK de la migración entera y el
 * proceso sale con código 1. Las pruebas que escriben filas o cambian de rol corren en
 * SAVEPOINT que se deshacen antes del COMMIT: no dejan nada.
 *
 * Este script NO se type-checkea (como el resto de `scripts/apply-*-pg.ts`: la raíz excluye
 * `scripts/` de `tsc`, y acá seguimos ese mismo criterio — se verifica EJECUTÁNDOLO).
 *
 *   node --env-file=../../../.env.local --import tsx scripts/apply-encuesta-visita-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function ok(cond, msg) {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

// Corre `sql` y espera que la BASE lo rechace (CHECK, permiso o excepción). `nombre` tiene que
// ser único dentro del SAVEPOINT que la envuelve.
async function rechaza(c, nombre, sql, params) {
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

// Corre `fn` como si fuera una request real con ese rol (y, si hay `userId`, ese usuario
// logueado): SAVEPOINT propio, cambia de rol, corre `fn`, y SIEMPRE deshace el savepoint y
// vuelve a ser `postgres` (en ese orden: primero lo que escribió el rol impersonado, recién
// después soltar el rol — al revés, un `RESET ROLE` antes del rollback dejaría el rollback
// corriendo como el rol de la prueba, que no tiene permiso para deshacer nada).
async function comoRol(c, nombre, rol, userId, fn) {
  await c.query(`SAVEPOINT ${nombre}`)
  try {
    await c.query(`SET LOCAL ROLE ${rol}`)
    if (userId) {
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
    }
    await fn()
  } finally {
    await c.query(`ROLLBACK TO SAVEPOINT ${nombre}`)
    await c.query('RESET ROLE')
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
    const porNombre = new Map(tablas.map(t => [t.relname, t.relrowsecurity]))
    for (const t of ['visit_surveys', 'visit_survey_settings', 'property_survey_gifts']) {
      ok(porNombre.get(t) === true, `${t} existe y tiene RLS`)
    }
    ok(!porNombre.has('visit_questionnaires') && !porNombre.has('visit_questionnaire_tokens'), 'las tablas viejas del cuestionario ya no existen')

    // El ACL por defecto de `public` da a anon/authenticated TODOS los privilegios de tabla
    // (arwdDxtm). Acá exigimos la forma exacta que deja la migración: anon ninguno,
    // authenticated solo SELECT — no alcanza con que falten INSERT/UPDATE/DELETE.
    const privs = (await c.query(
      `SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name = ANY($1) AND grantee IN ('anon','authenticated')`,
      [['visit_surveys', 'visit_survey_settings', 'property_survey_gifts']])).rows
    const porTablaYRol = new Map()
    for (const p of privs) {
      const clave = `${p.table_name}:${p.grantee}`
      const set = porTablaYRol.get(clave) ?? new Set()
      set.add(p.privilege_type)
      porTablaYRol.set(clave, set)
    }
    for (const t of ['visit_surveys', 'visit_survey_settings', 'property_survey_gifts']) {
      const anonPriv = porTablaYRol.get(`${t}:anon`) ?? new Set()
      const authPriv = porTablaYRol.get(`${t}:authenticated`) ?? new Set()
      ok(anonPriv.size === 0, `anon no tiene NINGÚN privilegio en ${t}`)
      ok(authPriv.size === 1 && authPriv.has('SELECT'), `authenticated tiene SOLO SELECT en ${t} (nada de UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)`)
    }

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
      ok(await rechaza(c, 's_offer_sin_moneda', `UPDATE visit_surveys SET offer_amount=100000 WHERE visit_id=$1`, [v[0].id]),
        'una oferta con monto pero sin moneda se rechaza (CHECK de par monto/moneda)')
      ok(await rechaza(c, 's_offer_techo', `UPDATE visit_surveys SET offer_amount=2000000000000, offer_currency='USD' WHERE visit_id=$1`, [v[0].id]),
        'una oferta de 2 billones (por encima del techo de 1e12) se rechaza')
      ok(await rechaza(c, 's_tags_largas',
        `UPDATE visit_surveys SET most_liked_tags = ARRAY[repeat('a',60),repeat('b',60),repeat('c',60),repeat('d',60),repeat('e',60),repeat('f',60),repeat('g',60)] WHERE visit_id=$1`,
        [v[0].id]), 'etiquetas que suman más de 400 caracteres se rechazan aunque entren en la cardinalidad de 8')
      ok(await rechaza(c, 's_tipo', `SELECT visit_survey_registrar($1, 'otro', 5)`, [token]),
        'visit_survey_registrar con un tipo desconocido falla ruidoso (no un false silencioso)')

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

    // ─── RLS con sesiones simuladas de verdad: por rol de la base, no solo por SELECT ───
    await c.query('SAVEPOINT rls')
    try {
      const { rows: asesores } = await c.query(`SELECT id FROM profiles WHERE role='asesor' AND is_active = true ORDER BY id LIMIT 2`)
      const { rows: opsRows } = await c.query(`SELECT id FROM profiles WHERE role IN ('admin','dueno','coordinador') AND is_active = true ORDER BY id LIMIT 1`)
      const { rows: abogadosRows } = await c.query(`SELECT id FROM profiles WHERE role='abogado' AND is_active = true LIMIT 1`)
      if (!opsRows[0]) throw new Error('no hay ningún perfil admin/dueño/coordinador activo: no se puede probar que un admin ve todo')
      if (asesores.length === 0) throw new Error('no hay ningún asesor activo: no se puede probar el alcance por asesor de la RLS')
      const adminId = opsRows[0].id
      const asesor1Id = asesores[0].id
      // Con un solo asesor activo no hay un "segundo asesor" real para probar que NO ve lo
      // ajeno; se documenta y se sigue solo con lo que SÍ es significativo con un asesor.
      const asesor2Id = asesores[1] ? asesores[1].id : null
      if (!asesor2Id) {
        console.log('⚠ solo hay un asesor activo: no se prueba "el otro asesor no ve" (no hay con quién). El resto de las pruebas de RLS SÍ corren.')
      }

      const { rows: prop } = await c.query(`SELECT id FROM properties WHERE status='approved' LIMIT 1`)
      const propertyId = prop[0].id

      const token1 = 'Rr1xK9pQ2rTz8LmN4vWq1Y'
      const { rows: v1 } = await c.query(
        `INSERT INTO property_visits (property_id, advisor_id, client_name, client_phone, scheduled_at, status, origin)
         VALUES ($1, $2, '[TEST] encuesta rls 1', '+5491100000000', now() - interval '1 day', 'completed', 'cartel') RETURNING id`,
        [propertyId, asesor1Id])
      await c.query(`INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, $2, now() + interval '30 days')`, [v1[0].id, token1])

      let token2 = null
      if (asesor2Id) {
        token2 = 'Rr2xK9pQ2rTz8LmN4vWq1Y'
        const { rows: v2 } = await c.query(
          `INSERT INTO property_visits (property_id, advisor_id, client_name, client_phone, scheduled_at, status, origin)
           VALUES ($1, $2, '[TEST] encuesta rls 2', '+5491100000000', now() - interval '1 day', 'completed', 'cartel') RETURNING id`,
          [propertyId, asesor2Id])
        await c.query(`INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, $2, now() + interval '30 days')`, [v2[0].id, token2])
      }

      // Regalo: de una propiedad asignada a UN asesor real. Si ninguna propiedad aprobada
      // tiene asesor asignado, no hay forma de probar el alcance por asesor del regalo.
      const { rows: regaloProp } = await c.query(
        `SELECT id, assigned_to FROM properties WHERE status='approved' AND assigned_to IS NOT NULL LIMIT 1`)
      if (!regaloProp[0]) throw new Error('no hay ninguna propiedad aprobada con asesor asignado: no se puede probar el alcance del regalo')
      const regaloPropertyId = regaloProp[0].id
      const asesorAsignadoId = regaloProp[0].assigned_to
      // El "otro asesor" para el regalo NUNCA puede ser el admin (vería todo por
      // is_operations_user(), sin que eso prenda nada del alcance por asignación).
      const asesorNoAsignadoId = [asesor1Id, asesor2Id].find(id => id && id !== asesorAsignadoId)
      await c.query(
        `INSERT INTO property_survey_gifts (property_id, title, file_path, file_name, file_size)
         VALUES ($1::uuid, 'Guía RLS', 'properties/' || $1::text || '/regalo-22222222-2222-4222-8222-222222222222.pdf', 'g.pdf', 10)`,
        [regaloPropertyId])

      // (a) el asesor ve la encuesta de SU visita.
      await comoRol(c, 'rls_a1', 'authenticated', asesor1Id, async () => {
        const r = await c.query(`SELECT token FROM visit_surveys WHERE token IN ($1, $2)`, [token1, token2 ?? token1])
        const tokens = r.rows.map(row => row.token)
        ok(tokens.includes(token1), 'el asesor de la visita ve la encuesta de SU visita')
        if (token2) ok(!tokens.includes(token2), 'ese mismo asesor NO ve la encuesta de la visita de otro asesor')
      })

      // (a, espejo) el otro asesor, si existe, ve la suya y no la ajena.
      if (asesor2Id && token2) {
        await comoRol(c, 'rls_a2', 'authenticated', asesor2Id, async () => {
          const r = await c.query(`SELECT token FROM visit_surveys WHERE token IN ($1, $2)`, [token1, token2])
          const tokens = r.rows.map(row => row.token)
          ok(tokens.includes(token2) && !tokens.includes(token1), 'el segundo asesor ve la suya y no la del primero')
        })
      }

      // (c) el regalo: lo ve el asesor asignado a la propiedad, no otro asesor, sí un admin.
      await comoRol(c, 'rls_regalo_asignado', 'authenticated', asesorAsignadoId, async () => {
        const r = await c.query(`SELECT property_id FROM property_survey_gifts WHERE property_id=$1`, [regaloPropertyId])
        ok(r.rowCount === 1, 'el asesor ASIGNADO a la propiedad ve su regalo')
      })
      if (asesorNoAsignadoId) {
        await comoRol(c, 'rls_regalo_otro', 'authenticated', asesorNoAsignadoId, async () => {
          const r = await c.query(`SELECT property_id FROM property_survey_gifts WHERE property_id=$1`, [regaloPropertyId])
          ok(r.rowCount === 0, 'un asesor NO asignado a esa propiedad no ve su regalo')
        })
      } else {
        console.log('⚠ no hay un segundo asesor distinto del asignado al regalo: no se prueba "otro asesor no lo ve".')
      }

      // (d) admin/dueño/coordinador ve todo, sin que medie advisor_id ni assigned_to.
      await comoRol(c, 'rls_admin', 'authenticated', adminId, async () => {
        const r = await c.query(`SELECT token FROM visit_surveys WHERE token IN ($1, $2)`, [token1, token2 ?? token1])
        ok(r.rows.length === (token2 ? 2 : 1), 'un admin/dueño/coordinador ve las encuestas de prueba, sean de quien sean')
        const s = await c.query(`SELECT 1 FROM visit_survey_settings`)
        ok(s.rowCount === 1, 'un admin/dueño/coordinador ve los ajustes')
        const g = await c.query(`SELECT 1 FROM property_survey_gifts WHERE property_id=$1`, [regaloPropertyId])
        ok(g.rowCount === 1, 'un admin/dueño/coordinador ve el regalo de cualquier propiedad')
      })

      // El abogado no pinta en ninguna de estas tablas (no es ops ni es el asesor de nada acá).
      if (abogadosRows[0]) {
        await comoRol(c, 'rls_abogado', 'authenticated', abogadosRows[0].id, async () => {
          const r = await c.query(`SELECT 1 FROM visit_surveys WHERE token IN ($1, $2)`, [token1, token2 ?? token1])
          ok(r.rowCount === 0, 'el abogado no ve las encuestas de prueba')
          const s = await c.query(`SELECT 1 FROM visit_survey_settings`)
          ok(s.rowCount === 0, 'el abogado no ve los ajustes')
          const g = await c.query(`SELECT 1 FROM property_survey_gifts WHERE property_id=$1`, [regaloPropertyId])
          ok(g.rowCount === 0, 'el abogado no ve el regalo')
        })
      } else {
        console.log('⚠ no hay ningún perfil role=abogado activo: no se pudo probar la lectura del abogado (las demás pruebas de RLS SÍ corrieron).')
      }

      // (b) anon: ni siquiera SELECT — es un rechazo de PERMISO (sin GRANT), no de RLS.
      await comoRol(c, 'rls_anon', 'anon', null, async () => {
        ok(await rechaza(c, 'rls_anon_surveys', `SELECT token FROM visit_surveys LIMIT 1`, []),
          'anon no puede ni SELECT visit_surveys (sin GRANT, no por una política que filtre filas)')
        ok(await rechaza(c, 'rls_anon_settings', `SELECT 1 FROM visit_survey_settings LIMIT 1`, []),
          'anon no puede ni SELECT visit_survey_settings')
        ok(await rechaza(c, 'rls_anon_gifts', `SELECT 1 FROM property_survey_gifts LIMIT 1`, []),
          'anon no puede ni SELECT property_survey_gifts')
      })

      // (e) authenticated puede leer, pero ni UPDATE, ni DELETE, ni TRUNCATE (sin GRANT).
      await comoRol(c, 'rls_mut', 'authenticated', asesor1Id, async () => {
        ok(await rechaza(c, 'rls_upd', `UPDATE visit_surveys SET liked = true WHERE token = $1`, [token1]),
          'un usuario autenticado no puede UPDATE visit_surveys')
        ok(await rechaza(c, 'rls_del', `DELETE FROM visit_surveys WHERE token = $1`, [token1]),
          'un usuario autenticado no puede DELETE de visit_surveys')
        ok(await rechaza(c, 'rls_trunc', `TRUNCATE visit_surveys`, []),
          'un usuario autenticado no puede TRUNCATE visit_surveys')
        ok(await rechaza(c, 'rls_ins', `INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, 'Ww3xK9pQ2rTz8LmN4vWq1Y', now())`, [v1[0].id]),
          'un usuario autenticado no puede INSERT en visit_surveys')
      })
    } finally {
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
