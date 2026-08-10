/**
 * Las CUATRO fuentes de listado abren el rango de fechas como día ARGENTINO.
 *
 * El helper puro está probado en `lib/filters/rango-fechas.test.ts`. Lo que se
 * prueba acá es otra cosa y es la que se rompe sola: que cada consulta REAL lo
 * use. Un helper impecable que un solo `.gte()` no llama no arregla nada — y ya
 * pasó en este proyecto que se refactoró el productor y quedó un consumidor
 * viejo (ver el bug de `feed_square` en CLAUDE.md).
 *
 * Instante de referencia: `2026-08-08T02:30:00Z` es el 7 de agosto a las 23:30
 * en Argentina. Filtrar por "2026-08-07" tiene que cubrir ese instante.
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

import { getProperties, getPropertiesListPage } from './properties'
import { getContacts } from './contacts'
import { getDeals } from './deals'

const DIA = '2026-08-07'
const ABRE = '2026-08-07T00:00:00.000-03:00'
const CIERRA = '2026-08-07T23:59:59.999999-03:00'
/** 7 de agosto, 23:30 en Argentina. Con el corte viejo caía afuera del día 7. */
const CASI_MEDIANOCHE = new Date('2026-08-08T02:30:00Z').getTime()

beforeEach(() => {
  registro.llamadas = []
})

function limites() {
  const desde = registro.llamadas.filter(l => l.metodo === 'gte').map(l => l.valor)
  const hasta = registro.llamadas.filter(l => l.metodo === 'lte').map(l => l.valor)
  return { desde, hasta }
}

/** Toda punta registrada tiene que ser la del día local, en TODAS las consultas. */
function esperarDiaLocalCompleto() {
  const { desde, hasta } = limites()
  expect(desde.length).toBeGreaterThan(0)
  expect(hasta.length).toBeGreaterThan(0)
  for (const v of desde) expect(v).toBe(ABRE)
  for (const v of hasta) expect(v).toBe(CIERRA)
  // Y el instante de las 23:30 locales cae adentro (con 'T23:59:59Z' no caía).
  expect(new Date(String(hasta[0])).getTime()).toBeGreaterThanOrEqual(CASI_MEDIANOCHE)
  expect(new Date(String(desde[0])).getTime()).toBeLessThanOrEqual(CASI_MEDIANOCHE)
}

describe('getProperties', () => {
  it('filtra por el día argentino completo', async () => {
    await getProperties({ from: DIA, to: DIA })
    esperarDiaLocalCompleto()
  })

  it('un instante ISO completo pasa sin tocar', async () => {
    await getProperties({ from: '2026-08-07T03:00:00.000Z', to: '2026-08-08T02:59:59.999Z' })
    expect(limites()).toEqual({
      desde: ['2026-08-07T03:00:00.000Z'],
      hasta: ['2026-08-08T02:59:59.999Z'],
    })
  })
})

describe('getPropertiesListPage', () => {
  /**
   * Antes esto exigía el MISMO corte en DOS consultas (listado + flags), porque
   * las dos repetían filtros, orden y `range` esperando caer en el mismo
   * conjunto de filas. Ese acoplamiento se eliminó: la segunda consulta ahora
   * pide las banderas POR LOS IDS de la página ya resuelta, así que no tiene
   * fechas que desincronizar — el desalineo dejó de ser posible por
   * construcción, en vez de depender de que alguien copiara bien los `if`.
   * Ver `lib/supabase/properties.test.ts` para el merge por id.
   */
  it('filtra por el día argentino completo, con un solo corte de fechas', async () => {
    await getPropertiesListPage({ from: DIA, to: DIA }, { limit: 24, offset: 0 })
    const { desde, hasta } = limites()
    expect(desde).toHaveLength(1)
    expect(hasta).toHaveLength(1)
    esperarDiaLocalCompleto()
  })
})

describe('getContacts', () => {
  it('filtra por el día argentino completo', async () => {
    await getContacts({ from: DIA, to: DIA })
    esperarDiaLocalCompleto()
  })

  it('un instante ISO completo pasa sin tocar', async () => {
    await getContacts({ from: '2026-08-07T03:00:00.000Z', to: '2026-08-08T02:59:59.999Z' })
    expect(limites()).toEqual({
      desde: ['2026-08-07T03:00:00.000Z'],
      hasta: ['2026-08-08T02:59:59.999Z'],
    })
  })
})

describe('getDeals', () => {
  it('filtra por el día argentino completo en el listado Y en los contadores de etapa', async () => {
    await getDeals({ from: DIA, to: DIA })
    const { desde, hasta } = limites()
    // Listado + conteo por etapa: las tarjetas tienen que cuadrar con la tabla.
    expect(desde).toHaveLength(2)
    expect(hasta).toHaveLength(2)
    esperarDiaLocalCompleto()
  })

  it('un instante ISO completo pasa sin tocar', async () => {
    await getDeals({ from: '2026-08-07T03:00:00.000Z', to: '2026-08-08T02:59:59.999Z' })
    const { desde, hasta } = limites()
    expect(new Set(desde)).toEqual(new Set(['2026-08-07T03:00:00.000Z']))
    expect(new Set(hasta)).toEqual(new Set(['2026-08-08T02:59:59.999Z']))
  })
})
