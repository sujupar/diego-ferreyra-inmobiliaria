import { describe, it, expect } from 'vitest'
import { propertyToMlPayload, resolveCategory, ML_LISTING_TYPES } from './mapping'
import type { Property } from '../types'

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    appraisal_id: null,
    address: 'Honduras 5000',
    neighborhood: 'Palermo',
    city: 'CABA',
    property_type: 'departamento',
    rooms: 3, bedrooms: 2, bathrooms: 1, garages: 0,
    covered_area: 70, total_area: 75, floor: 5, age: 5,
    asking_price: 180000, currency: 'USD', commission_percentage: 3,
    contract_start_date: null, contract_end_date: null, origin: null,
    status: 'approved', documents: [], photos: ['https://x/a.jpg', 'https://x/b.jpg'],
    legal_status: 'approved', legal_reviewer_id: null, legal_notes: null,
    legal_reviewed_at: null, legal_docs: null, legal_flags: null,
    created_by: null, assigned_to: null,
    created_at: '2026-05-12T00:00:00Z', updated_at: '2026-05-12T00:00:00Z',
    description: 'Departamento luminoso de 3 ambientes con balcón aterrazado, muy cerca del subte D y de Palermo Hollywood. Vista despejada al frente y luz natural durante todo el día.',
    latitude: -34.58, longitude: -58.43,
    video_url: null, tour_3d_url: null,
    expensas: 50000, amenities: ['pileta', 'parrilla'],
    operation_type: 'venta', title: null, postal_code: '1414',
    public_slug: null,
    ...overrides,
  }
}

describe('propertyToMlPayload', () => {
  it('maps basic apartment for sale', () => {
    const payload = propertyToMlPayload(makeProperty())
    expect(payload.title).toContain('Palermo')
    expect(payload.currency_id).toBe('USD')
    expect(payload.price).toBe(180000)
    expect(payload.pictures.length).toBe(2)
    expect(payload.location.latitude).toBe(-34.58)
    expect(payload.category_id).toBe('MLA1473') // departamento venta
  })

  it('uses fallback category for unknown type', () => {
    const payload = propertyToMlPayload(makeProperty({ property_type: 'cochera' }))
    expect(payload.category_id).toBe('MLA1459')
  })

  it('uses custom title when provided', () => {
    const payload = propertyToMlPayload(makeProperty({ title: 'Hermoso depto frente al parque' }))
    expect(payload.title).toBe('Hermoso depto frente al parque')
  })

  it('truncates title to 60 chars', () => {
    const long = 'x'.repeat(100)
    const payload = propertyToMlPayload(makeProperty({ title: long }))
    expect(payload.title.length).toBe(60)
  })

  it('limits pictures to 12', () => {
    const photos = Array.from({ length: 20 }, (_, i) => `https://x/${i}.jpg`)
    const payload = propertyToMlPayload(makeProperty({ photos }))
    expect(payload.pictures.length).toBe(12)
  })

  it('includes expensas attribute when present', () => {
    const payload = propertyToMlPayload(makeProperty({ expensas: 75000 }))
    const expensas = payload.attributes.find(a => a.id === 'MAINTENANCE_FEE')
    expect(expensas?.value_name).toBe('75000 ARS')
  })

  it('maps rental departamento', () => {
    const payload = propertyToMlPayload(makeProperty({ operation_type: 'alquiler' }))
    expect(payload.category_id).toBe('MLA1463')
  })

  it('falls back to address in description when description is empty', () => {
    const payload = propertyToMlPayload(makeProperty({ description: null }))
    expect(payload.description.plain_text.length).toBeGreaterThan(0)
  })
})

describe('propertyToMlPayload con opts', () => {
  it('default listing_type_id = free (publicación gratuita)', () => {
    const p = propertyToMlPayload(makeProperty())
    expect(p.listing_type_id).toBe('free')
  })
  it('respeta el listingType pasado', () => {
    const p = propertyToMlPayload(makeProperty(), { listingType: 'silver' })
    expect(p.listing_type_id).toBe('silver')
  })
  it('aplica attributeOverrides (value_id para list)', () => {
    const p = propertyToMlPayload(makeProperty(), {
      attributeOverrides: { ORIENTATION: { value_id: '1' } },
    })
    expect(p.attributes).toContainEqual({ id: 'ORIENTATION', value_id: '1' })
  })
  it('override vacío limpia el atributo derivado', () => {
    const p = propertyToMlPayload(makeProperty(), {
      attributeOverrides: { ROOMS: {} },
    })
    expect(p.attributes.find(a => a.id === 'ROOMS')).toBeUndefined()
  })
  it('filtra atributos no permitidos por la categoría', () => {
    const p = propertyToMlPayload(makeProperty(), {
      allowedAttributeIds: new Set(['ROOMS', 'BEDROOMS']),
    })
    const ids = p.attributes.map(a => a.id)
    expect(ids).toEqual(expect.arrayContaining(['ROOMS', 'BEDROOMS']))
    expect(ids).not.toContain('FLOORS')
  })
  it('mediaChoice=video setea video_id desde video_url', () => {
    const p = propertyToMlPayload(makeProperty({ video_url: 'https://youtu.be/dQw4w9WgXcQ' }), { mediaChoice: 'video' })
    expect(p.video_id).toBe('dQw4w9WgXcQ')
  })
  it('mediaChoice=tour NO setea video_id', () => {
    const p = propertyToMlPayload(makeProperty({ video_url: 'https://youtu.be/dQw4w9WgXcQ' }), { mediaChoice: 'tour' })
    expect(p.video_id).toBeUndefined()
  })
  it('normaliza number_unit sin unidad (override "95" -> "95 m²", age "15" -> "15 años")', () => {
    const p = propertyToMlPayload(makeProperty(), {
      attributeOverrides: {
        COVERED_AREA: { value_name: '95' },
        TOTAL_AREA: { value_name: '105' },
        PROPERTY_AGE: { value_name: '15' },
      },
    })
    expect(p.attributes).toContainEqual({ id: 'COVERED_AREA', value_name: '95 m²' })
    expect(p.attributes).toContainEqual({ id: 'TOTAL_AREA', value_name: '105 m²' })
    expect(p.attributes).toContainEqual({ id: 'PROPERTY_AGE', value_name: '15 años' })
  })
  it('no toca un number_unit que ya trae unidad', () => {
    const p = propertyToMlPayload(makeProperty(), {
      attributeOverrides: { COVERED_AREA: { value_name: '95 m²' } },
    })
    expect(p.attributes).toContainEqual({ id: 'COVERED_AREA', value_name: '95 m²' })
  })

  it('mediaChoice=tour agrega el link del recorrido a la descripción', () => {
    const p = propertyToMlPayload(makeProperty({ tour_3d_url: 'https://my.matterport.com/show/?m=abc' }), { mediaChoice: 'tour' })
    expect(p.description.plain_text).toContain('https://my.matterport.com/show/?m=abc')
    expect(p.description.plain_text).toContain('Recorrido virtual')
  })
})

describe('resolveCategory / ML_LISTING_TYPES', () => {
  it('depto venta -> MLA1473', () => {
    expect(resolveCategory(makeProperty())).toBe('MLA1473')
  })
  it('gold_premium es el primer listing type', () => {
    expect(ML_LISTING_TYPES[0].id).toBe('gold_premium')
  })
})
