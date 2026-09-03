/**
 * GET /api/properties — que el buscador y el rango de precio LLEGUEN a la
 * consulta.
 *
 * Es una prueba de plomería, y por eso mismo vale: la ruta ya venía olvidando
 * pasar parámetros nuevos (el orden real en el servidor se agregó después).
 * Acá se fija que `q`, `min` y `max` no se pierdan en el camino, y que el
 * precio llegue como NÚMERO ya interpretado — no como el texto crudo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registro } = vi.hoisted(() => ({
  registro: { filtros: [] as unknown[] },
}))

vi.mock('@/lib/supabase/properties', () => ({
  getPropertiesListPage: vi.fn(async (filtros: unknown) => {
    registro.filtros.push(filtros)
    return { data: [], total: 0, hasMore: false }
  }),
  createProperty: vi.fn(),
}))
vi.mock('@/lib/auth/require-role', () => ({ requireAuth: vi.fn(async () => ({ id: 'yo', profile: { id: 'yo', role: 'admin' } })) }))
vi.mock('@/lib/email/notifications/property-created', () => ({ notifyPropertyCreated: vi.fn() }))
vi.mock('@/lib/email/notify-with-escalation', () => ({ notifyWithEscalation: vi.fn() }))
vi.mock('@/lib/properties/geocode-on-write', () => ({ geocodePropertyBestEffort: vi.fn() }))

import { GET } from './route'

function pedir(qs: string) {
  return GET(new Request(`http://local/api/properties${qs}`) as never)
}
const ultimoFiltro = () => registro.filtros[registro.filtros.length - 1] as Record<string, unknown>

beforeEach(() => {
  registro.filtros = []
})

describe('GET /api/properties — buscador', () => {
  it('pasa el texto buscado', async () => {
    await pedir('?q=almagro')
    expect(ultimoFiltro().q).toBe('almagro')
  })

  it('sin q no manda texto', async () => {
    await pedir('')
    expect(ultimoFiltro().q).toBeUndefined()
  })

  it('pasa el precio como NUMERO, no como texto', async () => {
    await pedir('?min=100000&max=300000')
    expect(ultimoFiltro().min).toBe(100000)
    expect(ultimoFiltro().max).toBe(300000)
  })

  it('entiende el punto de miles argentino', async () => {
    await pedir('?min=150.000')
    expect(ultimoFiltro().min).toBe(150000)
  })

  it('un precio que no es numero no viaja', async () => {
    const res = await pedir('?min=abc')
    expect(res.status).toBe(200)
    expect(ultimoFiltro().min).toBeUndefined()
  })

  it('los filtros de siempre siguen viajando', async () => {
    await pedir('?status=approved&from=2026-08-01&to=2026-08-31&assigned_to=a-1')
    const f = ultimoFiltro()
    expect(f.status).toBe('approved')
    expect(f.from).toBe('2026-08-01')
    expect(f.to).toBe('2026-08-31')
    expect(f.assigned_to).toBe('a-1')
  })
})
