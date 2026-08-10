/**
 * D3 — recuperar una propiedad descartada desde el listado.
 *
 * El servidor IGNORA el `from` que manda el cliente y lo re-deriva de la base,
 * a propósito. Mientras esa derivación miraba solo `commercial_status`, una
 * propiedad descartada con la acción masiva (`PUT {status:'descartada'}`, que no
 * toca la columna comercial) se leía como 'disponible': arreglar la pantalla
 * hacía aparecer el botón "Disponible" y apretarlo no recuperaba nada — o peor,
 * lo rechazaba con "ya está en estado Disponible".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Respuesta { data?: unknown; error?: unknown }
interface Op { op: string; args: unknown[] }

const { estado } = vi.hoisted(() => ({
  estado: {
    role: 'coordinador',
    fila: null as Record<string, unknown> | null,
    consultas: [] as Array<{ tabla: string; ops: Array<{ op: string; args: unknown[] }> }>,
  },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'u1', profile: { role: estado.role } })),
}))
vi.mock('@/lib/auth/entity-access', () => ({
  canAccessProperty: vi.fn(async () => true),
}))

vi.mock('@supabase/supabase-js', () => {
  function builder(tabla: string) {
    const ops: Op[] = []
    estado.consultas.push({ tabla, ops })
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (typeof prop !== 'string') return undefined
        if (prop === 'then') {
          return (ok: (r: Respuesta) => unknown, fail?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(ok, fail)
        }
        if (prop === 'maybeSingle' || prop === 'single') {
          return () => { ops.push({ op: prop, args: [] }); return Promise.resolve({ data: estado.fila, error: null }) }
        }
        return (...args: unknown[]) => { ops.push({ op: prop, args }); return b }
      },
    })
    return b
  }
  return { createClient: () => ({ from: (tabla: string) => builder(tabla) }) }
})

import { POST } from './route'
import { NextRequest } from 'next/server'

function pedido(body: unknown) {
  return new NextRequest('http://local/api/properties/p1/commercial-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const params = Promise.resolve({ id: 'p1' })

/** El patch que efectivamente se escribió en `properties`. */
function patchEscrito(): Record<string, unknown> | null {
  const consulta = estado.consultas.find(c => c.tabla === 'properties' && c.ops.some(o => o.op === 'update'))
  if (!consulta) return null
  return consulta.ops.find(o => o.op === 'update')!.args[0] as Record<string, unknown>
}

beforeEach(() => {
  estado.role = 'coordinador'
  estado.consultas = []
  estado.fila = { commercial_status: 'disponible', currency: 'USD', status: 'approved' }
})

describe('POST commercial-status — el espejo heredado del descarte masivo', () => {
  it('marcar Disponible una descartada por el listado la devuelve al flujo activo', async () => {
    estado.fila = { commercial_status: 'disponible', currency: 'USD', status: 'descartada' }

    const res = await POST(pedido({ status: 'disponible' }), { params })
    expect(res.status).toBe(200)

    const patch = patchEscrito()
    expect(patch?.commercial_status).toBe('disponible')
    // Lo que limpia el espejo: sin esto la fila seguía con status='descartada'.
    expect(patch?.status).toBe('draft')
  })

  it('el evento del historial registra que venía de descartada, no de disponible', async () => {
    estado.fila = { commercial_status: 'disponible', currency: 'USD', status: 'descartada' }
    await POST(pedido({ status: 'disponible' }), { params })

    const evento = estado.consultas
      .find(c => c.tabla === 'property_status_events')
      ?.ops.find(o => o.op === 'insert')?.args[0] as Record<string, unknown> | undefined
    expect(evento?.from_status).toBe('descartada')
  })

  it('una propiedad viva sigue comportándose igual', async () => {
    estado.fila = { commercial_status: 'disponible', currency: 'USD', status: 'approved' }

    const res = await POST(pedido({ status: 'reservada' }), { params })
    expect(res.status).toBe(200)
    const patch = patchEscrito()
    expect(patch?.commercial_status).toBe('reservada')
    // Un cambio que no involucra descartada no toca la columna de captación.
    expect(patch?.status).toBeUndefined()
  })

  it('no se puede pasar al estado en el que ya está', async () => {
    estado.fila = { commercial_status: 'disponible', currency: 'USD', status: 'descartada' }
    const res = await POST(pedido({ status: 'descartada' }), { params })
    expect(res.status).toBe(400)
    expect(patchEscrito()).toBeNull()
  })

  it('el abogado no toca datos comerciales', async () => {
    estado.role = 'abogado'
    const res = await POST(pedido({ status: 'reservada' }), { params })
    expect(res.status).toBe(403)
    expect(patchEscrito()).toBeNull()
  })
})
