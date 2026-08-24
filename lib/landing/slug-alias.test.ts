import { describe, it, expect } from 'vitest'
import { planRenombreDeSlug, destinoDeAlias } from './slug-alias'

const VIEJO = 'departamento-coghlan-roque-perez-3059-37ger2'
const NUEVO = 'casa-coghlan-roque-perez-3059-37ger2'

describe('planRenombreDeSlug', () => {
  it('el caso real: el viejo queda como alias y el nuevo pasa a ser el vigente', () => {
    expect(planRenombreDeSlug(VIEJO, NUEVO)).toEqual({
      public_slug: NUEVO,
      previous_slugs: [VIEJO],
    })
  })

  it('acumula el historial: renombrar dos veces no pierde el primer enlace', () => {
    const uno = planRenombreDeSlug(VIEJO, NUEVO)!
    const dos = planRenombreDeSlug(uno.public_slug, 'casa-coghlan-otro-x1', uno.previous_slugs)!
    expect(dos.public_slug).toBe('casa-coghlan-otro-x1')
    expect([...dos.previous_slugs].sort()).toEqual([NUEVO, VIEJO].sort())
  })

  it('volver a un slug que era alias NO deja un bucle de redirección', () => {
    const ida = planRenombreDeSlug(VIEJO, NUEVO)!
    const vuelta = planRenombreDeSlug(ida.public_slug, VIEJO, ida.previous_slugs)!
    expect(vuelta.public_slug).toBe(VIEJO)
    expect(vuelta.previous_slugs).not.toContain(VIEJO)
    expect(vuelta.previous_slugs).toEqual([NUEVO])
  })

  it('no hay nada que hacer si el slug no cambia', () => {
    expect(planRenombreDeSlug(NUEVO, NUEVO)).toBeNull()
  })

  it('un slug nuevo vacío no rompe nada: no hay plan', () => {
    expect(planRenombreDeSlug(VIEJO, '')).toBeNull()
    expect(planRenombreDeSlug(VIEJO, '   ')).toBeNull()
  })

  it('una propiedad sin slug previo simplemente estrena el nuevo', () => {
    expect(planRenombreDeSlug(null, NUEVO)).toEqual({ public_slug: NUEVO, previous_slugs: [] })
  })

  it('no duplica un alias ya registrado', () => {
    const plan = planRenombreDeSlug(VIEJO, NUEVO, [VIEJO, 'otro-viejo'])!
    expect(plan.previous_slugs.filter(s => s === VIEJO)).toHaveLength(1)
  })
})

describe('destinoDeAlias', () => {
  it('conserva los parámetros de campaña — sin eso se pierde la atribución', () => {
    const destino = destinoDeAlias(NUEVO, {
      utm_source: 'meta', utm_campaign: 'altovalor_departamento-coghlan', fbclid: 'abc123',
    })
    expect(destino).toContain(`/p/${NUEVO}?`)
    expect(destino).toContain('utm_source=meta')
    expect(destino).toContain('fbclid=abc123')
  })

  it('sin parámetros devuelve la URL limpia', () => {
    expect(destinoDeAlias(NUEVO)).toBe(`/p/${NUEVO}`)
    expect(destinoDeAlias(NUEVO, {})).toBe(`/p/${NUEVO}`)
  })

  it('un parámetro repetido conserva sus dos valores', () => {
    expect(destinoDeAlias(NUEVO, { tag: ['a', 'b'] })).toBe(`/p/${NUEVO}?tag=a&tag=b`)
  })

  it('escapa los valores raros en vez de romper la URL', () => {
    expect(destinoDeAlias(NUEVO, { utm_campaign: 'venta casa & co' }))
      .toContain('utm_campaign=venta%20casa%20%26%20co')
  })
})
