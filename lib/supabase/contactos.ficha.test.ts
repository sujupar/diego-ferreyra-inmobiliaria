/**
 * `leerDatosDeFicha` (tarea 7.1) con la base simulada: qué tablas lee, con qué filtros, y
 * que un error de cualquier lista tire en vez de llegar vacío. Lo importante para el
 * último contacto: la consulta de intentos NO filtra por `deal_id` y sí saca los anulados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Op = [string, unknown[]]
interface Pedido { tabla: string; ops: Op[] }
type Respuesta = { data: unknown; error: { message: string } | null }
let responder: (p: Pedido) => Respuesta
const pedidos: Pedido[] = []

function armarPedido(tabla: string) {
  const p: Pedido = { tabla, ops: [] }
  pedidos.push(p)
  const resolver = () => Promise.resolve(responder(p))
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
    builder[m] = (...args: unknown[]) => {
      p.ops.push([m, args])
      return builder
    }
  }
  builder.maybeSingle = () => { p.ops.push(['maybeSingle', []]); return resolver() }
  builder.then = (ok: (r: Respuesta) => unknown, ko: (e: unknown) => unknown) => resolver().then(ok, ko)
  return builder
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => armarPedido(t) }) }))

const { leerDatosDeFicha } = await import('./contactos')

const ok = (data: unknown): Respuesta => ({ data, error: null })
const de = (tabla: string) => pedidos.filter((p) => p.tabla === tabla)
const args = (p: Pedido, metodo: string) => p.ops.filter(([m]) => m === metodo).map(([, a]) => a)

const CONTACTO = { id: 'c-1', full_name: '[TEST] Ana', phone: null, email: null, origin: null, notes: null, assigned_to: null, created_by: null }

beforeEach(() => {
  pedidos.length = 0
  responder = (p) => {
    if (p.tabla === 'contacts') return ok(CONTACTO)
    if (p.tabla === 'contact_activities') return ok({ occurred_at: '2026-11-24T15:00:00.000Z' })
    return ok([])
  }
})

describe('leerDatosDeFicha', () => {
  it('contacto inexistente → null', async () => {
    responder = (p) => (p.tabla === 'contacts' ? ok(null) : ok([]))
    expect(await leerDatosDeFicha('c-x')).toBeNull()
  })

  it('arma los datos con el último intento', async () => {
    const d = await leerDatosDeFicha('c-1')
    expect(d).toMatchObject({ contacto: CONTACTO, procesos: [], tasaciones: [], propiedades: [], ultimoIntentoEn: '2026-11-24T15:00:00.000Z' })
  })

  it('último intento: llamadas y WhatsApp del contacto, sin anulados, el más nuevo, SIN filtrar por deal_id', async () => {
    await leerDatosDeFicha('c-1')
    const [q] = de('contact_activities')
    expect(args(q, 'eq')).toEqual([['contact_id', 'c-1']])
    expect(args(q, 'in')).toEqual([['kind', ['call', 'whatsapp_sent']]])
    expect(args(q, 'is')).toEqual([['voided_at', null]])
    expect(args(q, 'order')[0]).toEqual(['occurred_at', { ascending: false }])
    expect(args(q, 'limit')).toEqual([[1]])
    expect(JSON.stringify(q.ops)).not.toContain('deal_id')
  })

  it('los procesos traen visited_at, lost_at, stage_changed_at y los datos de campaña', async () => {
    await leerDatosDeFicha('c-1')
    const columnas = String(args(de('deals')[0], 'select')[0][0])
    for (const c of ['visited_at', 'lost_at', 'stage_changed_at', 'meta_campaign_name', 'meta_adset_name', 'meta_ad_name', 'scheduled_time']) {
      expect(columnas).toContain(c)
    }
  })

  it.each(['deals', 'appraisals', 'properties', 'contact_activities'])('si falla la lectura de %s, tira (nunca llega vacía)', async (tabla) => {
    const antes = responder
    responder = (p) => (p.tabla === tabla ? { data: null, error: { message: 'caída' } } : antes(p))
    await expect(leerDatosDeFicha('c-1')).rejects.toThrow(/caída/)
  })
})

// ROJO 1 del QA (2026-11-26): en producción casi todas las tasaciones y propiedades cuelgan
// del PROCESO (`deals.appraisal_id` / `deals.property_id`) y tienen `contact_id` vacío.
// "Archivos" tiene que sumar las dos fuentes, sin duplicados.
describe('leerDatosDeFicha: archivos del contacto y de sus procesos', () => {
  const TASACION = (id: string, creado: string) => ({
    id, property_title: `[TEST] ${id}`, property_location: null, created_at: creado, assigned_to: null, user_id: null,
  })
  const PROPIEDAD = (id: string, creado: string) => ({ id, address: `[TEST] ${id}`, neighborhood: null, created_at: creado, assigned_to: null })
  const filtro = (p: Pedido, metodo: string, columna: string) =>
    args(p, metodo).find((a) => a[0] === columna)?.[1] as unknown

  it('una tasación ligada solo por el proceso aparece', async () => {
    responder = (p) => {
      if (p.tabla === 'contacts') return ok(CONTACTO)
      if (p.tabla === 'contact_activities') return ok(null)
      if (p.tabla === 'deals') return ok([{ id: 'd-1', created_at: '2026-11-01T00:00:00Z', appraisal_id: 'a-1', property_id: null }])
      if (p.tabla === 'appraisals') return ok(filtro(p, 'in', 'id') ? [TASACION('a-1', '2026-11-02T00:00:00Z')] : [])
      return ok([])
    }
    const d = await leerDatosDeFicha('c-1')
    expect(d?.tasaciones.map((t) => t.id)).toEqual(['a-1'])
  })

  it('la misma tasación por contact_id y por proceso aparece una sola vez, y las dos fuentes se ordenan por fecha', async () => {
    responder = (p) => {
      if (p.tabla === 'contacts') return ok(CONTACTO)
      if (p.tabla === 'contact_activities') return ok(null)
      if (p.tabla === 'deals') {
        return ok([
          { id: 'd-1', created_at: '2026-11-01T00:00:00Z', appraisal_id: 'a-1', property_id: 'p-1' },
          { id: 'd-2', created_at: '2026-11-03T00:00:00Z', appraisal_id: 'a-2', property_id: null },
        ])
      }
      if (p.tabla === 'appraisals') {
        if (filtro(p, 'eq', 'contact_id')) return ok([TASACION('a-1', '2026-11-02T00:00:00Z')])
        return ok(filtro(p, 'in', 'id') ? [TASACION('a-2', '2026-11-04T00:00:00Z')] : [])
      }
      if (p.tabla === 'properties') return ok(filtro(p, 'eq', 'contact_id') ? [PROPIEDAD('p-1', '2026-11-05T00:00:00Z')] : [PROPIEDAD('p-1', '2026-11-05T00:00:00Z')])
      return ok([])
    }
    const d = await leerDatosDeFicha('c-1')
    expect(d?.tasaciones.map((t) => t.id)).toEqual(['a-2', 'a-1'])
    expect(d?.propiedades.map((p) => p.id)).toEqual(['p-1'])
    // Solo se piden por id las que no vinieron por contact_id.
    const porId = de('appraisals').map((q) => filtro(q, 'in', 'id')).filter(Boolean)
    expect(porId).toEqual([['a-2']])
    expect(de('properties').map((q) => filtro(q, 'in', 'id')).filter(Boolean)).toEqual([])
  })

  it('una propiedad ligada solo por el proceso aparece', async () => {
    responder = (p) => {
      if (p.tabla === 'contacts') return ok(CONTACTO)
      if (p.tabla === 'contact_activities') return ok(null)
      if (p.tabla === 'deals') return ok([{ id: 'd-1', created_at: '2026-11-01T00:00:00Z', appraisal_id: null, property_id: 'p-9' }])
      if (p.tabla === 'properties') return ok(filtro(p, 'in', 'id') ? [PROPIEDAD('p-9', '2026-11-02T00:00:00Z')] : [])
      return ok([])
    }
    const d = await leerDatosDeFicha('c-1')
    expect(d?.propiedades.map((p) => p.id)).toEqual(['p-9'])
  })

  it('las tasaciones se piden con columnas explícitas, nunca * ni property_images', async () => {
    responder = (p) => {
      if (p.tabla === 'contacts') return ok(CONTACTO)
      if (p.tabla === 'contact_activities') return ok(null)
      if (p.tabla === 'deals') return ok([{ id: 'd-1', created_at: '2026-11-01T00:00:00Z', appraisal_id: 'a-1', property_id: null }])
      return ok([])
    }
    await leerDatosDeFicha('c-1')
    const tasaciones = de('appraisals')
    expect(tasaciones).toHaveLength(2)
    for (const q of tasaciones) {
      const columnas = String(args(q, 'select')[0][0])
      expect(columnas).not.toContain('*')
      expect(columnas).not.toContain('property_images')
    }
  })

  it('los procesos traen appraisal_id y property_id', async () => {
    await leerDatosDeFicha('c-1')
    const columnas = String(args(de('deals')[0], 'select')[0][0])
    expect(columnas).toContain('appraisal_id')
    expect(columnas).toContain('property_id')
  })

  it('sin procesos con tasación ni propiedad no hace pedidos de más', async () => {
    await leerDatosDeFicha('c-1')
    expect(de('appraisals')).toHaveLength(1)
    expect(de('properties')).toHaveLength(1)
  })

  it('si falla la lectura de las tasaciones del proceso, tira (nunca llega vacía)', async () => {
    responder = (p) => {
      if (p.tabla === 'contacts') return ok(CONTACTO)
      if (p.tabla === 'contact_activities') return ok(null)
      if (p.tabla === 'deals') return ok([{ id: 'd-1', created_at: '2026-11-01T00:00:00Z', appraisal_id: 'a-1', property_id: null }])
      if (p.tabla === 'appraisals' && filtro(p, 'in', 'id')) return { data: null, error: { message: 'caída por proceso' } }
      return ok([])
    }
    await expect(leerDatosDeFicha('c-1')).rejects.toThrow(/caída por proceso/)
  })
})
