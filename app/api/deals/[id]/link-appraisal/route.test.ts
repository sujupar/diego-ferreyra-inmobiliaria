/**
 * `POST /api/deals/[id]/link-appraisal` era un UPDATE anónimo.
 *
 * Con el cliente service-role (RLS no aplica) y sin ningún guard, cualquiera
 * podía reapuntar `deals.appraisal_id` de un deal ajeno a la tasación que
 * quisiera — un deal queda mostrando la valuación de otra propiedad.
 *
 * Como es una ruta de escritura, lo que se afirma es que el UPDATE NO CORRIÓ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, requireAuthMock, escrituras } = vi.hoisted(() => ({
  estado: { autenticado: true },
  requireAuthMock: vi.fn(),
  escrituras: { updates: [] as Array<{ cambios: Record<string, unknown>; id: unknown }> },
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
    from: () => ({
      update: (cambios: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => {
          escrituras.updates.push({ cambios, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }),
}))

import { POST } from './route'

function pedir(cuerpo: Record<string, unknown> = { appraisal_id: 'tasacion-ajena' }) {
  return POST(
    new Request('http://local/api/deals/deal-1/link-appraisal', {
      method: 'POST',
      body: JSON.stringify(cuerpo),
    }) as never,
    { params: Promise.resolve({ id: 'deal-1' }) },
  )
}

beforeEach(() => {
  escrituras.updates = []
  requireAuthMock.mockReset()
  requireAuthMock.mockImplementation(async () => {
    if (!estado.autenticado) throw new RedirectDeNext()
    return { id: 'u1', email: 'quien@ejemplo.com', profile: { id: 'u1', role: 'asesor' } }
  })
})

describe('POST /api/deals/[id]/link-appraisal — sin sesión', () => {
  beforeEach(() => { estado.autenticado = false })

  it('NO escribe: cero updates sobre deals', async () => {
    await pedir().catch(() => {})
    expect(escrituras.updates).toEqual([])
  })

  it('corta con el redirect de Next, no con un {success:true}', async () => {
    await expect(pedir()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/login;307;' })
  })

  it('el guard corre ANTES del try — el redirect no queda tapado por un 500', async () => {
    const resultado = await pedir().then(
      (res) => ({ tipo: 'respuesta' as const, status: res.status }),
      (err) => ({ tipo: 'throw' as const, digest: (err as { digest?: string }).digest }),
    )
    expect(resultado.tipo).toBe('throw')
    expect(escrituras.updates).toHaveLength(0)
  })
})

describe('POST /api/deals/[id]/link-appraisal — con sesión válida', () => {
  beforeEach(() => { estado.autenticado = true })

  it('sigue vinculando igual que antes, y sigue SIN tocar la etapa del deal', async () => {
    const res = await pedir({ appraisal_id: 'tasacion-7' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(escrituras.updates).toHaveLength(1)
    expect(escrituras.updates[0].id).toBe('deal-1')
    expect(escrituras.updates[0].cambios).toMatchObject({ appraisal_id: 'tasacion-7' })
    expect(escrituras.updates[0].cambios).not.toHaveProperty('stage')
  })

  it('sin appraisal_id sigue siendo 400, sin escribir', async () => {
    const res = await pedir({})
    expect(res.status).toBe(400)
    expect(escrituras.updates).toEqual([])
  })
})
