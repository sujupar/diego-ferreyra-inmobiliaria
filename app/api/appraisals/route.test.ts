/**
 * GET /api/appraisals — el rango de fechas es un día ARGENTINO.
 *
 * La pantalla de Tasaciones manda `?from=2026-08-07&to=2026-08-07` (fecha de
 * calendario). Con el corte viejo (`T00:00:00Z` / `T23:59:59Z`) eso traía desde
 * las 21:00 del 6 hasta las 20:59 del 7, hora de acá: una tasación cargada a
 * las 22:00 del 7 no aparecía en el día que el asesor había pedido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registro } = vi.hoisted(() => ({
  registro: { llamadas: [] as Array<{ metodo: string; columna: string; valor: unknown }> },
}))

vi.mock('@supabase/supabase-js', () => {
  const resultado = { data: [], error: null, count: 0 }
  const builder: any = new Proxy({} as any, {
    get(_objetivo, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === 'then') {
        return (ok: any, mal: any) => Promise.resolve(resultado).then(ok, mal)
      }
      return (...args: any[]) => {
        if (prop === 'gte' || prop === 'lte') {
          registro.llamadas.push({ metodo: prop, columna: args[0], valor: args[1] })
        }
        return builder
      }
    },
  })
  return { createClient: () => builder }
})

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: 'yo-1', profile: { id: 'yo-1', role: 'admin' } })),
}))
vi.mock('@/lib/auth/require-role', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/supabase/appraisals-write', () => ({ insertAppraisalWithComparables: vi.fn() }))

import { GET } from './route'

function pedir(qs: string) {
  return GET(new Request(`http://local/api/appraisals${qs}`) as never)
}

beforeEach(() => {
  registro.llamadas = []
})

describe('GET /api/appraisals — rango de fechas', () => {
  it('un solo día cubre el día argentino entero, no el día UTC', async () => {
    const res = await pedir('?from=2026-08-07&to=2026-08-07')
    expect(res.status).toBe(200)

    const desde = registro.llamadas.find(l => l.metodo === 'gte')
    const hasta = registro.llamadas.find(l => l.metodo === 'lte')
    expect(desde?.valor).toBe('2026-08-07T00:00:00.000-03:00')
    expect(hasta?.valor).toBe('2026-08-07T23:59:59.999999-03:00')

    // Una tasación de las 23:30 locales del 7 (= 2026-08-08T02:30Z) cae adentro.
    const tarde = new Date('2026-08-08T02:30:00Z').getTime()
    expect(new Date(String(desde?.valor)).getTime()).toBeLessThanOrEqual(tarde)
    expect(new Date(String(hasta?.valor)).getTime()).toBeGreaterThanOrEqual(tarde)

    // Y una de las 21:30 locales del 6 (= 2026-08-07T00:30Z) queda AFUERA:
    // con el corte viejo se colaba en el día 7.
    const nocheAnterior = new Date('2026-08-07T00:30:00Z').getTime()
    expect(new Date(String(desde?.valor)).getTime()).toBeGreaterThan(nocheAnterior)
  })

  it('un instante ISO completo pasa sin tocar', async () => {
    await pedir('?from=2026-08-07T03%3A00%3A00.000Z&to=2026-08-08T02%3A59%3A59.999Z')
    expect(registro.llamadas.find(l => l.metodo === 'gte')?.valor).toBe('2026-08-07T03:00:00.000Z')
    expect(registro.llamadas.find(l => l.metodo === 'lte')?.valor).toBe('2026-08-08T02:59:59.999Z')
  })

  it('sin rango no agrega ningún límite de fecha', async () => {
    await pedir('')
    expect(registro.llamadas).toHaveLength(0)
  })
})
