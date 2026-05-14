import { describe, it, expect } from 'vitest'
import { buildAdCopy } from './copy-templates'
import type { Property } from '../portals/types'

function makeProperty(o: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    appraisal_id: null,
    address: 'Honduras 5000',
    neighborhood: 'Palermo',
    city: 'CABA',
    property_type: 'departamento',
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    garages: 1,
    covered_area: 70,
    total_area: 75,
    floor: 5,
    age: 5,
    asking_price: 180000,
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
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
    description: 'Departamento luminoso de 3 ambientes con balcón aterrazado.',
    latitude: -34.58,
    longitude: -58.43,
    video_url: null,
    tour_3d_url: null,
    expensas: 50000,
    amenities: ['pileta', 'parrilla', 'sum'],
    operation_type: 'venta',
    title: null,
    postal_code: '1414',
    public_slug: null,
    ...o,
  }
}

describe('buildAdCopy', () => {
  it('genera headline con tipo + barrio + precio', () => {
    const copy = buildAdCopy(makeProperty())
    expect(copy.headline).toContain('Palermo')
    expect(copy.headline).toContain('180')
  })

  it('headline ≤ 40 chars (límite Meta)', () => {
    const copy = buildAdCopy(makeProperty({ neighborhood: 'Z'.repeat(60) }))
    expect(copy.headline.length).toBeLessThanOrEqual(40)
  })

  it('primary text incluye highlights', () => {
    const copy = buildAdCopy(makeProperty())
    expect(copy.primaryText).toContain('3 amb')
    expect(copy.primaryText).toContain('1 cochera')
  })

  it('primary text incluye amenities', () => {
    const copy = buildAdCopy(makeProperty())
    expect(copy.primaryText).toContain('pileta')
  })

  it('description ≤ 100 chars', () => {
    const copy = buildAdCopy(makeProperty({ description: 'X'.repeat(500) }))
    expect(copy.description.length).toBeLessThanOrEqual(100)
  })

  it('fallback description sin description en property', () => {
    const copy = buildAdCopy(makeProperty({ description: null }))
    expect(copy.description.length).toBeGreaterThan(0)
  })

  it('operation alquiler refleja "En alquiler"', () => {
    const copy = buildAdCopy(makeProperty({ operation_type: 'alquiler' }))
    expect(copy.primaryText).toContain('En alquiler')
  })
})
