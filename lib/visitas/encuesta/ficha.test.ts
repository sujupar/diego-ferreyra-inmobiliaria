import { describe, it, expect } from 'vitest'
import { armarEncuestaParaFicha, respuestasParaFicha, eventosDeLaEncuesta, mezclarEventos, filasDeRespuestas, avisosParaFicha } from './ficha'
import { encuestaDePrueba, TOKEN_DE_PRUEBA, ENCUESTA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import type { EventoVisitaR } from '../tipos'

const AHORA = new Date('2026-10-15T15:00:00Z')
const evento = (kind: string, created_at: string): EventoVisitaR => ({
  id: `${kind}-1`, kind, from_status: null, to_status: null, from_scheduled_at: null, to_scheduled_at: null,
  reason: null, note: null, created_at, actor: 'Lucas', desde_asesor: null, hacia_asesor: null,
})

describe('respuestasParaFicha', () => {
  it('sin nada respondido: null', () => {
    expect(respuestasParaFicha(encuestaDePrueba())).toBeNull()
  })
  it('en palabras: etiquetas, "Otra" con su texto, precio y oferta', () => {
    const r = respuestasParaFicha(encuestaDePrueba({
      completed_at: '2026-10-15T14:00:00Z', liked: true, most_liked_tags: ['luz', 'otra'], most_liked_other: 'El barrio',
      least_liked_tags: ['nada'], price_opinion: 'alto', offer_amount: 135000, offer_currency: 'USD', wants_similar: true,
      contact_phone: '5491158234521', contact_email: 'a@b.co',
    }))
    expect(r).toEqual({
      completa: true, leGusto: true, masGusto: ['La luz', 'Otra: El barrio'], menosGusto: ['Nada en especial'],
      precio: 'Le parece alto', oferta: 'US$ 135.000', quiereSimilares: true, telefono: '5491158234521', email: 'a@b.co',
    })
  })
  it('"prefiero no decirlo" se dice así; a medio responder no es "completa"', () => {
    const r = respuestasParaFicha(encuestaDePrueba({ liked: false, offer_declined: true }))
    expect(r).toMatchObject({ completa: false, leGusto: false, oferta: 'Prefirió no decirlo' })
  })
})

describe('filasDeRespuestas', () => {
  it('en palabras, con "—" donde no respondió', () => {
    expect(filasDeRespuestas({
      completa: true, leGusto: null, masGusto: ['La luz'], menosGusto: [], precio: 'Le parece alto',
      oferta: null, quiereSimilares: false, telefono: '5491158234521', email: null,
    })).toEqual([
      { etiqueta: '¿Le gustó?', valor: '—' },
      { etiqueta: 'Lo que más le gustó', valor: 'La luz' },
      { etiqueta: 'Lo que menos le gustó', valor: '—' },
      { etiqueta: 'El precio', valor: 'Le parece alto' },
      { etiqueta: 'Cuánto ofertaría', valor: '—' },
      { etiqueta: 'Avisarle si entra algo parecido', valor: 'No' },
      { etiqueta: 'WhatsApp', valor: '5491158234521' },
    ])
  })
})

describe('eventos de la encuesta en la línea de tiempo', () => {
  it('enviada, abierta y respondida, con ids estables', () => {
    const ev = eventosDeLaEncuesta(encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-14T18:00:00Z', opened_at: '2026-10-14T19:00:00Z', completed_at: '2026-10-14T19:02:00Z' }))
    expect(ev.map(e => [e.kind, e.id])).toEqual([
      ['encuesta_enviada', `encuesta-enviada-${ENCUESTA_DE_PRUEBA}`],
      ['encuesta_abierta', `encuesta-abierta-${ENCUESTA_DE_PRUEBA}`],
      ['encuesta_respondida', `encuesta-respondida-${ENCUESTA_DE_PRUEBA}`],
    ])
  })
  it('un envío omitido no figura como "enviada"', () => {
    expect(eventosDeLaEncuesta(encuestaDePrueba({ send_status: 'omitida', sent_at: null }))).toEqual([])
  })
  it('mezclar ordena por fecha y no duplica los de encuesta al refrescar', () => {
    const historial = [evento('realizada', '2026-10-14T17:00:00Z'), evento('encuesta_enviada', '2026-10-14T18:00:00Z')]
    const deEncuesta = eventosDeLaEncuesta(encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-14T18:00:00Z' }))
    const r = mezclarEventos(historial, deEncuesta)
    expect(r.map(e => e.kind)).toEqual(['realizada', 'encuesta_enviada'])
  })
})

describe('avisosParaFicha', () => {
  it('sin responder: nada que mostrar (los avisos todavía no se dispararon)', () => {
    expect(avisosParaFicha(encuestaDePrueba())).toEqual([])
  })
  it('todo enviado/no corresponde: nada que mostrar', () => {
    expect(avisosParaFicha(encuestaDePrueba({
      completed_at: '2026-10-15T14:00:00Z', team_notice_status: 'enviado',
      gift_whatsapp_status: 'no_corresponde', gift_email_status: 'enviado',
    }))).toEqual([])
  })
  it('un fallido muestra el motivo; un pendiente dice "pendiente"', () => {
    expect(avisosParaFicha(encuestaDePrueba({
      completed_at: '2026-10-15T14:00:00Z', team_notice_status: 'pendiente',
      gift_whatsapp_status: 'fallido', gift_email_status: 'enviado',
      notice_error: 'Meta rechazó el envío: plantilla sin aprobar',
    }))).toEqual([
      { etiqueta: 'Aviso al equipo', texto: 'pendiente' },
      { etiqueta: 'Regalo por WhatsApp', texto: 'no salió — Meta rechazó el envío: plantilla sin aprobar' },
    ])
  })
  it('un canal trabado ("enviando") también se avisa', () => {
    expect(avisosParaFicha(encuestaDePrueba({
      completed_at: '2026-10-15T14:00:00Z', team_notice_status: 'enviado',
      gift_whatsapp_status: 'no_corresponde', gift_email_status: 'enviando',
    }))).toEqual([{ etiqueta: 'Regalo por email', texto: 'enviándose' }])
  })
})

describe('armarEncuestaParaFicha', () => {
  it('link copiable, estado, vencimiento y si se puede reenviar', () => {
    const f = armarEncuestaParaFicha(encuestaDePrueba({ send_status: 'omitida', send_skip_reason: 'envio_apagado' }),
      { wa: null, puedeReenviar: false, linkDisponible: true, ahora: AHORA, base: 'https://inmodf.com.ar' })
    expect(f).toMatchObject({
      link: `https://inmodf.com.ar/encuesta/${TOKEN_DE_PRUEBA}`,
      linkDisponible: true,
      estado: { clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' },
      puedeReenviar: false, vencida: false, respondidaEl: null, respuestas: null, eventos: [],
    })
  })
  it('visita reabierta: ni "copiar link" ni reenviar, aunque la decisión diga que sí se podría', () => {
    const f = armarEncuestaParaFicha(encuestaDePrueba(), { wa: null, puedeReenviar: false, linkDisponible: false, ahora: AHORA, base: 'https://inmodf.com.ar' })
    expect(f.linkDisponible).toBe(false)
    expect(f.puedeReenviar).toBe(false)
  })
})
