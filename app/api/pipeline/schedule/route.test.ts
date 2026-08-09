/**
 * `POST /api/pipeline/schedule` era una ESCRITURA anónima.
 *
 * Con el cliente service-role (RLS no aplica) y sin ningún guard, cualquiera
 * podía insertar filas en `contacts` y en `scheduled_appraisals` — o sea,
 * ensuciar el CRM de un negocio real desde afuera, sin sesión.
 *
 * Para una ruta de escritura no alcanza con mirar el status: lo que hay que
 * afirmar es que la escritura NO OCURRIÓ. Estos tests cuentan los inserts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, requireAuthMock, escrituras } = vi.hoisted(() => ({
  estado: { autenticado: true },
  requireAuthMock: vi.fn(),
  escrituras: { inserts: [] as Array<{ tabla: string; fila: Record<string, unknown> }> },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: requireAuthMock,
}))

class RedirectDeNext extends Error {
  digest = 'NEXT_REDIRECT;replace;/login;307;'
  constructor() {
    super('NEXT_REDIRECT')
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      insert: (fila: Record<string, unknown>) => {
        escrituras.inserts.push({ tabla, fila })
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: { id: tabla === 'contacts' ? 'contacto-nuevo' : 'agenda-nueva' },
              error: null,
            }),
          }),
        }
      },
    }),
  }),
}))

import { POST } from './route'

const CUERPO = {
  contact_name: 'Intruso Anónimo',
  contact_phone: '1155550000',
  contact_email: 'intruso@ejemplo.com',
  property_address: 'Calle Falsa 123',
  scheduled_date: '2026-09-01',
  scheduled_time: '10:00',
  origin: 'embudo',
  notes: 'inyectado sin sesión',
}

function pedir(cuerpo: Record<string, unknown> = CUERPO) {
  return POST(new Request('http://local/api/pipeline/schedule', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  }) as never)
}

beforeEach(() => {
  escrituras.inserts = []
  requireAuthMock.mockReset()
  requireAuthMock.mockImplementation(async () => {
    if (!estado.autenticado) throw new RedirectDeNext()
    return { id: 'u1', email: 'quien@ejemplo.com', profile: { id: 'u1', role: 'coordinador' } }
  })
})

describe('POST /api/pipeline/schedule — sin sesión', () => {
  beforeEach(() => { estado.autenticado = false })

  it('NO escribe: cero inserts en contacts y en scheduled_appraisals', async () => {
    await pedir().catch(() => {})
    expect(escrituras.inserts).toEqual([])
  })

  it('corta con el redirect de Next, no con un 200 de éxito', async () => {
    await expect(pedir()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/login;307;' })
  })

  it('el guard corre ANTES de leer el body — ni siquiera se parsea lo que manda el anónimo', async () => {
    // Con el guard adentro del try, el catch respondería 500 y (peor) el
    // insert ya habría corrido. Esto fija las dos cosas a la vez.
    const resultado = await pedir().then(
      (res) => ({ tipo: 'respuesta' as const, status: res.status }),
      (err) => ({ tipo: 'throw' as const, digest: (err as { digest?: string }).digest }),
    )
    expect(resultado.tipo).toBe('throw')
    expect(escrituras.inserts).toHaveLength(0)
  })
})

describe('POST /api/pipeline/schedule — con sesión válida', () => {
  beforeEach(() => { estado.autenticado = true })

  it('sigue agendando igual que antes: crea el contacto y la tasación agendada', async () => {
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      id: 'agenda-nueva',
      contact_id: 'contacto-nuevo',
    })
    expect(escrituras.inserts.map(i => i.tabla)).toEqual(['contacts', 'scheduled_appraisals'])
    expect(escrituras.inserts[1].fila).toMatchObject({
      contact_name: 'Intruso Anónimo',
      property_address: 'Calle Falsa 123',
      scheduled_date: '2026-09-01',
      contact_id: 'contacto-nuevo',
    })
  })

  it('la validación de campos requeridos sigue viva (400, sin escribir)', async () => {
    const res = await pedir({ contact_name: 'Solo el nombre' })
    expect(res.status).toBe(400)
    expect(escrituras.inserts).toEqual([])
  })
})
