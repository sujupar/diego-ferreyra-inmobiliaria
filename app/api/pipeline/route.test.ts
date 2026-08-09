/**
 * `GET /api/pipeline` era un dump ANÓNIMO de la cartera entera.
 *
 * El middleware (`lib/supabase/middleware.ts`) tiene `'/api/'` en
 * `PUBLIC_ROUTES`, así que NO autentica ninguna ruta de API: cada una se
 * defiende sola. Esta no se defendía, y encima lee con el cliente service-role
 * (RLS no aplica). Verificado en vivo antes del arreglo: sin una sola cookie
 * devolvía `200` con 19.573 bytes — direcciones, precios y el roster de
 * asesores con nombre y apellido.
 *
 * Lo que sostiene el arreglo es esto: sin sesión NO sale ni un dato, y con
 * sesión la respuesta es exactamente la de antes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, requireAuthMock, capturado } = vi.hoisted(() => ({
  estado: { autenticado: true },
  requireAuthMock: vi.fn(),
  capturado: { tablas: [] as string[] },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: requireAuthMock,
}))

// El 307 a /login que produce Next cuando `requireAuth` llama a `redirect()`
// dentro de un route handler. Acá lo representamos con el mismo throw.
class RedirectDeNext extends Error {
  digest = 'NEXT_REDIRECT;replace;/login;307;'
  constructor() {
    super('NEXT_REDIRECT')
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      capturado.tablas.push(tabla)
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.order = () => q
      q.limit = () => q
      q.gte = () => q
      q.lte = () => q
      q.eq = () => q
      q.in = () => Promise.resolve({ data: [{ id: 'u1', full_name: 'Ana Asesora' }], error: null })
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const filas = tabla === 'appraisals'
          ? [{
              id: 'a1', property_title: 'Depto Palermo', property_location: 'Palermo',
              origin: 'embudo', assigned_to: 'u1', created_at: '2026-01-05T00:00:00Z',
              publication_price: 250000, currency: 'USD',
            }]
          : [{
              id: 'p1', address: 'Av. Siempreviva 742', neighborhood: 'Caballito',
              origin: 'embudo', status: 'approved', created_at: '2026-01-06T00:00:00Z',
              asking_price: 190000, currency: 'USD', assigned_to: 'u1',
            }]
        return Promise.resolve({ data: filas, error: null }).then(resolve, reject)
      }
      return q
    },
  }),
}))

import { GET } from './route'

function pedir(qs = '') {
  return GET(new Request(`http://local/api/pipeline${qs}`) as never)
}

beforeEach(() => {
  capturado.tablas = []
  requireAuthMock.mockReset()
  requireAuthMock.mockImplementation(async () => {
    if (!estado.autenticado) throw new RedirectDeNext()
    return { id: 'u1', email: 'quien@ejemplo.com', profile: { id: 'u1', role: 'admin' } }
  })
})

describe('GET /api/pipeline — sin sesión', () => {
  beforeEach(() => { estado.autenticado = false })

  it('NO devuelve la cartera: el handler corta con el redirect de Next, no con un 200', async () => {
    await expect(pedir()).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
  })

  it('NO llega a consultar la base: cero queries a appraisals/properties/profiles', async () => {
    await pedir().catch(() => {})
    expect(capturado.tablas).toEqual([])
  })

  it('el guard corre ANTES del try/catch — el redirect NO queda convertido en un 500 con datos', async () => {
    // Si `requireAuth` estuviera dentro del try, el catch lo atraparía y
    // respondería 500 en vez de propagar el redirect. Esto lo fija.
    const resultado = await pedir().then(
      (res) => ({ tipo: 'respuesta' as const, status: res.status }),
      (err) => ({ tipo: 'throw' as const, digest: (err as { digest?: string }).digest }),
    )
    expect(resultado.tipo).toBe('throw')
    expect(resultado).toMatchObject({ digest: 'NEXT_REDIRECT;replace;/login;307;' })
  })
})

describe('GET /api/pipeline — con sesión válida', () => {
  beforeEach(() => { estado.autenticado = true })

  it('sigue respondiendo 200 con la misma forma de antes', async () => {
    const res = await pedir()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['appraisals', 'properties'])
    expect(body.appraisals[0]).toMatchObject({
      id: 'a1',
      type: 'appraisal',
      title: 'Depto Palermo',
      location: 'Palermo',
      status: 'completed',
      assigned_to_name: 'Ana Asesora',
      price: 250000,
      currency: 'USD',
    })
    expect(body.properties[0]).toMatchObject({
      id: 'p1',
      type: 'property',
      title: 'Av. Siempreviva 742',
      location: 'Caballito',
      status: 'approved',
      assigned_to_name: 'Ana Asesora',
      price: 190000,
    })
  })

  it('los filtros de la pantalla siguen viajando (no rompió la query)', async () => {
    const res = await pedir('?from=2026-01-01&to=2026-01-31&assigned_to=u1')
    expect(res.status).toBe(200)
    expect(capturado.tablas).toContain('appraisals')
    expect(capturado.tablas).toContain('properties')
  })
})
