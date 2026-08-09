import { describe, it, expect } from 'vitest'
import {
  evaluarCaptacion, debeAvanzarACaptada, estadoLegal,
  puedeRevisarDocumentacion, etiquetaDeCaptacion,
} from './captacion'

describe('evaluarCaptacion', () => {
  it('con una foto y sin ningún "no", la propiedad está captada — aunque no haya documentación', () => {
    expect(evaluarCaptacion({ status: 'pending_docs', legalStatus: 'pending', photosCount: 1 }))
      .toEqual({ captada: true, motivo: null })
  })

  it('sin fotos no se capta: es lo único material que queda', () => {
    expect(evaluarCaptacion({ status: 'pending_photos', legalStatus: 'approved', photosCount: 0 }))
      .toEqual({ captada: false, motivo: 'sin-fotos' })
  })

  it('el rechazo del abogado es un "no" activo y sigue frenando', () => {
    expect(evaluarCaptacion({ status: 'pending_docs', legalStatus: 'rejected', photosCount: 8 }))
      .toEqual({ captada: false, motivo: 'documentacion-rechazada' })
  })

  it('descartada y rechazada tampoco se captan', () => {
    expect(evaluarCaptacion({ status: 'descartada', legalStatus: 'approved', photosCount: 8 }).motivo).toBe('descartada')
    expect(evaluarCaptacion({ status: 'rejected', legalStatus: 'approved', photosCount: 8 }).motivo).toBe('rechazada')
  })

  it('la ausencia de documentación NO es un motivo: legal en pending no aparece nunca', () => {
    const sinDocs = evaluarCaptacion({ status: 'draft', legalStatus: 'pending', photosCount: 3 })
    expect(sinDocs.captada).toBe(true)
    // legal_status puede llegar nulo de filas viejas: tampoco frena.
    expect(evaluarCaptacion({ status: 'draft', legalStatus: null, photosCount: 3 }).captada).toBe(true)
  })
})

describe('debeAvanzarACaptada', () => {
  it('avanza la que tiene fotos y todavía no está en approved', () => {
    expect(debeAvanzarACaptada({ status: 'pending_docs', legalStatus: 'pending', photosCount: 1 })).toBe(true)
  })

  it('no repite el avance sobre una que ya está captada', () => {
    expect(debeAvanzarACaptada({ status: 'approved', legalStatus: 'approved', photosCount: 5 })).toBe(false)
  })

  /**
   * La regla que evita el apagón: una propiedad viva (publicada, con la landing
   * al aire y plata de Meta apuntándole) no se degrada sola porque perdió una
   * condición. Esta función solo sabe avanzar.
   */
  it('NUNCA degrada: una captada sin fotos o con el legal rechazado se queda como está', () => {
    expect(debeAvanzarACaptada({ status: 'approved', legalStatus: 'approved', photosCount: 0 })).toBe(false)
    expect(debeAvanzarACaptada({ status: 'approved', legalStatus: 'rejected', photosCount: 5 })).toBe(false)
  })
})

describe('estadoLegal / puedeRevisarDocumentacion', () => {
  it('sin enviar, en revisión, aprobada y rechazada son cuatro estados distintos', () => {
    expect(estadoLegal({ legalStatus: 'pending', legalSubmittedAt: null })).toBe('sin-enviar')
    expect(estadoLegal({ legalStatus: 'pending', legalSubmittedAt: '2026-08-09T10:00:00Z' })).toBe('en-revision')
    expect(estadoLegal({ legalStatus: 'approved', legalSubmittedAt: '2026-08-09T10:00:00Z' })).toBe('aprobada')
    expect(estadoLegal({ legalStatus: 'rejected', legalSubmittedAt: '2026-08-09T10:00:00Z' })).toBe('rechazada')
  })

  it('el abogado revisa lo que le mandaron y nada más', () => {
    const enviada = { legalStatus: 'pending', legalSubmittedAt: '2026-08-09T10:00:00Z' }
    expect(puedeRevisarDocumentacion({ ...enviada, role: 'abogado' })).toBe(true)
    expect(puedeRevisarDocumentacion({ ...enviada, role: 'asesor' })).toBe(false)
    expect(puedeRevisarDocumentacion({ legalStatus: 'pending', legalSubmittedAt: null, role: 'abogado' })).toBe(false)
    expect(puedeRevisarDocumentacion({ legalStatus: 'approved', legalSubmittedAt: 'x', role: 'abogado' })).toBe(false)
  })

  /**
   * El lockout que encontró la revisión adversarial: antes `canReview` exigía
   * `status === 'pending_review'`, así que subir una foto (que ahora capta la
   * propiedad y le cambia el status a 'approved') le sacaba al abogado los
   * botones de aprobar y rechazar, y su tarea quedaba abierta para siempre.
   */
  it('una propiedad YA CAPTADA se sigue pudiendo revisar — el status no participa', () => {
    expect(puedeRevisarDocumentacion({
      legalStatus: 'pending', legalSubmittedAt: '2026-08-09T10:00:00Z', role: 'abogado',
    })).toBe(true)
  })
})

describe('etiquetaDeCaptacion', () => {
  it('deja de decir "Pendiente Documentos": lo que falta son las fotos', () => {
    expect(etiquetaDeCaptacion({ status: 'pending_docs', legalStatus: 'pending', photosCount: 0 }).label)
      .toBe('Pendiente Fotos')
    expect(etiquetaDeCaptacion({ status: 'draft', legalStatus: 'pending', photosCount: 0 }).label)
      .toBe('Pendiente Fotos')
  })

  it('la captada dice Captación Completa aunque no tenga documentación revisada', () => {
    expect(etiquetaDeCaptacion({ status: 'approved', legalStatus: 'pending', photosCount: 3 }).label)
      .toBe('Captación Completa')
  })

  it('el rechazo legal se ve, y descartada/rechazada mandan sobre todo', () => {
    expect(etiquetaDeCaptacion({ status: 'pending_docs', legalStatus: 'rejected', photosCount: 3 }).label)
      .toBe('Documentación Rechazada')
    expect(etiquetaDeCaptacion({ status: 'descartada', legalStatus: 'approved', photosCount: 3 }).label)
      .toBe('Descartada')
  })

  it('con fotos y el status todavía sin actualizar avisa que está en captación, no que está completa', () => {
    expect(etiquetaDeCaptacion({ status: 'pending_docs', legalStatus: 'pending', photosCount: 2 }).label)
      .toBe('En captación')
  })
})
