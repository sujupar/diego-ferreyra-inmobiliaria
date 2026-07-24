import { describe, it, expect } from 'vitest'
import {
  parseAddress, buildGeocodeQuery, normalizeCity, normalizeNeighborhood,
  deriveProvince, expandProvince, formatDisplayAddress,
} from './address'

describe('parseAddress', () => {
  it('parsea CABA con barrio y provincia embebida', () => {
    const p = parseAddress('José Luis Cantilo 4300, Villa Devoto, Capital Federal')
    expect(p.street).toBe('José Luis Cantilo')
    expect(p.number).toBe('4300')
    expect(p.neighborhood).toBe('Villa Devoto')
    expect(p.isCaba).toBe(true)
    expect(p.province).toBe('CABA')
  })

  it('usa los hints por sobre el blob cuando existen', () => {
    const p = parseAddress('Aleu 3500, San Andrés, General San Martín', {
      neighborhood: 'San Andrés', city: 'General San Martín', province: 'GBA Norte',
    })
    expect(p.street).toBe('Aleu')
    expect(p.number).toBe('3500')
    expect(p.locality).toBe('General San Martín')
    expect(p.province).toBe('Buenos Aires')
    expect(p.isCaba).toBe(false)
  })

  it('normaliza mayúsculas de la calle preservándola', () => {
    const p = parseAddress('ALMAFUERTE 2500, General San Martín, GBA Norte')
    expect(p.number).toBe('2500')
    expect(p.street?.toLowerCase()).toContain('almafuerte')
  })

  it('sin altura → number null', () => {
    const p = parseAddress('Lares de Canning, Lares de Canning, Tristán Suárez')
    expect(p.number).toBeNull()
    expect(p.street).toBeTruthy()
  })
})

describe('buildGeocodeQuery', () => {
  it('CABA → barrio + Ciudad Autónoma de Buenos Aires + Argentina, sin duplicar', () => {
    const q = buildGeocodeQuery(parseAddress('José Luis Cantilo 4300, Villa Devoto, Capital Federal'))
    expect(q).toBe('José Luis Cantilo 4300, Villa Devoto, Ciudad Autónoma de Buenos Aires, Argentina')
  })

  it('GBA → partido + Provincia de Buenos Aires + Argentina', () => {
    const q = buildGeocodeQuery(parseAddress('Aleu 3500, San Andrés, General San Martín', {
      neighborhood: 'San Andrés', city: 'General San Martín', province: 'GBA Norte',
    }))
    expect(q).toBe('Aleu 3500, General San Martín, Provincia de Buenos Aires, Argentina')
  })
})

describe('normalizeNeighborhood', () => {
  it('aplica alias Nueva Pompeya → Pompeya', () => {
    expect(normalizeNeighborhood('Nueva Pompeya')).toBe('Pompeya')
  })
  it('title-case', () => {
    expect(normalizeNeighborhood('villa devoto')).toBe('Villa Devoto')
  })
  it('title-case accent-safe (no mayusculiza letras internas acentuadas)', () => {
    expect(normalizeNeighborhood('núñez')).toBe('Núñez')
    expect(normalizeNeighborhood('villa general mitre')).toBe('Villa General Mitre')
  })
  it('null-safe', () => {
    expect(normalizeNeighborhood('')).toBeNull()
    expect(normalizeNeighborhood(null)).toBeNull()
  })
})

describe('deriveProvince', () => {
  it('CSV Capital Federal → CABA', () => {
    expect(deriveProvince({ csvZona: 'Capital Federal' })).toBe('CABA')
  })
  it('CSV GBA Norte → Buenos Aires', () => {
    expect(deriveProvince({ csvZona: 'GBA Norte' })).toBe('Buenos Aires')
  })
  it('detecta CABA en el texto del address', () => {
    expect(deriveProvince({ address: 'Agüero 950, Palermo, Capital Federal' })).toBe('CABA')
  })
  it('desconocida → null', () => {
    expect(deriveProvince({ address: 'Calle X 100' })).toBeNull()
  })
})

describe('expandProvince', () => {
  it('CABA → Ciudad Autónoma de Buenos Aires', () => {
    expect(expandProvince('CABA')).toBe('Ciudad Autónoma de Buenos Aires')
  })
  it('Buenos Aires → Provincia de Buenos Aires', () => {
    expect(expandProvince('Buenos Aires')).toBe('Provincia de Buenos Aires')
  })
  it('otra provincia se mantiene', () => {
    expect(expandProvince('Córdoba')).toBe('Córdoba')
  })
})

describe('formatDisplayAddress', () => {
  it('arma un string limpio sin duplicar', () => {
    const p = parseAddress('José Luis Cantilo 4300, Villa Devoto, Capital Federal')
    expect(formatDisplayAddress(p)).toBe('José Luis Cantilo 4300, Villa Devoto')
  })
})
