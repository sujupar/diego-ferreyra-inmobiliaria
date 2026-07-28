/**
 * Blindaje del tono rioplatense en los textos de la LANDING.
 *
 * Cubre dos cosas:
 *  1. El detector (findRioplatenseIssues) — que no dé falsos positivos con
 *     3ª persona ("un asesor te contacta") ni se coma tuteo real.
 *  2. Los textos determinísticos de la landing (los que NO pasan por IA y por
 *     eso nadie revisa): copy de conversión de fallback + el copy fijo del
 *     template de lujo. Si alguien escribe "puedes" ahí, este test lo frena.
 *
 * NOTA: las descripciones de PORTALES (ZonaProp/ML/Argenprop) están fuera de
 * este blindaje a propósito — tienen una regla explícita propia de no usar voseo
 * (lib/marketing/portal-descriptions/system-prompt.ts).
 */
import { describe, it, expect } from 'vitest'
import { findRioplatenseIssues, RIOPLATENSE_STYLE } from './rioplatense'
import { deterministicConversionCopy } from '@/lib/landing/conversion-copy'
import type { LandingProperty } from '@/lib/landing/registry'

const property = {
  id: 'p1',
  property_type: 'departamento',
  neighborhood: 'Villa Devoto',
  city: 'CABA',
  operation_type: 'venta',
  amenities: ['Pileta', 'Parrilla', 'SUM'],
  description: null,
  photos: [],
} as unknown as LandingProperty

describe('findRioplatenseIssues', () => {
  it('detecta tuteo', () => {
    const issues = findRioplatenseIssues('Si tú quieres, puedes visitarla cuando tienes tiempo.')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.every(i => i.kind === 'tuteo')).toBe(true)
  })

  it('detecta léxico no argentino', () => {
    const issues = findRioplatenseIssues('El apartamento tiene piscina y garaje.')
    expect(issues.map(i => i.term.toLowerCase()).sort()).toEqual(['apartamento', 'garaje', 'piscina'])
  })

  it('acepta voseo correcto', () => {
    const ok =
      'Si querés conocerla, escribinos y coordinamos. Vas a ver que el departamento ' +
      'tiene pileta, cochera y una cocina que te enamora. Vení a verlo.'
    expect(findRioplatenseIssues(ok)).toEqual([])
  })

  it('NO marca 3ª persona como tuteo (falso positivo clásico)', () => {
    // "un asesor te contacta" / "la propiedad tiene" son correctos en voseo.
    const ok = 'Un asesor te contacta hoy. La propiedad tiene 3 ambientes y el edificio tiene SUM.'
    expect(findRioplatenseIssues(ok)).toEqual([])
  })
})

describe('RIOPLATENSE_STYLE', () => {
  it('es una guía accionable con las formas clave', () => {
    for (const term of ['tenés', 'podés', 'sos', 'departamento', 'pileta', 'cochera', 'ambientes']) {
      expect(RIOPLATENSE_STYLE).toContain(term)
    }
  })
})

describe('copy determinístico de la landing (sin IA)', () => {
  const copy = deterministicConversionCopy(property)
  const textos: Array<[string, string]> = [
    ['titular', copy.titular],
    ['subtitulo', copy.subtitulo],
    ['shortDesc', copy.shortDesc],
    ['ctaLabel', copy.ctaLabel],
    ['showcaseHeadline', copy.showcaseHeadline],
    ['showcaseBody', copy.showcaseBody],
    ['storyTitle', copy.storyTitle],
    ['storyBody', copy.storyBody],
    ['mainBenefitHeadline', copy.mainBenefitHeadline],
    ['mainBenefitBody', copy.mainBenefitBody],
    ['locationNote', copy.locationNote],
    ['midCtaHeadline', copy.midCtaHeadline],
    ['finalCtaHeadline', copy.finalCtaHeadline],
    ...copy.benefits.flatMap((b, i): Array<[string, string]> => [
      [`benefit${i}.title`, b.title],
      [`benefit${i}.body`, b.body],
    ]),
  ]

  for (const [campo, texto] of textos) {
    it(`${campo} está en rioplatense`, () => {
      expect(findRioplatenseIssues(texto)).toEqual([])
    })
  }
})
