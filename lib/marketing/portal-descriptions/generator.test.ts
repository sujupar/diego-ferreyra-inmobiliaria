import { describe, it, expect } from 'vitest'
import { buildUserPayload } from './generator'
import { PORTAL_DESCRIPTION_SYSTEM_PROMPT } from './system-prompt'

const base = {
  property_type: 'departamento', address: 'Junín 1200', neighborhood: 'Recoleta', city: 'CABA',
  operation_type: 'venta', asking_price: 250000, currency: 'USD', rooms: 3,
} as never

describe('buildUserPayload v2', () => {
  it('inyecta los datos reales de la zona cuando existen', () => {
    const p = {
      ...(base as object),
      location_insights: {
        zona: 'Recoleta, CABA', fuente: 'google',
        categorias: { transporte: ['Subte D Pueyrredón a 300 m'], comercios: [], educacion: [], verde: [] },
      },
    } as never
    const out = buildUserPayload({ property: p, buyerProfile: 'pareja joven' })
    expect(out).toContain('Subte D')
    expect(out).toContain('pareja joven')
    expect(out).toContain('investigación real')
  })

  it('sin insights avisa que no hay datos y prohíbe inventar', () => {
    const out = buildUserPayload({ property: base })
    expect(out).toContain('Sin datos investigados de la zona')
    expect(out).toContain('PROHIBIDO inventar')
  })

  it('omite las líneas sin dato (comportamiento v1 conservado)', () => {
    const out = buildUserPayload({ property: base })
    expect(out).not.toContain('Dormitorios:')
    expect(out).toContain('Ambientes: 3')
  })
})

describe('system prompt v2', () => {
  it('la sección Ubicación usa la investigación, no la memoria del modelo', () => {
    expect(PORTAL_DESCRIPTION_SYSTEM_PROMPT).toContain('Datos REALES de la zona')
    expect(PORTAL_DESCRIPTION_SYSTEM_PROMPT).not.toContain('usá tu conocimiento del barrio')
  })
  it('el titular tiene ejemplos de MAL y BIEN', () => {
    expect(PORTAL_DESCRIPTION_SYSTEM_PROMPT).toContain('MAL:')
    expect(PORTAL_DESCRIPTION_SYSTEM_PROMPT).toContain('BIEN:')
  })
  it('el disclaimer literal sigue intacto', () => {
    expect(PORTAL_DESCRIPTION_SYSTEM_PROMPT).toContain(
      'La presente publicación describe las características esenciales del inmueble',
    )
  })
  it('prohíbe hablar de financiación', () => {
    expect(PORTAL_DESCRIPTION_SYSTEM_PROMPT).toMatch(/NUNCA menciones financiación/i)
  })
})
