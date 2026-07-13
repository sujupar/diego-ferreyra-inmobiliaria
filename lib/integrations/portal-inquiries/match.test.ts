import { describe, it, expect } from 'vitest'
import { pickBestMatch, type PortalMapRow } from './match'
import type { ParsedInquiry } from './types'

const DIEGO = 'diego-uuid'
const LUCAS = 'lucas-uuid'

const rows: PortalMapRow[] = [
  { id: 'm1', portal: 'mercadolibre', external_code: 'MLA1234567890', external_url: 'https://articulo.mercadolibre.com.ar/MLA-1234567890', address: 'Av. Cabildo 2000', title: 'Depto Belgrano', assigned_to: LUCAS, active: true, property_id: 'prop-m1' },
  { id: 'm2', portal: 'zonaprop', external_code: null, external_url: 'https://www.zonaprop.com.ar/propiedades/depto-palermo-49012345.html', address: 'Honduras 5000', title: 'Departamento 3 ambientes en Palermo', assigned_to: DIEGO, active: true, property_id: 'prop-m2' },
  { id: 'm3', portal: 'argenprop', external_code: '7654321', external_url: null, address: null, title: 'Casa en Nueva Córdoba', assigned_to: DIEGO, active: true, property_id: null },
  { id: 'm4', portal: 'zonaprop', external_code: null, external_url: 'https://www.zonaprop.com.ar/x-999.html', address: 'Inactiva 1', title: 'Inactiva', assigned_to: LUCAS, active: false, property_id: null },
]

function inquiry(over: Partial<ParsedInquiry>): ParsedInquiry {
  return { portal: 'zonaprop', inquiryType: 'mail', leadName: null, leadEmail: null, leadPhone: null, message: null, propertyCode: null, propertyUrl: null, propertyAddress: null, propertyTitle: null, ...over }
}

describe('pickBestMatch', () => {
  it('matchea por código exacto (normalizado)', () => {
    const r = pickBestMatch(inquiry({ portal: 'mercadolibre', propertyCode: 'MLA-1234567890' }), rows)
    expect(r).toEqual({ mapId: 'm1', assignedTo: LUCAS, method: 'code', address: 'Av. Cabildo 2000', title: 'Depto Belgrano', external_url: 'https://articulo.mercadolibre.com.ar/MLA-1234567890', propertyId: 'prop-m1' })
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
    expect(r).toEqual({ mapId: null, assignedTo: null, method: 'none', address: null, title: null, external_url: null, propertyId: null })
  })

  it('no considera filas de otro portal', () => {
    const r = pickBestMatch(inquiry({ portal: 'zonaprop', propertyCode: 'MLA1234567890' }), rows)
    expect(r.method).toBe('none')
  })

  it('ignora filas inactivas', () => {
    const r = pickBestMatch(inquiry({ portal: 'zonaprop', propertyUrl: 'https://www.zonaprop.com.ar/x-999.html' }), rows)
    expect(r.method).toBe('none')
  })

  it('propaga propertyId del mapa cuando la fila tiene FK', () => {
    const r = pickBestMatch(inquiry({ portal: 'zonaprop', propertyAddress: 'Honduras 5000' }), rows)
    expect(r.propertyId).toBe('prop-m2')
  })

  it('propertyId null cuando la fila del mapa no tiene FK (fila legacy)', () => {
    const r = pickBestMatch(inquiry({ portal: 'argenprop', propertyCode: '7654321' }), rows)
    expect(r.assignedTo).toBe(DIEGO)
    expect(r.propertyId).toBeNull()
  })
})

// Match de dirección por nombre de calle con datos reales (número aproximado +
// abreviaturas): la consulta del portal trae un número distinto al de la lista.
describe('pickBestMatch — dirección por calle (Argenprop)', () => {
  const map: PortalMapRow[] = [
    { id: 'd1', portal: 'argenprop', external_code: null, external_url: null, address: 'Agüero 950', title: null, assigned_to: DIEGO, active: true, property_id: null },
    { id: 'd2', portal: 'argenprop', external_code: null, external_url: null, address: 'Entre Ríos 2333', title: null, assigned_to: DIEGO, active: true, property_id: null },
    { id: 'd3', portal: 'argenprop', external_code: null, external_url: null, address: 'Gabriela Mistral 2750', title: null, assigned_to: DIEGO, active: true, property_id: null },
    { id: 'd4', portal: 'argenprop', external_code: null, external_url: null, address: 'Avenida Ángel Gallardo 200', title: null, assigned_to: DIEGO, active: true, property_id: null },
    { id: 'l1', portal: 'argenprop', external_code: null, external_url: null, address: 'Coronel Ramón Lorenzo Falcón 2500', title: null, assigned_to: LUCAS, active: true, property_id: null },
    { id: 'l2', portal: 'argenprop', external_code: null, external_url: null, address: 'Santo Tomé 2600', title: null, assigned_to: LUCAS, active: true, property_id: null },
    { id: 'l3', portal: 'argenprop', external_code: null, external_url: null, address: 'Juan B. Ambrosetti 95', title: null, assigned_to: LUCAS, active: true, property_id: null },
    { id: 'l4', portal: 'argenprop', external_code: null, external_url: null, address: 'Lares de Canning', title: null, assigned_to: LUCAS, active: true, property_id: null },
  ]
  const ap = (address: string) => pickBestMatch(inquiry({ portal: 'argenprop', propertyAddress: address }), map)

  it('número aproximado: "Agüero 900" → Agüero 950 (Diego)', () => expect(ap('Agüero 900').assignedTo).toBe(DIEGO))
  it('número aproximado: "ENTRE RIOS 2300" → 2333 (Diego)', () => expect(ap('ENTRE RIOS 2300').assignedTo).toBe(DIEGO))
  it('mayúsc/acentos: "GABRIELA MISTRAL 2700" → 2750 (Diego)', () => expect(ap('GABRIELA MISTRAL 2700').assignedTo).toBe(DIEGO))
  it('acentos: "Avenida Angel Gallardo 200" (Diego)', () => expect(ap('Avenida Angel Gallardo 200').assignedTo).toBe(DIEGO))
  it('abreviatura: "Cnel. Ramón L. Falcón 2500" → Coronel … (Lucas)', () => expect(ap('Cnel. Ramón L. Falcón 2500').assignedTo).toBe(LUCAS))
  it('"SANTO TOME  2600" → Santo Tomé 2600 (Lucas)', () => expect(ap('SANTO TOME  2600').assignedTo).toBe(LUCAS))
  it('"Juan B. Ambrosetti 0" → 95 (Lucas)', () => expect(ap('Juan B. Ambrosetti 0').assignedTo).toBe(LUCAS))
  it('sin número: "Lares de Canning" (Lucas)', () => expect(ap('Lares de Canning').assignedTo).toBe(LUCAS))
  it('no está en la lista: "Avenida de Los Incas 5200" → none', () => expect(ap('Avenida de Los Incas 5200').method).toBe('none'))
  it('misma calle pero número lejano NO matchea: "Gabriela Mistral 4200" ≠ 2750', () => expect(ap('Gabriela Mistral 4200').method).toBe('none'))
  it('redondeo cercano sí: "Carlos Antonio López 2530" → 2500 (no está en este map → none)', () => {
    // (no hay Carlos Antonio López en este map de prueba; valida que no explote)
    expect(ap('Carlos Antonio López 2530').method).toBe('none')
  })
})
