import { describe, it, expect } from 'vitest'
import { defaultThanks, fillTokens, resolveThanks, renderThanks } from './thanks'

const CON_VIDEO = { address: 'Av. Cabildo 2450', mediaKind: 'video_propio' } as const
const SIN_VIDEO = { address: 'Av. Cabildo 2450', mediaKind: 'fotos' } as const

describe('defaultThanks', () => {
  it('con recorrido, el titular promete verla por dentro', () => {
    expect(defaultThanks(CON_VIDEO).headline).toBe('Conocé {direccion} por dentro')
  })

  it('SIN recorrido no promete uno: se entregan las fotos', () => {
    expect(defaultThanks(SIN_VIDEO).headline).toBe('{direccion}, en detalle')
  })

  it('el párrafo de introducción arranca vacío (hoy no existe en la página)', () => {
    expect(defaultThanks(CON_VIDEO).intro).toBe('')
  })
})

describe('resolveThanks', () => {
  it('sin nada editado, son los textos de siempre', () => {
    expect(resolveThanks(CON_VIDEO, null)).toEqual(defaultThanks(CON_VIDEO))
    expect(resolveThanks(CON_VIDEO, undefined)).toEqual(defaultThanks(CON_VIDEO))
    expect(resolveThanks(CON_VIDEO, {})).toEqual(defaultThanks(CON_VIDEO))
  })

  it('lo editado gana', () => {
    const r = resolveThanks(CON_VIDEO, { headline: 'Mirala por dentro', scheduleTitle: '¿Cuándo la ves?' })
    expect(r.headline).toBe('Mirala por dentro')
    expect(r.scheduleTitle).toBe('¿Cuándo la ves?')
    // Lo que no se tocó sigue en el default.
    expect(r.scheduleText).toBe(defaultThanks(CON_VIDEO).scheduleText)
  })

  it('un campo BORRADO cae al default: la página nunca queda sin titular', () => {
    expect(resolveThanks(CON_VIDEO, { headline: '   ' }).headline).toBe(defaultThanks(CON_VIDEO).headline)
    expect(resolveThanks(CON_VIDEO, { headline: '' }).headline).toBe(defaultThanks(CON_VIDEO).headline)
  })

  it('la introducción SÍ puede quedar vacía a propósito (su default es vacío)', () => {
    expect(resolveThanks(CON_VIDEO, { intro: 'Algo' }).intro).toBe('Algo')
    expect(resolveThanks(CON_VIDEO, { intro: '  ' }).intro).toBe('')
  })
})

describe('fillTokens', () => {
  const vars = { nombre: 'Julián', direccion: 'Av. Cabildo 2450' }

  it('reemplaza nombre y dirección, todas las veces', () => {
    expect(fillTokens('Hola {nombre}, {nombre}', vars)).toBe('Hola Julián, Julián')
    expect(fillTokens('Conocé {direccion} por dentro', vars)).toBe('Conocé Av. Cabildo 2450 por dentro')
  })

  it('un token desconocido no rompe el texto: queda tal cual', () => {
    expect(fillTokens('Hola {apellido}', vars)).toBe('Hola {apellido}')
  })
})

describe('renderThanks', () => {
  it('resuelve y reemplaza en un paso — es lo que se pinta en pantalla', () => {
    const r = renderThanks(CON_VIDEO, null, { nombre: 'Julián', direccion: 'Av. Cabildo 2450' })
    expect(r.greeting).toBe('Hola Julián')
    expect(r.headline).toBe('Conocé Av. Cabildo 2450 por dentro')
    expect(r.scheduleTitle).toBe('¿Querés visitarla?')
  })
})

// El documento de la landing es donde viven estos textos: si el schema no los
// conserva, el autosave los borra en silencio en el primer guardado.
describe('el schema conserva los textos de la página de gracias', () => {
  it('un documento CON thanks los mantiene al validarse', async () => {
    const { LandingDocument } = await import('./schema')
    const doc = {
      version: 1 as const,
      blocks: [{ id: 'cta', type: 'cta' as const, label: 'Ver', headline: 'H' }],
      theme: {},
      thanks: { headline: 'Mirala por dentro', scheduleTitle: '¿Cuándo?' },
    }
    const parsed = LandingDocument.safeParse(doc)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.thanks).toEqual({ headline: 'Mirala por dentro', scheduleTitle: '¿Cuándo?' })
  })

  it('un documento SIN thanks sigue siendo válido (las landings viejas no se rompen)', async () => {
    const { LandingDocument } = await import('./schema')
    const parsed = LandingDocument.safeParse({
      version: 1, blocks: [{ id: 'cta', type: 'cta', label: 'Ver', headline: 'H' }], theme: {},
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.thanks).toBeUndefined()
  })
})
