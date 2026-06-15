import { describe, it, expect } from 'vitest'
import { TASACION_CONTENT, CLASE_CONTENT } from './content'

describe('funnel content', () => {
  it('tasación tiene headline, 3 beneficios y CTA', () => {
    expect(TASACION_CONTENT.hero.headline.length).toBeGreaterThan(10)
    expect(TASACION_CONTENT.benefits).toHaveLength(3)
    expect(TASACION_CONTENT.cta.label).toMatch(/TASACIÓN/i)
  })

  it('clase tiene headline y el form pide tipo de cliente', () => {
    expect(CLASE_CONTENT.hero.headline.length).toBeGreaterThan(10)
    expect(CLASE_CONTENT.form.tipoClienteOptions).toEqual([
      'Trabajo en el sector',
      'Soy Propietario/a',
    ])
  })
})
