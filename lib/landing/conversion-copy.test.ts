import { describe, it, expect } from 'vitest'
import { buildUserPrompt, deterministicConversionCopy } from './conversion-copy'

const property = {
  property_type: 'duplex', neighborhood: 'Martínez', city: 'Buenos Aires',
  operation_type: 'venta', amenities: ['Jardín', 'Parrilla'],
  description: 'Dúplex con jardín soleado',
} as never

describe('buildUserPrompt v2', () => {
  it('inyecta las respuestas del asesor con su pregunta, como dato delimitado', () => {
    const p = buildUserPrompt(property, undefined, {
      answers: { q1: 'Familia joven con hijos chicos', q2: 'El jardín con sol todo el día' },
      questions: [
        { id: 'q1', question: '¿Quién es el comprador ideal?' },
        { id: 'q2', question: '¿Cuál es el diferencial?' },
      ],
    })
    expect(p).toContain('¿Quién es el comprador ideal?')
    expect(p).toContain('Familia joven con hijos chicos')
    expect(p).toContain('El jardín con sol todo el día')
  })

  it('inyecta los datos reales de la zona cuando existen', () => {
    const p = buildUserPrompt(property, undefined, {
      insights: {
        zona: 'Martínez, Buenos Aires', fuente: 'google',
        categorias: { transporte: ['Tren Mitre a 5 cuadras'], comercios: [], educacion: [], verde: [] },
      },
    })
    expect(p).toContain('Tren Mitre')
  })

  it('sin insights avisa que no hay datos de zona y prohíbe inventar', () => {
    const p = buildUserPrompt(property, undefined, {})
    expect(p).toMatch(/sin datos investigados/i)
    expect(p.toLowerCase()).toContain('inventar')
  })

  it('inyecta el resumen de fotos cuando existe', () => {
    const p = buildUserPrompt(property, undefined, { visionSummary: 'Jardín amplio con parrilla y sol pleno' })
    expect(p).toContain('Jardín amplio con parrilla')
  })

  it('pide la fórmula del titular (tipo + ubicación + beneficio) y no repetir en el subtitular', () => {
    const p = buildUserPrompt(property, undefined, {})
    expect(p).toContain('Martínez')
    expect(p.toLowerCase()).toContain('fórmula')
    expect(p.toLowerCase()).toContain('no repitas')
  })

  it('sanea las comillas angulares de las respuestas (no escapan del delimitador)', () => {
    const p = buildUserPrompt(property, undefined, {
      answers: { q1: 'texto con «comillas» adentro' },
      questions: [{ id: 'q1', question: 'Q' }],
    })
    expect(p).not.toMatch(/««|»»/)
  })
})

describe('deterministicConversionCopy', () => {
  it('con respuestas usa el diferencial (segunda pregunta) en el copy', () => {
    const copy = deterministicConversionCopy(property, {
      q1: 'Familia joven', q2: 'El jardín con sol todo el día',
    })
    expect(JSON.stringify(copy)).toContain('jardín con sol')
  })

  it('sin respuestas mantiene el fallback estable', () => {
    const copy = deterministicConversionCopy(property)
    expect(copy.titular).toContain('Martínez')
    expect(copy.ctaLabel).toBe('Ver el recorrido de la propiedad')
    expect(copy.benefits).toHaveLength(3)
  })

  it('los cierres invitan a recorrer, no a agendar cita', () => {
    const copy = deterministicConversionCopy(property)
    const todo = JSON.stringify(copy).toLowerCase()
    expect(todo).not.toContain('cita')
    expect(todo).toContain('recorr')
  })
})
