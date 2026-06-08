import { describe, it, expect } from 'vitest'
import { pickBestMatch, type PortalMapRow } from './match'
import type { ParsedInquiry } from './types'

const DIEGO = 'diego-uuid'
const LUCAS = 'lucas-uuid'

const rows: PortalMapRow[] = [
  { id: 'm1', portal: 'mercadolibre', external_code: 'MLA1234567890', external_url: 'https://articulo.mercadolibre.com.ar/MLA-1234567890', address: 'Av. Cabildo 2000', title: 'Depto Belgrano', assigned_to: LUCAS, active: true },
  { id: 'm2', portal: 'zonaprop', external_code: null, external_url: 'https://www.zonaprop.com.ar/propiedades/depto-palermo-49012345.html', address: 'Honduras 5000', title: 'Departamento 3 ambientes en Palermo', assigned_to: DIEGO, active: true },
  { id: 'm3', portal: 'argenprop', external_code: '7654321', external_url: null, address: null, title: 'Casa en Nueva Córdoba', assigned_to: DIEGO, active: true },
  { id: 'm4', portal: 'zonaprop', external_code: null, external_url: 'https://www.zonaprop.com.ar/x-999.html', address: 'Inactiva 1', title: 'Inactiva', assigned_to: LUCAS, active: false },
]

function inquiry(over: Partial<ParsedInquiry>): ParsedInquiry {
  return { portal: 'zonaprop', inquiryType: 'mail', leadName: null, leadEmail: null, leadPhone: null, message: null, propertyCode: null, propertyUrl: null, propertyAddress: null, propertyTitle: null, ...over }
}

describe('pickBestMatch', () => {
  it('matchea por código exacto (normalizado)', () => {
    const r = pickBestMatch(inquiry({ portal: 'mercadolibre', propertyCode: 'MLA-1234567890' }), rows)
    expect(r).toEqual({ mapId: 'm1', assignedTo: LUCAS, method: 'code' })
  })

  it('matchea por URL (contención)', () => {
    const r = pickBestMatch(inquiry({ portal: 'zonaprop', propertyUrl: 'https://www.zonaprop.com.ar/propiedades/depto-palermo-49012345.html' }), rows)
    expect(r.assignedTo).toBe(DIEGO)
    expect(r.method).toBe('url')
  })

  it('matchea por código numérico embebido en la URL', () => {
    const r = pickBestMatch(inquiry({ portal: 'argenprop', propertyUrl: 'https://www.argenprop.com/casa--7654321' }), rows)
    expect(r.assignedTo).toBe(DIEGO)
    expect(r.method).toBe('url')
  })

  it('matchea por dirección fuzzy', () => {
    const r = pickBestMatch(inquiry({ portal: 'zonaprop', propertyAddress: 'Honduras 5000' }), rows)
    expect(r.assignedTo).toBe(DIEGO)
    expect(r.method).toBe('address')
  })

  it('matchea por título fuzzy', () => {
    const r = pickBestMatch(inquiry({ portal: 'argenprop', propertyTitle: 'Casa en Nueva Córdoba' }), rows)
    expect(r.assignedTo).toBe(DIEGO)
    expect(r.method).toBe('title')
  })

  it('devuelve none si no hay match', () => {
    const r = pickBestMatch(inquiry({ portal: 'zonaprop', propertyCode: 'NOEXISTE', propertyAddress: 'Calle Falsa 123' }), rows)
    expect(r).toEqual({ mapId: null, assignedTo: null, method: 'none' })
  })

  it('no considera filas de otro portal', () => {
    const r = pickBestMatch(inquiry({ portal: 'zonaprop', propertyCode: 'MLA1234567890' }), rows)
    expect(r.method).toBe('none')
  })

  it('ignora filas inactivas', () => {
    const r = pickBestMatch(inquiry({ portal: 'zonaprop', propertyUrl: 'https://www.zonaprop.com.ar/x-999.html' }), rows)
    expect(r.method).toBe('none')
  })
})
