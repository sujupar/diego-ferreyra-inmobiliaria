import { describe, it, expect } from 'vitest'
import { buildPropertyTourProps } from './property-tour-props'
import type { Property } from '@/lib/portals/types'

function makeProperty(o: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    appraisal_id: null,
    address: 'Honduras 5000',
    neighborhood: 'Palermo',
    city: 'CABA',
    property_type: 'departamento',
    rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1,
    covered_area: 70, total_area: 75, floor: 5, age: 5,
    asking_price: 180000, currency: 'USD', commission_percentage: 3,
    contract_start_date: null, contract_end_date: null, origin: null,
    status: 'approved', documents: [],
    photos: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
    legal_status: 'approved', legal_reviewer_id: null, legal_notes: null,
    legal_reviewed_at: null, legal_docs: null, legal_flags: null,
    created_by: null, assigned_to: null,
    created_at: '2026-05-14T00:00:00Z', updated_at: '2026-05-14T00:00:00Z',
    description: 'Linda propiedad',
    latitude: -34.58, longitude: -58.43,
    video_url: null, tour_3d_url: null,
    expensas: 50000, amenities: ['pileta', 'parrilla', 'sum'],
    operation_type: 'venta', title: null, postal_code: '1414',
    public_slug: 'depto-palermo-abc123',
    ...o,
  }
}

describe('buildPropertyTourProps', () => {
  it('genera title default tipo + barrio cuando property.title es null', () => {
    const props = buildPropertyTourProps({ property: makeProperty() })
    expect(props.title).toBe('Departamento en Palermo')
  })

  it('usa property.title cuando está', () => {
    const props = buildPropertyTourProps({
      property: makeProperty({ title: 'Departamento exclusivo Palermo' }),
    })
    expect(props.title).toBe('Departamento exclusivo Palermo')
  })

  it('subtitle incluye operación + barrio + city', () => {
    const props = buildPropertyTourProps({ property: makeProperty() })
    expect(props.subtitle).toBe('En venta · Palermo, CABA')
  })

  it('precio formateado correctamente USD', () => {
    const props = buildPropertyTourProps({ property: makeProperty() })
    expect(props.price).toContain('180')
    expect(props.price).toContain('US')
  })

  it('alquiler refleja en subtitle', () => {
    const props = buildPropertyTourProps({
      property: makeProperty({ operation_type: 'alquiler' }),
    })
    expect(props.subtitle).toContain('En alquiler')
  })

  it('highlights incluyen ambientes', () => {
    const props = buildPropertyTourProps({ property: makeProperty() })
    expect(props.highlights[0]).toContain('3 ambientes')
  })

  it('amenities aparecen como highlight', () => {
    const props = buildPropertyTourProps({ property: makeProperty() })
    expect(props.highlights.some(h => h.includes('pileta'))).toBe(true)
  })

  it('limita a 8 fotos máx', () => {
    const photos = Array.from({ length: 20 }, (_, i) => `https://x/${i}.jpg`)
    const props = buildPropertyTourProps({ property: makeProperty({ photos }) })
    expect(props.photos.length).toBe(8)
  })

  it('CTA usa public_slug si existe', () => {
    const props = buildPropertyTourProps({ property: makeProperty() })
    expect(props.ctaText).toContain('depto-palermo-abc123')
  })

  it('brandName custom override', () => {
    const props = buildPropertyTourProps({
      property: makeProperty(),
      brandName: 'Custom Brand',
    })
    expect(props.brandName).toBe('Custom Brand')
  })
})
