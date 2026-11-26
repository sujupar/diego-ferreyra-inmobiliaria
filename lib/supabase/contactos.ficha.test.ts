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
