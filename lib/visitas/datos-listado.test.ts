import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Paso { metodo: string; args: unknown[] }
interface Llamada { tabla: string; pasos: Paso[] }
interface Respuesta { data: unknown; error: { message: string } | null; count?: number | null }

const { registro } = vi.hoisted(() => {
  const registro: { llamadas: Llamada[]; responder: (l: Llamada) => Respuesta } = {
    llamadas: [],
    responder: () => ({ data: [], error: null }),
  }
  return { registro }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const llamada: Llamada = { tabla, pasos: [] }
      registro.llamadas.push(llamada)
      const cadena: object = new Proxy({}, {
        get(_o, prop) {
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

import { listarVisitas, todasLasVisitas, TAMANO_PAGINA_BASE } from './datos'

const YO = '22222222-2222-4222-8222-222222222222'
const fila = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, property_id: 'p1', advisor_id: YO, created_by: YO,
  client_name: 'Sofía', client_phone: null, status: 'scheduled', origin: 'portal', origin_detail: 'zonaprop',
  outcome_reason: null, scheduled_at: '2026-10-14T13:30:00+00:00', created_at: '2026-10-10T15:00:00+00:00',
  updated_at: '2026-10-10T15:00:00.123456+00:00', confirmed_at: null, outcome_at: null,
  property: { address: 'Doblas 248', neighborhood: 'Caballito' }, advisor: { full_name: 'Lucas' },
  lead: { created_at: '2026-10-09T15:00:00+00:00' }, consulta: { received_at: null, created_at: '2026-10-08T15:00:00+00:00' },
})
const pasos = (l: Llamada, metodo: string) => l.pasos.filter(p => p.metodo === metodo).map(p => p.args)

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  registro.llamadas = []
  registro.responder = () => ({ data: [fila(1)], error: null, count: 1 })
})

describe('listarVisitas', () => {
  it('asesor: lo asignado O lo que creó, con todos los filtros, orden estable y rango', async () => {
    const r = await listarVisitas({
      alcance: { tipo: 'propio', usuarioId: YO }, propiedadId: 'p1', origen: 'portal',
      estados: ['scheduled'], desde: '2026-10-01T00:00:00.000-03:00', hasta: '2026-10-31T23:59:59.999999-03:00',
    }, { desde: 50, hasta: 99 }, 'desc')
    const l = registro.llamadas[0]
    expect(l.tabla).toBe('property_visits')
    expect(pasos(l, 'or')).toEqual([[`advisor_id.eq.${YO},created_by.eq.${YO}`]])
    expect(pasos(l, 'eq')).toEqual([['property_id', 'p1'], ['origin', 'portal']])
    expect(pasos(l, 'in')).toEqual([['status', ['scheduled']]])
    expect(pasos(l, 'gte')).toEqual([['scheduled_at', '2026-10-01T00:00:00.000-03:00']])
    expect(pasos(l, 'lte')).toEqual([['scheduled_at', '2026-10-31T23:59:59.999999-03:00']])
    expect(pasos(l, 'order')).toEqual([['scheduled_at', { ascending: false }], ['id', { ascending: false }]])
    expect(pasos(l, 'range')).toEqual([[50, 99]])
    expect(pasos(l, 'select')[0][1]).toEqual({ count: 'exact' })
    expect(r.total).toBe(1)
  })
  it('aplana la fila: dirección, asesor, registro y consulta (sin fecha del portal usa la de alta)', async () => {
    const r = await listarVisitas({ alcance: { tipo: 'todo' } }, { desde: 0, hasta: 49 }, 'desc')
    expect(r.filas[0]).toMatchObject({
      direccion: 'Doblas 248', barrio: 'Caballito', asesor_nombre: 'Lucas', origin: 'portal',
      registro_creado_at: '2026-10-09T15:00:00+00:00', consulta_recibida_at: '2026-10-08T15:00:00+00:00',
      updated_at: '2026-10-10T15:00:00.123456+00:00',
    })
  })
  it('"sin origen" filtra por NULL; operaciones filtra por asesor con eq', async () => {
    await listarVisitas({ alcance: { tipo: 'todo' }, asesorId: YO, origen: 'sin_origen' }, { desde: 0, hasta: 49 }, 'asc')
    const l = registro.llamadas[0]
    expect(pasos(l, 'or')).toEqual([])
    expect(pasos(l, 'eq')).toEqual([['advisor_id', YO]])
    expect(pasos(l, 'is')).toEqual([['origin', null]])
  })
  it('un usuario que no es UUID no llega a armar el or()', async () => {
    await expect(listarVisitas({ alcance: { tipo: 'propio', usuarioId: 'x,created_by.neq.null' } }, { desde: 0, hasta: 9 }, 'asc'))
      .rejects.toThrow('usuarioId no es un UUID válido')
  })
  it('un error de la base se propaga con contexto', async () => {
    registro.responder = () => ({ data: null, error: { message: 'boom' } })
    await expect(listarVisitas({ alcance: { tipo: 'todo' } }, { desde: 0, hasta: 9 }, 'asc')).rejects.toThrow('listar visitas: boom')
  })
})

describe('todasLasVisitas: pagina de a 1000 (tope de PostgREST)', () => {
  it('pide páginas hasta que una viene incompleta', async () => {
    let n = 0
    registro.responder = () => {
      n += 1
      const largo = n === 1 ? TAMANO_PAGINA_BASE : 3
      return { data: Array.from({ length: largo }, (_, i) => fila(n * 10_000 + i)), error: null }
    }
    const r = await todasLasVisitas({ alcance: { tipo: 'todo' } })
    expect(r.filas).toHaveLength(1003)
    expect(r.truncado).toBe(false)
    expect(registro.llamadas.map(l => pasos(l, 'range')[0])).toEqual([[0, 999], [1000, 1999]])
    expect(pasos(registro.llamadas[0], 'order')).toEqual([['scheduled_at', { ascending: true }], ['id', { ascending: true }]])
  })
  it('si llega al techo de 20 páginas lo avisa', async () => {
    registro.responder = () => ({ data: Array.from({ length: TAMANO_PAGINA_BASE }, (_, i) => fila(i)), error: null })
    const r = await todasLasVisitas({ alcance: { tipo: 'todo' } })
    expect(r.truncado).toBe(true)
    expect(registro.llamadas).toHaveLength(20)
  })
})
