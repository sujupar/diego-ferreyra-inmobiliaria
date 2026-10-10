import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Revisión final, grupo E: una persona a la que se le agenda una visita NO es una
 * "consulta sin responder". GET /api/leads/count cuenta `property_leads.status='new'`
 * para el globito del Inbox y la tarjeta de /inicio, así que el comprador que crea
 * (o reusa) la ventana de agendar tiene que quedar 'scheduled'. Pero:
 *  - responder-consulta sigue creando 'new' (default), y
 *  - un comprador 'discarded' (o 'contacted') NO se toca: la guarda es `status='new'`.
 *
 * Supabase se reemplaza por un cliente falso que GRABA cada cadena de llamadas
 * (tabla + métodos + argumentos) y responde lo que diga cada test.
 */
interface Paso { metodo: string; args: unknown[] }
interface Llamada { tabla: string; pasos: Paso[] }
interface Respuesta { data: unknown; error: { message: string } | null }

const { registro } = vi.hoisted(() => {
  const registro: { llamadas: Llamada[]; responder: (l: Llamada) => Respuesta } = {
    llamadas: [],
    responder: () => ({ data: null, error: null }),
  }
  return { registro }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const llamada: Llamada = { tabla, pasos: [] }
      registro.llamadas.push(llamada)
      const cadena: object = new Proxy({}, {
        get(_objetivo, prop) {
          if (prop === 'then') {
            return (resolver: (r: Respuesta) => unknown, rechazar: (e: unknown) => unknown) =>
              Promise.resolve().then(() => registro.responder(llamada)).then(resolver, rechazar)
          }
          return (...args: unknown[]) => { llamada.pasos.push({ metodo: String(prop), args }); return cadena }
        },
      })
      return cadena
    },
  }),
}))

import { asegurarComprador, marcarCompradorAgendado } from './datos'

const PROP = '33333333-3333-4333-8333-333333333333'
const EXISTENTE = { id: 'lead-existente', phone: '+5491158234521', email: null, created_at: '2099-01-01T00:00:00Z' }

function usa(l: Llamada, metodo: string): Paso | undefined {
  return l.pasos.find(p => p.metodo === metodo)
}
function filtros(l: Llamada): Array<[string, unknown]> {
  return l.pasos.filter(p => p.metodo === 'eq').map(p => [String(p.args[0]), p.args[1]])
}
const inserts = () => registro.llamadas.filter(l => usa(l, 'insert'))
const updates = () => registro.llamadas.filter(l => usa(l, 'update'))

/** Búsqueda por teléfono: devuelve `candidatos`; insert devuelve un id nuevo; el resto ok. */
function base(candidatos: unknown[], fallaUpdateDeEstado = false) {
  registro.responder = (l) => {
    if (usa(l, 'insert')) return { data: { id: 'lead-nuevo' }, error: null }
    const upd = usa(l, 'update')
    if (upd) {
      const valores = upd.args[0] as Record<string, unknown>
      if ('status' in valores && fallaUpdateDeEstado) return { data: null, error: { message: 'boom' } }
      return { data: null, error: null }
    }
    if (usa(l, 'select')) return { data: candidatos, error: null }
    return { data: null, error: null }
  }
}

const entrada = {
  propertyId: PROP, nombre: 'Sofía Benítez', telefono: '+5491158234521', email: null,
  mensaje: null, source: 'visita:cartel', asignadoA: null,
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  registro.llamadas = []
})

describe('asegurarComprador — estado del comprador', () => {
  it('al CREAR desde la ventana de agendar queda "scheduled"', async () => {
    base([])
    expect(await asegurarComprador({ ...entrada, estado: 'scheduled' })).toBe('lead-nuevo')
    const fila = usa(inserts()[0], 'insert')?.args[0] as Record<string, unknown>
    expect(fila.status).toBe('scheduled')
  })
  it('sin estado pedido crea "new", como hasta ahora (lo usa responder-consulta)', async () => {
    base([])
    await asegurarComprador(entrada)
    const fila = usa(inserts()[0], 'insert')?.args[0] as Record<string, unknown>
    expect(fila.status).toBe('new')
  })
  it('al REUSAR con "scheduled" lo pasa a "scheduled" SOLO si hoy es "new" (guarda en el UPDATE)', async () => {
    base([EXISTENTE])
    expect(await asegurarComprador({ ...entrada, estado: 'scheduled' })).toBe('lead-existente')
    expect(inserts()).toHaveLength(0)
    const cambioDeEstado = updates().find(l => 'status' in (usa(l, 'update')?.args[0] as Record<string, unknown>))
    expect(cambioDeEstado).toBeDefined()
    expect(usa(cambioDeEstado as Llamada, 'update')?.args[0]).toEqual({ status: 'scheduled' })
    expect(filtros(cambioDeEstado as Llamada)).toEqual([['id', 'lead-existente'], ['status', 'new']])
  })
  it('al REUSAR sin estado pedido no toca el estado', async () => {
    base([EXISTENTE])
    await asegurarComprador(entrada)
    expect(updates().filter(l => 'status' in (usa(l, 'update')?.args[0] as Record<string, unknown>))).toHaveLength(0)
  })
  it('si el UPDATE del estado falla, lanza (supabase-js no lanza: hay que mirar { error })', async () => {
    base([EXISTENTE], true)
    await expect(asegurarComprador({ ...entrada, estado: 'scheduled' })).rejects.toThrow(/boom/)
  })
})

describe('marcarCompradorAgendado', () => {
  it('pasa a "scheduled" solo si hoy es "new" (un "discarded" no se toca)', async () => {
    base([])
    await marcarCompradorAgendado('lead-1')
    expect(updates()).toHaveLength(1)
    expect(updates()[0].tabla).toBe('property_leads')
    expect(usa(updates()[0], 'update')?.args[0]).toEqual({ status: 'scheduled' })
    expect(filtros(updates()[0])).toEqual([['id', 'lead-1'], ['status', 'new']])
  })
  it('si la base devuelve error, lanza', async () => {
    base([], true)
    await expect(marcarCompradorAgendado('lead-1')).rejects.toThrow(/boom/)
  })
})
