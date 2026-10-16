import { describe, it, expect } from 'vitest'
import { opinionesPorPropiedad } from './opiniones'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'
import type { EncuestaListado } from './tipos'

const respondida = (c: Partial<EncuestaListado> = {}): EncuestaListado => ({
  sent_at: '2026-10-14T18:00:00Z', completed_at: '2026-10-14T19:00:00Z', expires_at: '2026-11-13T18:00:00Z',
  liked: true, price_opinion: 'alto', offer_amount: null, offer_currency: null, offer_declined: true,
  most_liked_tags: ['luz'], least_liked_tags: ['nada'], most_liked_other: null, least_liked_other: null, ...c,
})

describe('opinionesPorPropiedad (spec §4.5 "Opiniones")', () => {
  it('sin encuestas respondidas: lista vacía (la pantalla dice "Sin datos")', () => {
    expect(opinionesPorPropiedad([v({ status: 'completed' }), v({ status: 'completed', encuesta: respondida({ completed_at: null }) })])).toEqual([])
  })
  it('les gustó, precio, oferta mediana y diferencia contra el publicado, con su base', () => {
    const o = opinionesPorPropiedad([
      v({ status: 'completed', encuesta: respondida({ offer_amount: 130000, offer_currency: 'USD', offer_declined: false }) }),
      v({ status: 'completed', encuesta: respondida({ liked: false, price_opinion: 'correcto', offer_amount: 140000, offer_currency: 'USD', offer_declined: false }) }),
      v({ status: 'completed', encuesta: respondida() }),
    ])
    expect(o).toHaveLength(1)
    expect(o[0]).toMatchObject({
      direccion: 'Doblas 248', respuestas: 3, leGusto: { valor: 67, base: 3, orientativo: true },
      precio: { correcto: 1, alto: 2, bajo: 0 }, ofertaMediana: { valor: 135000, base: 2 }, moneda: 'USD',
      diferencia: { valor: -10, base: 2 },
    })
  })
  it('una oferta en OTRA moneda no entra en la mediana ni en la diferencia (Review Focus 5)', () => {
    const o = opinionesPorPropiedad([
      v({ status: 'completed', encuesta: respondida({ offer_amount: 150000000, offer_currency: 'ARS', offer_declined: false }) }),
    ])
    expect(o[0].ofertaMediana).toEqual({ valor: null, base: 0, orientativo: false })
    expect(o[0].diferencia.valor).toBeNull()
  })
  it('sin precio publicado no hay diferencia, aunque haya ofertas', () => {
    const o = opinionesPorPropiedad([v({ status: 'completed', precio_publicado: null, moneda_publicada: 'USD', encuesta: respondida({ offer_amount: 100000, offer_currency: 'USD', offer_declined: false }) })])
    expect(o[0].diferencia.valor).toBeNull()
  })
  it('etiquetas en palabras con su cantidad y los comentarios escritos, más recientes primero', () => {
    const o = opinionesPorPropiedad([
      v({ status: 'completed', encuesta: respondida({ most_liked_tags: ['luz', 'otra'], most_liked_other: 'El barrio', completed_at: '2026-10-10T00:00:00Z' }) }),
      v({ status: 'completed', encuesta: respondida({ most_liked_tags: ['luz'], least_liked_tags: ['otra'], least_liked_other: 'El ascensor', completed_at: '2026-10-12T00:00:00Z' }) }),
    ])
    expect(o[0].masGusto).toEqual([{ clave: 'luz', etiqueta: 'La luz', cantidad: 2 }])
    expect(o[0].comentarios).toEqual(['No le gustó: El ascensor', 'Le gustó: El barrio'])
  })
})
