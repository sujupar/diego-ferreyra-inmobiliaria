/**
 * getPropertiesListPage — buscador de texto y rango de precio.
 *
 * LO QUE MÁS IMPORTA ACÁ: esta función hace DOS consultas paginadas en paralelo
 * —la vista `vw_properties_list` y la tabla `properties` para dos banderas que
 * la vista no tiene— y después las cruza por id ASUMIENDO que las dos
 * devuelven el mismo conjunto de filas para el mismo tramo.
 *
 * Si un filtro nuevo se aplica a una sola, esa suposición se rompe: las
 * banderas quedarían pegadas a la propiedad equivocada, o directamente
 * ausentes, y no lo avisaría nadie. Por eso la prueba central compara que las
 * condiciones lleguen IDÉNTICAS a las dos consultas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registro } = vi.hoisted(() => ({
  registro: { porTabla: {} as Record<string, Array<{ metodo: string; args: unknown[] }>> },
}))

vi.mock('@supabase/supabase-js', () => {
  function builderPara(tabla: string) {
    const llamadas = (registro.porTabla[tabla] ??= [])
    const builder: any = new Proxy({} as any, {
      get(_objetivo, prop) {
        if (typeof prop === 'symbol') return undefined
        if (prop === 'then') {
          return (ok: any, mal: any) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok, mal)
        }
        return (...args: any[]) => {
          llamadas.push({ metodo: String(prop), args })
          return builder
        }
      },
    })
    return builder
  }
  return { createClient: () => ({ from: (tabla: string) => builderPara(tabla) }) }
})

import { getPropertiesListPage } from './properties'

const VISTA = 'vw_properties_list'
const TABLA = 'properties'
const PAGINA = { limit: 24, offset: 0 }

function llamadas(tabla: string, metodo: string) {
  return (registro.porTabla[tabla] || []).filter(l => l.metodo === metodo)
}
function args(tabla: string, metodo: string) {
  return llamadas(tabla, metodo).map(l => l.args)
}

beforeEach(() => {
  registro.porTabla = {}
})

describe('getPropertiesListPage — buscador de texto', () => {
  it('sin q no agrega ninguna condicion de busqueda', async () => {
    await getPropertiesListPage({}, PAGINA)
    expect(llamadas(VISTA, 'or')).toHaveLength(0)
    expect(llamadas(TABLA, 'or')).toHaveLength(0)
  })

  it('busca en las columnas de ubicacion y tipo', async () => {
    await getPropertiesListPage({ q: 'almagro' }, PAGINA)
    const clausula = String(args(VISTA, 'or')[0][0])
    for (const columna of ['address', 'neighborhood', 'city', 'property_type', 'operation_type']) {
      expect(clausula).toContain(`${columna}.imatch.`)
    }
  })

  it('dos palabras arman DOS condiciones — se combinan con Y', async () => {
    await getPropertiesListPage({ q: 'palermo soho' }, PAGINA)
    expect(llamadas(VISTA, 'or')).toHaveLength(2)
  })

  it('LA CONDICION LLEGA IDENTICA A LAS DOS CONSULTAS', async () => {
    // Si esto se rompe, el cruce por id junta la ficha de una consulta con las
    // banderas de otra. Silencioso y muy dificil de ver a ojo.
    await getPropertiesListPage({ q: 'palermo soho' }, PAGINA)
    expect(args(TABLA, 'or')).toEqual(args(VISTA, 'or'))
  })

  it('escapa los caracteres especiales con la barra DUPLICADA', async () => {
    await getPropertiesListPage({ q: '2*D' }, PAGINA)
    expect(String(args(VISTA, 'or')[0][0])).toContain('2\\\\*D')
  })
})

describe('getPropertiesListPage — rango de precio', () => {
  it('sin precio no toca asking_price', async () => {
    await getPropertiesListPage({}, PAGINA)
    const toca = (registro.porTabla[VISTA] || []).some(l => l.args[0] === 'asking_price')
    expect(toca).toBe(false)
  })

  it('aplica minimo y maximo sobre asking_price', async () => {
    await getPropertiesListPage({ min: 100000, max: 300000 }, PAGINA)
    expect(llamadas(VISTA, 'gte').find(l => l.args[0] === 'asking_price')?.args[1]).toBe(100000)
    expect(llamadas(VISTA, 'lte').find(l => l.args[0] === 'asking_price')?.args[1]).toBe(300000)
  })

  it('EL PRECIO TAMBIEN LLEGA IDENTICO A LAS DOS CONSULTAS', async () => {
    await getPropertiesListPage({ min: 100000, max: 300000 }, PAGINA)
    expect(args(TABLA, 'gte')).toEqual(args(VISTA, 'gte'))
    expect(args(TABLA, 'lte')).toEqual(args(VISTA, 'lte'))
  })

  it('con precio puesto, limita a dolares (contando el nulo como dolar)', async () => {
    await getPropertiesListPage({ min: 100000 }, PAGINA)
    const condiciones = args(VISTA, 'or').map(a => String(a[0]))
    expect(condiciones.some(c => c.includes('currency.eq.USD') && c.includes('currency.is.null'))).toBe(true)
  })

  it('sin precio NO limita la moneda', async () => {
    await getPropertiesListPage({ q: 'almagro' }, PAGINA)
    const condiciones = args(VISTA, 'or').map(a => String(a[0]))
    expect(condiciones.some(c => c.includes('currency.eq.USD'))).toBe(false)
  })
})

describe('getPropertiesListPage — lo que ya funcionaba sigue igual', () => {
  it('los filtros viejos siguen llegando a las dos consultas', async () => {
    await getPropertiesListPage(
      { status: 'approved', origin: 'embudo', assigned_to: 'asesor-1' },
      PAGINA,
    )
    expect(args(TABLA, 'eq')).toEqual(args(VISTA, 'eq'))
    expect(args(VISTA, 'eq')).toContainEqual(['status', 'approved'])
    expect(args(VISTA, 'eq')).toContainEqual(['assigned_to', 'asesor-1'])
  })

  it('el tramo pedido es el mismo en las dos', async () => {
    await getPropertiesListPage({ q: 'almagro' }, { limit: 24, offset: 48 })
    expect(args(TABLA, 'range')).toEqual(args(VISTA, 'range'))
    expect(args(VISTA, 'range')[0]).toEqual([48, 71])
  })
})
