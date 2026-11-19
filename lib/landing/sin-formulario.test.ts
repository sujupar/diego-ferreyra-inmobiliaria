import { describe, it, expect } from 'vitest'
import { quitarFormulario } from './sin-formulario'
import { TEMPLATES, SELECTABLE_TEMPLATES, isSelectableTemplate } from './templates'
import { legacyFallbackDocument } from './legacy-fallback'
import { safeParseLandingDocument, type LandingDocument } from './schema'
import { BLOCK_REGISTRY } from './registry'
import { LandingCtaBand } from '@/components/landing/CtaBand'

const property = {
  id: 'p1', property_type: 'departamento', neighborhood: 'Monserrat', city: 'Buenos Aires',
  operation_type: 'venta', photos: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
  amenities: [], description: null, video_url: 'https://youtu.be/x', latitude: -34.6, longitude: -58.38,
} as never

// El documento real de Salta 297 antes del arreglo (forma, no textos).
const viejo: LandingDocument = {
  version: 1,
  blocks: [
    { id: 'hero', type: 'hero', variant: 'classic' },
    { id: 'proof', type: 'proof_bar' },
    { id: 'map', type: 'location_map' },
    { id: 'form', type: 'lead_form', ctaLabel: 'Quiero conocerla' },
  ],
  theme: { motion: 'on' },
} as LandingDocument

describe('ninguna landing lleva formulario dentro de la página', () => {
  it.each(TEMPLATES.map(t => [t.id, t] as const))('la plantilla %s no arma un formulario', (_id, t) => {
    const doc = t.build(property)
    expect(doc.blocks.some(b => b.type === 'lead_form')).toBe(false)
    expect(safeParseLandingDocument(doc)).not.toBeNull()
  })

  it('la estructura de respaldo tampoco', () => {
    const doc = legacyFallbackDocument()
    expect(doc.blocks.some(b => b.type === 'lead_form')).toBe(false)
    expect(safeParseLandingDocument(doc)).not.toBeNull()
  })

  it('un formulario viejo guardado en la base se dibuja como el botón al popup', () => {
    const el = BLOCK_REGISTRY.lead_form.render(viejo.blocks[3], { property } as never) as {
      type: unknown; props: { label: string }
    }
    expect(el.type).toBe(LandingCtaBand)
    expect(el.props.label).toBe('Ver el recorrido de la propiedad')
  })
})

describe('selector de plantillas', () => {
  it('solo ofrece Lujo', () => {
    expect(SELECTABLE_TEMPLATES.map(t => t.id)).toEqual(['luxury'])
    expect(isSelectableTemplate('luxury')).toBe(true)
    expect(isSelectableTemplate('editorial-directo')).toBe(false)
    expect(isSelectableTemplate('cinematic-estate')).toBe(false)
    expect(isSelectableTemplate(undefined)).toBe(false)
  })
})

describe('quitarFormulario', () => {
  it('cambia el formulario por el botón en el mismo lugar y no toca el resto', () => {
    const { doc, cambios } = quitarFormulario(viejo)
    expect(cambios).toBe(1)
    expect(doc.blocks.map(b => b.type)).toEqual(['hero', 'proof_bar', 'location_map', 'cta'])
    expect(doc.blocks[3]).toEqual({ id: 'cta-final', type: 'cta' })
    expect(doc.blocks.slice(0, 3)).toEqual(viejo.blocks.slice(0, 3))
    expect(doc.theme).toEqual(viejo.theme)
    expect(safeParseLandingDocument(doc)).not.toBeNull()
  })

  it('es idempotente: correrla dos veces no cambia nada más', () => {
    const una = quitarFormulario(viejo).doc
    const dos = quitarFormulario(una)
    expect(dos.cambios).toBe(0)
    expect(dos.doc).toBe(una)
  })

  it('no repite ids si ya existe un cta-final', () => {
    const conCta = { ...viejo, blocks: [{ id: 'cta-final', type: 'cta' }, ...viejo.blocks] } as LandingDocument
    const { doc } = quitarFormulario(conCta)
    const ids = doc.blocks.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('cta-final-2')
  })
})
