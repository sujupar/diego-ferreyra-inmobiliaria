import { describe, it, expect } from 'vitest'
import { propertyToAvisoDto } from './mapping'

const prop = {
  id: '11111111-2222-3333-4444-555566667777',
  property_type: 'departamento', operation_type: 'venta',
  title: 'Lindo 3 amb', description: 'x'.repeat(120),
  asking_price: 120000.4, currency: 'USD',
  address: 'Av. Cabildo 1234', neighborhood: 'Belgrano', city: 'CABA',
  latitude: -34.56, longitude: -58.45,
  rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1,
  covered_area: 95, total_area: 110, age: 15, expensas: 50000,
  photos: ['https://cdn/x/1.jpg', 'https://cdn/x/2.jpg'],
  video_url: 'https://youtu.be/abc', tour_3d_url: 'https://tour/xyz',
} as never

const opts = { idAnunciante: 281022, codigo: '60U6_abc', localidadId: 'LOCALIDAD_2102', barrioId: 'BARRIO_15' }

describe('propertyToAvisoDto', () => {
  const dto = propertyToAvisoDto(prop, opts)

  it('arma IdAnunciante, Codigo, Categoria, Publicacion', () => {
    expect(dto.IdAnunciante).toBe(281022)
    expect(dto.Codigo).toBe('60U6_abc')
    expect(dto.Categoria).toEqual({ Tipo: 'DEPARTAMENTO' })
    expect(dto.Publicacion).toEqual({ Visible: true })
  })

  it('Precio toma operación/moneda y redondea el monto', () => {
    expect(dto.Precio).toEqual({ Monto: 120000, Moneda: 'USD', Operacion: 'VENTA', Mostrar: true })
  })

  it('Caracteristicas: numéricas como number, con los Ids reales', () => {
    const byId = Object.fromEntries(dto.Caracteristicas.map(c => [c.Id, c.Valor]))
    expect(byId.CANTIDAD_AMBIENTES).toBe(3)
    expect(byId.CANTIDAD_DORMITORIOS).toBe(2)
    expect(byId.SUPERFICIE_CUBIERTA).toBe(95)
    expect(byId.ANTIGUEDAD).toBe(15)
    // TIPO_OPERACION / MONEDA NO van como Caracteristica (van a Precio)
    expect(byId.TIPO_OPERACION).toBeUndefined()
    expect(byId.MONEDA).toBeUndefined()
  })

  it('Multimedia: fotos + video + tour con sus Tipos', () => {
    expect(dto.Multimedia).toContainEqual({ Tipo: 'FOTO', Url: 'https://cdn/x/1.jpg' })
    expect(dto.Multimedia).toContainEqual({ Tipo: 'VIDEO', Url: 'https://youtu.be/abc' })
    expect(dto.Multimedia).toContainEqual({ Tipo: 'TOUR', Url: 'https://tour/xyz' })
  })

  it('Localizacion: Calle parseada + Localidad + Barrio', () => {
    expect(dto.Localizacion.Calle).toEqual({ Nombre: 'Av. Cabildo', Numero: '1234' })
    expect(dto.Localizacion.Localidad).toEqual({ Id: 'LOCALIDAD_2102' })
    expect(dto.Localizacion.Barrio).toEqual({ Id: 'BARRIO_15' })
    expect(dto.Localizacion.Latitud).toBe(-34.56)
  })

  it('overrides pisan el prellenado (ej. subtipo PH y estado)', () => {
    const d2 = propertyToAvisoDto(prop, {
      ...opts,
      attributeOverrides: { SUBTIPO: { value_id: 'LOFT' }, ESTADO_PROPIEDAD: { value_id: 'EXCELENTE' } },
    })
    expect(d2.Categoria).toEqual({ Tipo: 'DEPARTAMENTO', Subtipo: 'LOFT' })
    const byId = Object.fromEntries(d2.Caracteristicas.map(c => [c.Id, c.Valor]))
    expect(byId.ESTADO_PROPIEDAD).toBe('EXCELENTE')
  })

  it('sin barrio no incluye Barrio en Localizacion', () => {
    const d3 = propertyToAvisoDto(prop, { ...opts, barrioId: null })
    expect(d3.Localizacion.Barrio).toBeUndefined()
  })
})
