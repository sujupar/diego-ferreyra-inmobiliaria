import { describe, it, expect } from 'vitest'
import { propertyToSlug } from './slug'

describe('propertyToSlug', () => {
  it('genera kebab-case del address + neighborhood + tipo', () => {
    const slug = propertyToSlug({
      address: 'Av Libertador 1234',
      neighborhood: 'Palermo',
      property_type: 'departamento',
    })
    expect(slug).toMatch(/^departamento-palermo-av-libertador-1234-[a-z0-9]{6}$/)
  })

  it('quita tildes y ñ', () => {
    const slug = propertyToSlug({
      address: 'Calle ñandú 100',
      neighborhood: 'Núñez',
      property_type: 'casa',
    })
    expect(slug).toMatch(/^casa-nunez-calle-nandu-100-[a-z0-9]{6}$/)
  })

  it('largo total ≤ 80 chars', () => {
    const slug = propertyToSlug({
      address: 'A'.repeat(200),
      neighborhood: 'Z'.repeat(50),
      property_type: 'casa',
    })
    expect(slug.length).toBeLessThanOrEqual(80)
  })

  it('agrega sufijo random distinto cada vez', () => {
    const a = propertyToSlug({ address: 'X', neighborhood: 'Y', property_type: 'casa' })
    const b = propertyToSlug({ address: 'X', neighborhood: 'Y', property_type: 'casa' })
    expect(a).not.toBe(b)
    expect(a.slice(0, -6)).toBe(b.slice(0, -6))
  })

  it('maneja inputs con caracteres especiales', () => {
    const slug = propertyToSlug({
      address: 'Av. Pres. R. S. Peña 123 — Piso 4°',
      neighborhood: 'Microcentro / SAN NICOLAS',
      property_type: 'oficina',
    })
    // Solo a-z, 0-9 y guiones
    expect(slug).toMatch(/^[a-z0-9-]+$/)
  })

  it('descarta partes vacías sin doble guion', () => {
    const slug = propertyToSlug({
      address: 'Foo',
      neighborhood: '',
      property_type: 'casa',
    })
    // No debe tener "casa--foo"
    expect(slug).not.toContain('--')
  })
})
