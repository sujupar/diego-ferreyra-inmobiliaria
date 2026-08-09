import { describe, it, expect } from 'vitest'
import { buildLuxuryDocument } from './luxury'
import { deterministicConversionCopy } from '../conversion-copy'
import { safeParseLandingDocument } from '../schema'

const property = {
  property_type: 'casa', neighborhood: 'Martínez', city: 'Buenos Aires',
  operation_type: 'venta', photos: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
  amenities: [], description: null,
} as never

describe('buildLuxuryDocument', () => {
  const doc = buildLuxuryDocument(property, deterministicConversionCopy(property), 'estandar')

  it('el cierre invita a recorrer, nunca "cita previa" ni "agendá"', () => {
    const todo = JSON.stringify(doc)
    expect(todo).not.toContain('Con cita previa')
    expect(todo).not.toContain('Agendá tu visita')
    const closing = doc.blocks.find(b => b.id === 'closing')
    expect(closing && 'eyebrow' in closing ? closing.eyebrow : null).toBe('Vení a recorrerla')
    const ctaMid = doc.blocks.find(b => b.id === 'cta-mid')
    expect(ctaMid && 'eyebrow' in ctaMid ? ctaMid.eyebrow : null).toBe('Conocela por dentro')
  })

  it('el bloque location pide mapa (no interactivo, decisión 2026-08-06)', () => {
    const loc = doc.blocks.find(b => b.id === 'location')
    expect(loc && 'showMap' in loc ? loc.showMap : null).toBe(true)
  })

  it('el documento con showMap sigue validando contra el schema Zod', () => {
    expect(safeParseLandingDocument(doc)).not.toBeNull()
  })
})
