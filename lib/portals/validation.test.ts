import { describe, it, expect } from 'vitest'
import { validateCommon } from './validation'
import type { Property } from './types'

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    appraisal_id: null,
    address: 'Av Libertador 1234',
    neighborhood: 'Palermo',
    city: 'CABA',
    property_type: 'departamento',
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    garages: 1,
    covered_area: 75,
    total_area: 80,
    floor: 5,
    age: 10,
    asking_price: 150000,
    currency: 'USD',
    commission_percentage: 3,
    contract_start_date: null,
    contract_end_date: null,
    origin: null,
    status: 'approved',
    documents: [],
    photos: ['https://x/1.jpg'],
    legal_status: 'approved',
    legal_reviewer_id: null,
    legal_notes: null,
    legal_reviewed_at: null,
    legal_docs: null,
    legal_flags: null,
    created_by: null,
    assigned_to: null,
    created_at: '2026-05-12T00:00:00Z',
    updated_at: '2026-05-12T00:00:00Z',
    description: 'Departamento de tres ambientes con balcón al frente, vista despejada y excelente luminosidad natural durante todo el día.',
    latitude: -34.5,
    longitude: -58.4,
    video_url: null,
    tour_3d_url: null,
    expensas: null,
    amenities: [],
    operation_type: 'venta',
    title: null,
    postal_code: null,
    public_slug: null,
    ...overrides,
  }
}

describe('validateCommon', () => {
  it('ok for a complete property', () => {
    const result = validateCommon(makeProperty())
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('fails when no photos', () => {
    const result = validateCommon(makeProperty({ photos: [] }))
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Sin fotos')
  })

  it('fails when no lat/lng', () => {
    const result = validateCommon(makeProperty({ latitude: null, longitude: null }))
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('geolocalización'))).toBe(true)
  })

  it('warning when no description', () => {
    const result = validateCommon(makeProperty({ description: null }))
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => w.includes('descripción'))).toBe(true)
  })

  it('warning when no video and no tour', () => {
    const result = validateCommon(makeProperty())
    expect(result.warnings.some(w => w.includes('video'))).toBe(true)
    expect(result.warnings.some(w => w.includes('tour 3D'))).toBe(true)
  })
})
