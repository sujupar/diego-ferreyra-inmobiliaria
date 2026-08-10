/**
 * D1 (crítico) — el abogado no toca las tasaciones, por ninguna de las cuatro
 * puertas de esta ruta.
 *
 * El agujero estaba en `canAccessAppraisal`: `if (role !== 'asesor') return true`
 * dejaba pasar a todo rol que no fuera asesor. Como los handlers usan el cliente
 * service-role, la RLS tampoco frenaba nada, y el DELETE es un borrado DURO (no
 * hay papelera). El caso decisivo es el último de cada bloque: que la consulta
 * de borrado NUNCA se arme.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registro } = vi.hoisted(() => ({
  registro: {
    llamadas: [] as { metodo: string; args: unknown[] }[],
    fila: null as unknown,
    rol: 'admin' as string,
  },
}))

vi.mock('@supabase/supabase-js', () => {
  const builder: any = new Proxy({} as any, {
    get(_objetivo, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === 'then') {
        return (ok: any, mal: any) => Promise.resolve({ data: registro.fila, error: null }).then(ok, mal)
      }
      return (...args: any[]) => {
        registro.llamadas.push({ metodo: String(prop), args })
        if (prop === 'maybeSingle' || prop === 'single') {
          return Promise.resolve({ data: registro.fila, error: null })
        }
        return builder
      }
    },
  })
  return { createClient: () => builder }
})

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: 'yo-1',
    email: 'yo@local',
    profile: { id: 'yo-1', role: registro.rol },
  })),
}))
vi.mock('@/lib/supabase/appraisals-write', () => ({ replaceAppraisalComparables: vi.fn() }))

import { GET, PUT, PATCH, DELETE } from './route'

const params = Promise.resolve({ id: 'tasacion-1' })

function pedido(cuerpo?: unknown) {
  return new Request('http://local/api/appraisals/tasacion-1', {
    method: 'POST',
    body: JSON.stringify(cuerpo ?? {}),
    headers: { 'content-type': 'application/json' },
  }) as never
}

/** ¿Se llegó a armar la consulta de borrado? */
function huboBorrado() {
  return registro.llamadas.some(l => l.metodo === 'delete')
}

beforeEach(() => {
  registro.llamadas = []
  registro.fila = { assigned_to: 'otro-asesor', user_id: 'otro-asesor' }
  registro.rol = 'admin'
})

describe('DELETE /api/appraisals/[id]', () => {
  it('el abogado recibe 403 y la consulta de borrado NUNCA se arma', async () => {
    registro.rol = 'abogado'
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(403)
    expect(huboBorrado()).toBe(false)
  })

  it('un rol desconocido tampoco borra (falla cerrado)', async () => {
    registro.rol = 'rol_nuevo_sin_definir'
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(403)
    expect(huboBorrado()).toBe(false)
  })

  it('el asesor NO borra una tasación ajena', async () => {
    registro.rol = 'asesor'
    registro.fila = { assigned_to: 'otro-asesor', user_id: 'otro-asesor' }
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(403)
    expect(huboBorrado()).toBe(false)
  })

  it('el asesor SÍ borra la suya', async () => {
    registro.rol = 'asesor'
    registro.fila = { assigned_to: 'yo-1', user_id: null }
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(200)
    expect(huboBorrado()).toBe(true)
  })

  it('el admin borra cualquiera', async () => {
    registro.rol = 'admin'
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(200)
    expect(huboBorrado()).toBe(true)
  })

  it('el coordinador sigue pudiendo borrar (comportamiento intencional, no se toca)', async () => {
    registro.rol = 'coordinador'
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(200)
    expect(huboBorrado()).toBe(true)
  })
})

describe('el abogado tampoco lee ni edita tasaciones', () => {
  it('GET → 403', async () => {
    registro.rol = 'abogado'
    const res = await GET(pedido(), { params })
    expect(res.status).toBe(403)
  })

  it('PUT → 403', async () => {
    registro.rol = 'abogado'
    const res = await PUT(
      pedido({ subject: { title: 'x' }, valuationResult: {}, comparables: [] }),
      { params },
    )
    expect(res.status).toBe(403)
  })

  it('PATCH (report_edits) → 403', async () => {
    registro.rol = 'abogado'
    const res = await PATCH(pedido({ reportEdits: { foo: 1 } }), { params })
    expect(res.status).toBe(403)
  })
})
