/**
 * Aplica `20261029000002_consultas_del_periodo.sql` (función nueva, aditiva) y la
 * verifica DENTRO de una transacción. ROLLBACK y error si:
 *   - para los últimos 30 días no devuelve exactamente las filas de la vista;
 *   - `authenticated` o `anon` pueden ejecutarla (elegirían su propio alcance);
 *   - con `p_limite` = 2 no marca `truncado` cuando hay más de 2;
 *   - el alcance de un asesor trae una consulta que no es suya.
 *
 * Uso: node --env-file=../../../.env.local --import tsx scripts/apply-consultas-del-periodo-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261029000002_consultas_del_periodo.sql'

function cliente(): Client {
  return new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
}

interface Resultado {
  consultas: Array<{ id: string; assigned_to: string | null; asesor_propiedad: string | null }>
  visitas: unknown[]
  propiedades: unknown[]
  asesores: unknown[]
  truncado: boolean
}

async function main() {
  const c = cliente()
  await c.connect()
  try {
    await c.query('BEGIN')
    await c.query(readFileSync(MIGRACION, 'utf8'))

    const desde = "now() - interval '30 days'"
    const { rows: [vista] } = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM consultas_unificadas WHERE recibida_at >= ${desde} AND recibida_at <= now()`)
    const { rows: [todo] } = await c.query<{ r: Resultado }>(
      `SELECT consultas_del_periodo(${desde}, now(), NULL, 3000) AS r`)
    const r = todo.r
    console.log(`30 días: vista ${vista.n} | función ${r.consultas.length} consultas, ${r.visitas.length} visitas, `
      + `${r.propiedades.length} propiedades, ${r.asesores.length} asesores, truncado=${r.truncado}`)
    if (r.consultas.length !== vista.n) throw new Error('la función no devuelve las mismas consultas que la vista')
    if (r.truncado) throw new Error('marcó truncado sin estarlo')

    const { rows: [corto] } = await c.query<{ r: Resultado }>(
      `SELECT consultas_del_periodo(${desde}, now(), NULL, 2) AS r`)
    console.log(`p_limite=2: ${corto.r.consultas.length} consultas, truncado=${corto.r.truncado}`)
    if (vista.n > 2 && (!corto.r.truncado || corto.r.consultas.length !== 2)) throw new Error('el corte no funciona')

    const { rows: [asesor] } = await c.query<{ id: string | null }>(
      `SELECT COALESCE(asesor_propiedad, assigned_to) AS id FROM consultas_unificadas
        WHERE COALESCE(asesor_propiedad, assigned_to) IS NOT NULL ORDER BY recibida_at DESC LIMIT 1`)
    if (asesor?.id) {
      const { rows: [propio] } = await c.query<{ r: Resultado }>(
        `SELECT consultas_del_periodo(now() - interval '365 days', now(), $1, 3000) AS r`, [asesor.id])
      const ajenas = propio.r.consultas.filter((x) => x.assigned_to !== asesor.id && x.asesor_propiedad !== asesor.id)
      console.log(`alcance de un asesor: ${propio.r.consultas.length} consultas, ajenas ${ajenas.length}`)
      if (ajenas.length > 0) throw new Error('el alcance del asesor trae consultas ajenas')
    }

    const { rows: permisos } = await c.query<{ rol: string; puede: boolean }>(`
      SELECT rol, has_function_privilege(rol, 'public.consultas_del_periodo(timestamptz,timestamptz,uuid,integer)', 'EXECUTE') AS puede
        FROM unnest(ARRAY['anon','authenticated','service_role']) AS rol`)
    for (const p of permisos) console.log(`EXECUTE ${p.rol}: ${p.puede}`)
    if (permisos.some((p) => p.rol !== 'service_role' && p.puede)) throw new Error('anon o authenticated pueden ejecutarla')
    if (!permisos.find((p) => p.rol === 'service_role')?.puede) throw new Error('service_role no puede ejecutarla')

    await c.query('COMMIT')
    console.log('\n✅ aplicada y verificada (COMMIT)')
  } catch (e) {
    await c.query('ROLLBACK')
    console.error('\n❌ ROLLBACK:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  } finally {
    await c.end()
  }
}

main()
