import { describe, it, expect } from 'vitest'
import { parseTemplateComponents } from './templates'

describe('parseTemplateComponents', () => {
  it('cuenta las variables {{n}} del body', () => {
    const r = parseTemplateComponents([
      { type: 'BODY', text: 'Hola {{1}}, tu propiedad {{2}} — solicitud #{{3}}' },
    ])
    expect(r.bodyText).toContain('Hola {{1}}')
    expect(r.variableCount).toBe(3)
    expect(r.hasDynamicUrlButton).toBe(false)
  })

  it('body sin variables da variableCount 0', () => {
    const r = parseTemplateComponents([{ type: 'BODY', text: 'Aviso fijo sin variables.' }])
    expect(r.variableCount).toBe(0)
  })

  it('detecta un botón URL con sufijo dinámico', () => {
    const r = parseTemplateComponents([
      { type: 'BODY', text: 'Hola {{1}}' },
      { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://inmodf.com.ar/v/{{1}}' }] },
    ])
    expect(r.hasDynamicUrlButton).toBe(true)
  })

  it('un botón URL SIN sufijo dinámico no cuenta como dinámico', () => {
    const r = parseTemplateComponents([
      { type: 'BODY', text: 'Hola {{1}}' },
      { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://inmodf.com.ar/contacto' }] },
    ])
    expect(r.hasDynamicUrlButton).toBe(false)
  })

  it('un botón QUICK_REPLY no cuenta como botón dinámico', () => {
    const r = parseTemplateComponents([
      { type: 'BODY', text: 'Hola {{1}}' },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Sí' }] },
    ])
    expect(r.hasDynamicUrlButton).toBe(false)
  })

  it('sin components devuelve valores vacíos sin lanzar', () => {
    expect(parseTemplateComponents(undefined)).toEqual({ bodyText: '', variableCount: 0, hasDynamicUrlButton: false })
  })

  it('toma el índice MÁXIMO de variable, no la cantidad de matches (por si se repite {{1}})', () => {
    const r = parseTemplateComponents([{ type: 'BODY', text: '{{1}} ... {{1}} ... {{2}}' }])
    expect(r.variableCount).toBe(2)
  })
})
