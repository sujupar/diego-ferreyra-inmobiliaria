/**
 * getPropertiesListPage — buscador de texto y rango de precio.
 *
 * Qué se prueba: que el texto y el precio se conviertan en las condiciones
 * correctas sobre la consulta del listado, y que los filtros que ya existían
 * sigan viajando al lado.
 *
 * El escapado en sí vive en `lib/filters/busqueda-texto.test.ts`; acá solo
 * importa que la consulta lo LLEVE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Op { op: string; args: unknown[] }

const { estado } = vi.hoisted(() => ({
  estado: { consultas: [] as Array<{ tabla: string; ops: Op[] }> },
}))

vi.mock('@supabase/supabase-js', () => {
  function builder(tabla: string) {
    const ops: Op[] = []
    estado.consultas.push({ tabla, ops })
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (typeof prop !== 'string') return undefined
        if (prop === 'then') {
          return (ok: (r: unknown) => unknown, fail?: (e: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null, count: 0 }).then(ok, fail)
        }
        return (...args: unknown[]) => { ops.push({ op: prop, args }); return b }
      },
    })
    return b
  }
  return { createClient: () => ({ from: (tabla: string) => builder(tabla) }) }
})

import { getPropertiesListPage } from './properties'

const PAGINA = { limit: 24, offset: 0 }
/** La consulta del listado — la única que lleva filtros (las banderas van por id). */
const listado = () => estado.consultas.find(c => c.tabla === 'vw_properties_list')!
const ops = (op: string) => listado().ops.filter(o => o.op === op)
const args = (op: string) => ops(op).map(o => o.args)

beforeEach(() => { estado.consultas = [] })

describe('getPropertiesListPage — buscador de texto', () => {
  it('sin q no agrega ninguna condicion de busqueda', async () => {
    await getPropertiesListPage({}, PAGINA)
    expect(ops('or')).toHaveLength(0)
  })

  it('busca en las columnas de ubicacion y tipo', async () => {
    await getPropertiesListPage({ q: 'almagro' }, PAGINA)
    const clausula = String(args('or')[0][0])
    for (const columna of ['address', 'neighborhood', 'city', 'property_type', 'operation_type']) {
      expect(clausula).toContain(`${columna}.imatch.`)
    }
  })

  it('dos palabras arman DOS condiciones — se combinan con Y', async () => {
    // Verificado contra la API real: dos or() encadenados se combinan con AND.
    await getPropertiesListPage({ q: 'palermo soho' }, PAGINA)
    expect(ops('or')).toHaveLength(2)
  })

  it('escapa los caracteres especiales con la barra DUPLICADA', async () => {
    // Sin esto, «2*D» devolvia 17 fichas en vez de 1.
    await getPropertiesListPage({ q: '2*D' }, PAGINA)
    expect(String(args('or')[0][0])).toContain('2\\\\*D')
  })
})

describe('getPropertiesListPage — rango de precio', () => {
  it('sin precio no toca asking_price', async () => {
    await getPropertiesListPage({}, PAGINA)
    expect(listado().ops.some(o => o.args[0] === 'asking_price')).toBe(false)
  })

  it('aplica minimo y maximo sobre asking_price', async () => {
    await getPropertiesListPage({ min: 100000, max: 300000 }, PAGINA)
    expect(ops('gte').find(o => o.args[0] === 'asking_price')?.args[1]).toBe(100000)
    expect(ops('lte').find(o => o.args[0] === 'asking_price')?.args[1]).toBe(300000)
  })

  it('con precio puesto, limita a dolares (contando el nulo como dolar)', async () => {
    // La pantalla muestra `currency || 'USD'`: si la consulta excluyera el nulo,
    // el listado y el filtro dirian cosas distintas de la misma ficha.
    await getPropertiesListPage({ min: 100000 }, PAGINA)
    const condiciones = args('or').map(a => String(a[0]))
    expect(condiciones.some(c => c.includes('currency.eq.USD') && c.includes('currency.is.null'))).toBe(true)
  })

  it('sin precio NO limita la moneda', async () => {
    await getPropertiesListPage({ q: 'almagro' }, PAGINA)
    expect(args('or').map(a => String(a[0])).some(c => c.includes('currency.eq.USD'))).toBe(false)
  })
})

describe('getPropertiesListPage — lo que ya funcionaba sigue igual', () => {
  it('los filtros de siempre siguen viajando junto al buscador', async () => {
    await getPropertiesListPage(
      { status: 'approved', assigned_to: 'asesor-1', q: 'almagro' },
      PAGINA,
    )
    expect(args('eq')).toContainEqual(['status', 'approved'])
    expect(args('eq')).toContainEqual(['assigned_to', 'asesor-1'])
    expect(ops('or').length).toBeGreaterThan(0)
  })

  it('la cohorte derivada convive con el buscador', async () => {
    await getPropertiesListPage({ cohorte: 'sin_fotos', q: 'palermo' }, PAGINA)
    expect(args('eq')).toContainEqual(['photo_count', 0])
    expect(ops('in').length).toBeGreaterThan(0)
    expect(ops('or').length).toBe(1)
  })

  it('el tramo pedido no lo altera el buscador', async () => {
    await getPropertiesListPage({ q: 'almagro' }, { limit: 24, offset: 48 })
    expect(args('range')[0]).toEqual([48, 71])
  })
})
