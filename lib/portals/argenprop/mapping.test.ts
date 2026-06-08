import { describe, it, expect } from 'vitest'
import { flattenForm, propertyToApForm } from './mapping'

const prop = {
  id: '11111111-2222-3333-4444-555566667777',
  property_type: 'departamento', operation_type: 'venta',
  title: 'Lindo 3 amb', description: 'x'.repeat(120),
  asking_price: 120000, currency: 'USD',
  address: 'Av. Cabildo 1234', neighborhood: 'Belgrano', city: 'CABA',
  latitude: -34.56, longitude: -58.45, postal_code: '1426',
  rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1,
  covered_area: 95, total_area: 110, age: 15, floor: 4, expensas: 50000,
  amenities: ['pileta', 'parrilla'],
  photos: ['https://cdn/x/1.jpg', 'https://cdn/x/2.jpg'],
  video_url: null, tour_3d_url: null,
} as never

describe('flattenForm', () => {
  it('aplana arrays con claves indexadas', () => {
    const f = flattenForm({ imagenes: [{ url: 'a' }, { url: 'b' }] })
    expect(f['imagenes[0].url']).toBe('a')
    expect(f['imagenes[1].url']).toBe('b')
  })
  it('aplana objetos anidados con punto', () => {
    const f = flattenForm({ aviso: { Precio: 100, Vendedor: { IdOrigen: 281022 } } })
    expect(f['aviso.Precio']).toBe('100')
    expect(f['aviso.Vendedor.IdOrigen']).toBe('281022')
  })
  it('omite null/undefined', () => {
    const f = flattenForm({ a: null, b: undefined, c: 0 })
    expect('a' in f).toBe(false)
    expect('b' in f).toBe(false)
    expect(f.c).toBe('0')
  })
})

describe('propertyToApForm', () => {
  it('incluye auth, tipoPropiedad, precio y IdOrigen del aviso', () => {
    const f = propertyToApForm(prop, {
      creds: { publishUrl: '', usr: 'u', psd: 'p', idSistema: '10', idVendedor: '281022', idOrigen: '60U6_', userAgent: 'ua' },
      idOrigen: 'df-abc',
    })
    expect(f['usr']).toBe('u')
    expect(f['psd']).toBe('p')
    expect(f['tipoPropiedad']).toBe('1')          // departamento
    expect(f['aviso.IdOrigen']).toBe('df-abc')
    expect(f['aviso.Vendedor.SistemaOrigen.Id']).toBe('10')
    expect(f['aviso.Vendedor.IdOrigen']).toBe('281022')
    expect(f['aviso.Precio']).toBe('120000')
    expect(f['aviso.Estado']).toBe('Activo')
  })
  it('aplana las fotos como imagenes[i].url', () => {
    const f = propertyToApForm(prop, {
      creds: { publishUrl: '', usr: 'u', psd: 'p', idSistema: '10', idVendedor: '281022', idOrigen: '60U6_', userAgent: 'ua' },
      idOrigen: 'df-abc',
    })
    expect(f['imagenes[0].url']).toBe('https://cdn/x/1.jpg')
    expect(f['imagenes[1].url']).toBe('https://cdn/x/2.jpg')
  })
  it('estado=Baja cuando opts.estado=Baja (para dar de baja)', () => {
    const f = propertyToApForm(prop, {
      creds: { publishUrl: '', usr: 'u', psd: 'p', idSistema: '10', idVendedor: '281022', idOrigen: '60U6_', userAgent: 'ua' },
      idOrigen: 'df-abc', estado: 'Baja',
    })
    expect(f['aviso.Estado']).toBe('Baja')
  })
})
