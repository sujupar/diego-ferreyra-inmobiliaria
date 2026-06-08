import { describe, it, expect, vi, afterEach } from 'vitest'
import { ArgenpropAdapter } from './adapter'

const prop = {
  id: '11111111-2222-3333-4444-555566667777',
  property_type: 'departamento', operation_type: 'venta',
  title: 'Lindo 3 amb', description: 'x'.repeat(120),
  asking_price: 120000, currency: 'USD',
  address: 'Av. Cabildo 1234', neighborhood: 'Belgrano', city: 'CABA',
  latitude: -34.56, longitude: -58.45,
  rooms: 3, photos: ['https://cdn/x/1.jpg'],
  amenities: [],
} as never

const creds = {
  publishUrl: 'http://x/PublicarIntranet?contentType=json',
  usr: 'u', psd: 'p', idSistema: '10', idVendedor: '281022', idOrigen: '60U6_', userAgent: 'ua',
}

afterEach(() => vi.restoreAllMocks())

describe('ArgenpropAdapter.publish', () => {
  it('publica y devuelve externalId=apAvisoId + visibilidadIds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 999 }]), { status: 200 }),
    )
    const adapter = new ArgenpropAdapter(true, creds)
    const r = await adapter.publish(prop)
    expect(r.externalId).toMatch(/^df-/)
    expect(r.metadata?.visibilidadIds).toEqual(['999'])
  })

  it('unpublish reenvía con Estado=Baja', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 999 }]), { status: 200 }),
    )
    const adapter = new ArgenpropAdapter(true, creds)
    await adapter.unpublish('df-abc')
    const body = (spy.mock.calls[0][1] as RequestInit).body as string
    expect(decodeURIComponent(body)).toContain('aviso.Estado=Baja')
  })
})
