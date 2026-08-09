/**
 * La ruta sin `id`: genera la descripción para una propiedad que TODAVÍA NO
 * EXISTE. Lo que se verifica acá es sobre todo lo que NO tiene que pasar —
 * ninguna escritura, ningún mail, ningún abogado adentro — y que un corte de
 * tiempo salga como JSON legible y no como la página HTML del gateway.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface EntradaGenerador {
  property: Record<string, unknown>
  buyerProfile?: string
  extraNotes?: string
  timeoutMs?: number
}

const { estado } = vi.hoisted(() => ({
  estado: {
    rol: 'asesor' as string,
    generar: vi.fn(async (_entrada: EntradaGenerador) => (
      { title: 'Titular', subtitle: 'Subtítulo', body: 'Cuerpo' }
    )),
  },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', profile: { role: estado.rol } })),
}))

vi.mock('@/lib/marketing/portal-descriptions/generator', () => ({
  generatePortalDescription: (entrada: EntradaGenerador) => estado.generar(entrada),
}))

import { POST } from './route'

const datos = {
  address: 'Junín 1200', neighborhood: 'Recoleta', city: 'CABA',
  property_type: 'departamento', operation_type: 'venta',
  asking_price: 250000, currency: 'USD', rooms: 3,
}

function pedido(body: unknown): Request {
  return new Request('http://local/api/properties/generate-description', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  estado.rol = 'asesor'
  estado.generar = vi.fn(async (_entrada: EntradaGenerador) => (
    { title: 'Titular', subtitle: 'Subtítulo', body: 'Cuerpo' }
  ))
})

describe('POST /api/properties/generate-description', () => {
  it('devuelve lo generado sin tocar la base', async () => {
    const res = await POST(pedido({ datos }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      generated: { title: 'Titular', subtitle: 'Subtítulo', body: 'Cuerpo' },
    })
    expect(estado.generar).toHaveBeenCalledTimes(1)
  })

  it('le pasa al generador los datos del formulario, no un id', async () => {
    await POST(pedido({ datos, buyerProfile: 'pareja joven', extraNotes: 'piso alto' }))
    const arg = estado.generar.mock.calls[0][0]
    expect(arg.property.address).toBe('Junín 1200')
    expect(arg.buyerProfile).toBe('pareja joven')
    expect(arg.extraNotes).toBe('piso alto')
  })

  it('le pone techo de tiempo a la llamada al modelo', async () => {
    await POST(pedido({ datos }))
    const arg = estado.generar.mock.calls[0][0]
    expect(typeof arg.timeoutMs).toBe('number')
    // Netlify corta bastante antes de los 60s: si el techo no es MENOR, el
    // gateway contesta HTML de error y el cliente ve "Unexpected token '<'".
    expect(arg.timeoutMs).toBeGreaterThan(0)
    expect(arg.timeoutMs as number).toBeLessThan(26_000)
  })

  it('el abogado no genera copy comercial', async () => {
    estado.rol = 'abogado'
    const res = await POST(pedido({ datos }))
    expect(res.status).toBe(403)
    expect(estado.generar).not.toHaveBeenCalled()
  })

  it.each(['admin', 'dueno', 'coordinador', 'asesor'])('%s sí puede generar', async rol => {
    estado.rol = rol
    const res = await POST(pedido({ datos }))
    expect(res.status).toBe(200)
  })

  it('sin dirección responde 400 y no gasta una llamada al modelo', async () => {
    const res = await POST(pedido({ datos: { ...datos, address: '' } }))
    expect(res.status).toBe(400)
    expect(estado.generar).not.toHaveBeenCalled()
  })

  it('una operación fuera del catálogo se rechaza (la base la aceptaría callada)', async () => {
    const res = await POST(pedido({ datos: { ...datos, operation_type: 'alquiler_temporario' } }))
    expect(res.status).toBe(400)
    expect(estado.generar).not.toHaveBeenCalled()
  })

  it('un precio que no es número se rechaza antes de llegar al modelo', async () => {
    const res = await POST(pedido({ datos: { ...datos, asking_price: '250000' } }))
    expect(res.status).toBe(400)
    expect(estado.generar).not.toHaveBeenCalled()
  })

  it('si el modelo tarda de más, responde JSON con el motivo real (no HTML del gateway)', async () => {
    estado.generar = vi.fn(async (_entrada: EntradaGenerador) => {
      const err = new Error('signal timed out')
      err.name = 'TimeoutError'
      throw err
    })
    const res = await POST(pedido({ datos }))
    expect(res.status).toBe(504)
    const body = await res.json()
    expect(body.error).toMatch(/tardó demasiado/i)
  })

  it('un error del proveedor sale como JSON, no revienta la función', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      estado.generar = vi.fn(async (_entrada: EntradaGenerador) => {
        throw new Error('deepseek 429: rate limit')
      })
      const res = await POST(pedido({ datos }))
      expect(res.status).toBe(500)
      expect((await res.json()).error).toContain('429')
    } finally {
      errores.mockRestore()
    }
  })
})
