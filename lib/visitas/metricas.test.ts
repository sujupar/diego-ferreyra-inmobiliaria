import { describe, it, expect } from 'vitest'
import { cifra, conteo, porcentaje, mediana, contarVisitas, armarEmbudo, contarEncuestas } from './metricas'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const PASADA = '2026-10-14T13:30:00.000Z'
const FUTURA = '2026-10-20T13:30:00.000Z'

describe('Cifra: la regla del tablero', () => {
  it('base 0 ⇒ sin datos (valor null), nunca 0', () => {
    expect(cifra(0, 0)).toEqual({ valor: null, base: 0, orientativo: false })
    expect(porcentaje(0, 0)).toEqual({ valor: null, base: 0, orientativo: false })
    expect(mediana([])).toEqual({ valor: null, base: 0, orientativo: false })
    expect(conteo(0)).toEqual({ valor: null, base: 0, orientativo: false })
  })
  it('base menor a 20 ⇒ orientativo; 20 o más ⇒ no', () => {
    expect(porcentaje(1, 3)).toEqual({ valor: 33, base: 3, orientativo: true })
    expect(porcentaje(10, 20)).toEqual({ valor: 50, base: 20, orientativo: false })
  })
  it('un conteo nunca es "orientativo"', () => {
    expect(conteo(3)).toEqual({ valor: 3, base: 3, orientativo: false })
  })
  it('mediana par e impar', () => {
    expect(mediana([5, 1, 3]).valor).toBe(3)
    expect(mediana([4, 1, 3, 2]).valor).toBe(2.5)
  })
})

describe('contarVisitas', () => {
  it('período vacío: todo sin datos', () => {
    const c = contarVisitas([], AHORA)
    expect(c.agendadas.valor).toBeNull()
    expect(c.realizadas.valor).toBeNull()
    expect(c.noSeHicieron.total.valor).toBeNull()
    expect(c.sinMarcar).toBe(0)
  })
  it('5 agendadas sin ningún resultado: agendadas 5, se realizaron SIN DATOS, no se hicieron 0', () => {
    const c = contarVisitas(Array.from({ length: 5 }, () => v({ scheduled_at: FUTURA })), AHORA)
    expect(c.agendadas.valor).toBe(5)
    expect(c.realizadas.valor).toBeNull()
    expect(c.noSeHicieron.total).toEqual({ valor: 0, base: 5, orientativo: true })
  })
  it('% realizado = realizadas / (realizadas + no realizadas + canceladas); las sin marcar van aparte', () => {
    const visitas = [
      v({ status: 'completed', scheduled_at: PASADA }),
      v({ status: 'completed', scheduled_at: PASADA }),
      v({ status: 'no_show', outcome_reason: 'no_vino', scheduled_at: PASADA }),
      v({ status: 'cancelled', outcome_reason: 'cancelo_persona', scheduled_at: FUTURA }),
      v({ status: 'scheduled', scheduled_at: PASADA }),              // sin marcar
      v({ status: 'pending_confirmation', scheduled_at: PASADA }),   // sin marcar
      v({ status: 'scheduled', scheduled_at: FUTURA }),              // todavía no
    ]
    const c = contarVisitas(visitas, AHORA)
    expect(c.agendadas.valor).toBe(7)
    expect(c.conteos).toEqual({ realizadas: 2, noRealizadas: 1, canceladas: 1, conResultado: 4 })
    expect(c.realizadas).toEqual({ valor: 50, base: 4, orientativo: true })
    expect(c.sinMarcar).toBe(2)
    expect(c.noSeHicieron.total).toEqual({ valor: 2, base: 7, orientativo: true })
  })
  it('desglose por motivo; las viejas sin motivo caen en "Sin motivo"', () => {
    const c = contarVisitas([
      v({ status: 'no_show', outcome_reason: 'no_vino' }),
      v({ status: 'no_show', outcome_reason: 'no_vino' }),
      v({ status: 'cancelled', outcome_reason: null }),
    ], AHORA)
    expect(c.noSeHicieron.porMotivo).toEqual([
      { clave: 'no_vino', etiqueta: 'No vino', cantidad: 2 },
      { clave: 'sin_motivo', etiqueta: 'Sin motivo', cantidad: 1 },
    ])
  })
  it('un segundo después del horario ya cuenta como sin marcar', () => {
    const c = contarVisitas([v({ status: 'scheduled', scheduled_at: '2026-10-15T14:59:59.000Z' })], AHORA)
    expect(c.sinMarcar).toBe(1)
  })
})

describe('armarEmbudo', () => {
  it('sin visitas: cinco pasos en 0 y ningún salto resaltado', () => {
    const e = armarEmbudo([])
    expect(e.map(p => p.cantidad)).toEqual([0, 0, 0, 0, 0])
    expect(e.some(p => p.saltoMasGrande)).toBe(false)
  })
  it('resalta SOLO el salto relativo más grande; sin encuestas, sus pasos no compiten', () => {
    const visitas = [
      ...Array.from({ length: 10 }, () => v({ confirmed_at: null, status: 'pending_confirmation' })),
      ...Array.from({ length: 6 }, () => v({ status: 'scheduled' })),
      ...Array.from({ length: 4 }, () => v({ status: 'completed' })),
    ]
    const e = armarEmbudo(visitas)
    expect(e.map(p => [p.clave, p.cantidad])).toEqual([['agendadas', 20], ['confirmadas', 10], ['realizadas', 4], ['respondieron', 0], ['ofertarian', 0]])
    // 20→10 pierde 50 %; 10→4 pierde 60 %; los de encuesta no cuentan porque ninguna realizada tiene encuesta.
    expect(e.filter(p => p.saltoMasGrande).map(p => p.clave)).toEqual(['realizadas'])
  })
  it('con encuestas, "respondieron" y "dijeron cuánto ofertarían" entran al cálculo', () => {
    const enc = { sent_at: '2026-10-14T18:00:00Z', expires_at: '2026-11-13T18:00:00Z', liked: true, price_opinion: null, offer_currency: null,
      offer_declined: null, most_liked_tags: [], least_liked_tags: [], most_liked_other: null, least_liked_other: null }
    const e = armarEmbudo([
      v({ status: 'completed', encuesta: { ...enc, completed_at: '2026-10-14T19:00:00Z', offer_amount: 100000, offer_currency: 'USD' } }),
      v({ status: 'completed', encuesta: { ...enc, completed_at: null, offer_amount: null } }),
      v({ status: 'completed', encuesta: { ...enc, completed_at: null, offer_amount: null } }),
      v({ status: 'completed', encuesta: { ...enc, completed_at: null, offer_amount: null } }),
    ])
    expect(e.map(p => p.cantidad)).toEqual([4, 4, 4, 1, 1])
    expect(e.filter(p => p.saltoMasGrande).map(p => p.clave)).toEqual(['respondieron'])
  })
  it('una realizada sin haber pasado por "Confirmar" igual cuenta como confirmada (el embudo nunca sube)', () => {
    const e = armarEmbudo([v({ confirmed_at: null, status: 'completed' }), v({ confirmed_at: null, status: 'pending_confirmation' })])
    expect(e.map(p => p.cantidad)).toEqual([2, 1, 1, 0, 0])
  })
})

describe('contarEncuestas', () => {
  it('respondidas sobre las realizadas, con su base; sin realizadas, "Sin datos"', () => {
    const enc = { sent_at: null, expires_at: '2026-11-13T18:00:00Z', liked: true, price_opinion: null, offer_amount: null, offer_currency: null,
      offer_declined: true, most_liked_tags: [], least_liked_tags: [], most_liked_other: null, least_liked_other: null }
    expect(contarEncuestas([v({ status: 'completed', encuesta: { ...enc, completed_at: '2026-10-14T19:00:00Z' } }), v({ status: 'completed' })]))
      .toEqual({ respondidas: { valor: 50, base: 2, orientativo: true }, completas: 1, conOferta: 0 })
    expect(contarEncuestas([v({ status: 'scheduled' })]).respondidas.valor).toBeNull()
  })
})
