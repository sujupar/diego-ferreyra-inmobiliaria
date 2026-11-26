// `getMyTasks` esconde las tareas futuras comparando contra "hoy". Ese "hoy" es el día de
// Argentina, no el de UTC (revisión 12.1): entre las 21:00 y las 24:00 de Argentina en UTC
// ya es mañana, y la "Llamada 2" de mañana aparecía en /tasks como de hoy.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ors: string[] = []

function armarPedido() {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit']) builder[m] = () => builder
  builder.or = (filtro: string) => {
    ors.push(filtro)
    return builder
  }
  builder.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
  return builder
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => armarPedido() }) }))

const { getMyTasks } = await import('./tasks')

beforeEach(() => {
  ors.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

describe('getMyTasks: el "hoy" de las pendientes', () => {
  it('a las 21:30 de Argentina (00:30 UTC del día siguiente) usa el día de Argentina', async () => {
    vi.setSystemTime(new Date('2026-11-26T00:30:00Z'))
    await getMyTasks('u-1')
    expect(ors).toEqual(['due_date.is.null,due_date.lte.2026-11-25'])
  })

  it('pasada la medianoche de Argentina ya es el día nuevo', async () => {
    vi.setSystemTime(new Date('2026-11-26T03:30:00Z')) // 00:30 del 26 en Argentina
    await getMyTasks('u-1')
    expect(ors).toEqual(['due_date.is.null,due_date.lte.2026-11-26'])
  })

  it('las completadas no se filtran por fecha', async () => {
    vi.setSystemTime(new Date('2026-11-26T00:30:00Z'))
    await getMyTasks('u-1', 'completed')
    expect(ors).toEqual([])
  })
})
