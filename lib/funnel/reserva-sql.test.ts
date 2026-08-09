/**
 * Guardas sobre el SQL que no se puede ejecutar desde la suite.
 *
 * La atomicidad de la reserva vive en Postgres: la garantizan los candados de
 * transacción de `reservar_envio_embudo`, no el TypeScript. Sin una base
 * levantada no hay forma de ejercitarla, pero SÍ se puede impedir que
 * desaparezca sin que nadie se entere — que es como vuelven los bugs de
 * concurrencia: alguien "simplifica" la función, todo sigue verde, y meses
 * después aparecen dos deals para el mismo teléfono.
 *
 * Estos tests leen el archivo de migración y afirman las cuatro propiedades de
 * las que depende todo el diseño:
 *   1. los candados se toman ANTES de mirar la tabla,
 *   2. mirar y escribir pasan en la MISMA función,
 *   3. el encolado es idempotente (`on conflict do nothing` + la UNIQUE que lo
 *      hace posible),
 *   4. las filas históricas siguen contando como conversiones.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RAIZ = resolve(__dirname, '..', '..')
const sql = readFileSync(resolve(RAIZ, 'supabase/migrations/20260808000001_funnel_lead_jobs.sql'), 'utf8')
const sqlCron = readFileSync(resolve(RAIZ, 'supabase/migrations/20260808000002_cron_funnel_side_effects.sql'), 'utf8')

/** El cuerpo de una función, entre su CREATE y el `$$;` que la cierra. */
function cuerpoDe(nombre: string): string {
  const desde = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nombre}(`)
  expect(desde, `no existe la función ${nombre}`).toBeGreaterThan(-1)
  const hasta = sql.indexOf('\n$$;', desde)
  expect(hasta, `la función ${nombre} no cierra`).toBeGreaterThan(desde)
  return sql.slice(desde, hasta)
}

describe('reservar_envio_embudo — la reserva es atómica', () => {
  const cuerpo = cuerpoDe('reservar_envio_embudo')

  it('toma candados de transacción', () => {
    expect(cuerpo).toContain('pg_advisory_xact_lock')
  })

  it('los toma ANTES de leer la tabla de envíos', () => {
    const candado = cuerpo.indexOf('pg_advisory_xact_lock')
    const primeraLectura = cuerpo.indexOf('FROM funnel_lead_submissions')
    expect(primeraLectura).toBeGreaterThan(-1)
    expect(candado).toBeLessThan(primeraLectura)
  })

  it('los toma ordenados y sin repetir, para que dos peticiones no se abracen', () => {
    expect(cuerpo).toMatch(/array_agg\(DISTINCT k ORDER BY k\)/i)
  })

  it('mira y escribe en la MISMA función: el rate-limit, el dedup y el alta no se pueden separar', () => {
    expect(cuerpo).toContain('FROM funnel_lead_submissions')
    expect(cuerpo).toMatch(/INSERT INTO funnel_lead_submissions/i)
    const salidas = cuerpo.match(/RETURN QUERY SELECT '(\w+)'/g) ?? []
    expect(salidas.join(' ')).toContain('rate_limited')
    expect(salidas.join(' ')).toContain('duplicado')
    expect(salidas.join(' ')).toContain('reservado')
  })

  it('una reserva en vuelo frena duplicados por MUCHO menos tiempo que un envío completo', () => {
    expect(cuerpo).toContain('p_inflight_seconds')
    expect(cuerpo).toContain('p_dedup_window_seconds')
    // Las dos ventanas se evalúan juntas, según el estado de la fila.
    expect(cuerpo).toMatch(/status = 'complete'[\s\S]{0,120}p_dedup_window_seconds/)
    expect(cuerpo).toMatch(/status = 'reserved'[\s\S]{0,120}p_inflight_seconds/)
  })

  it('no la puede ejecutar el navegador', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reservar_envio_embudo[\s\S]*FROM anon/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reservar_envio_embudo[\s\S]*FROM authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reservar_envio_embudo[\s\S]*TO service_role/)
  })
})

describe('completar_envio_embudo — encolar dos veces no duplica avisos', () => {
  const cuerpo = cuerpoDe('completar_envio_embudo')

  it('encola con ON CONFLICT DO NOTHING', () => {
    expect(cuerpo.replace(/\s+/g, ' ')).toMatch(/ON CONFLICT \(submission_id, kind\) DO NOTHING/i)
  })

  it('la tabla tiene la UNIQUE que hace posible ese ON CONFLICT', () => {
    expect(sql.replace(/\s+/g, ' ')).toMatch(/UNIQUE \(submission_id, kind\)/i)
  })

  it('cierra la reserva y encola en la misma función', () => {
    expect(cuerpo).toMatch(/UPDATE funnel_lead_submissions/i)
    expect(cuerpo).toMatch(/INSERT INTO funnel_lead_jobs/i)
  })
})

describe('la cola', () => {
  it('solo la ve el service role: el payload de Meta lleva la IP del visitante', () => {
    expect(sql).toMatch(/ALTER TABLE public\.funnel_lead_jobs ENABLE ROW LEVEL SECURITY/i)
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*funnel_lead_jobs/i)
  })

  it('acepta exactamente los cinco tipos de aviso', () => {
    expect(sql.replace(/\s+/g, ' ')).toContain(
      "kind IN ('coordinator_task','notify','mailchimp','anon_stitch','capi')",
    )
  })
})

describe('la migración es aditiva', () => {
  it('las filas históricas de envíos siguen contando como conversión', () => {
    expect(sql.replace(/\s+/g, ' ')).toMatch(
      /ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete'/i,
    )
  })

  it('no borra ni vacía nada', () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/i)
  })
})

describe('el job de pg_cron va aparte, DESPUÉS del deploy', () => {
  it('la migración de la cola no programa nada', () => {
    expect(sql).not.toMatch(/cron\.schedule/i)
  })

  it('la del job apunta a la ruta del worker y corre cada minuto', () => {
    expect(sqlCron).toMatch(/cron\.schedule\('funnel-side-effects', '\* \* \* \* \*'/)
    expect(sqlCron).toContain('/api/cron/funnel-side-effects')
    expect(sqlCron).toContain('x-cron-secret')
  })
})
