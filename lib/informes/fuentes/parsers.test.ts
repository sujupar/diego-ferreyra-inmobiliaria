import { describe, it, expect } from 'vitest'
import { contarConsultas, contactosDeMercadoLibre, fichaDeVisitas, sumarAvisosMercadoLibre, visitasDeMercadoLibre, vistasDelTelefonoEnPeriodo, sumarMeta, resultadosDe, reelDeInsights } from './parsers'
import type { VisitaListado, EncuestaListado } from '@/lib/visitas/tipos'

describe('contarConsultas', () => {
  it('cuenta por portal, suma los registros de la landing como "redes" y deja afuera las pruebas', () => {
    const r = contarConsultas(
      [
        { portal: 'zonaprop', lead_name: 'Virginia', lead_email: null },
        { portal: 'mercadolibre', lead_name: 'Juan', lead_email: null },
        { portal: 'mercadolibre', lead_name: 'Juan', lead_email: null },
        { portal: 'otro', lead_name: 'X', lead_email: null },
        { portal: 'argenprop', lead_name: 'Julián [TEST]', lead_email: null },
      ],
      [{ name: 'Ana', email: 'a@b.c' }, { name: 'Julian Parra', email: null }],
    )
    expect(r).toEqual({ total: 5, porPortal: { zonaprop: 1, argenprop: 0, mercadolibre: 2, redes: 1, otros: 1 } })
  })
})

function visita(status: VisitaListado['status'], encuesta: Partial<EncuestaListado> | null, nombre = 'Mariana'): VisitaListado {
  return {
    id: 'v', property_id: 'p', direccion: null, barrio: null, advisor_id: null, asesor_nombre: null, created_by: null,
    client_name: nombre, client_phone: null, status, origin: null, origin_detail: null, outcome_reason: null,
    scheduled_at: '2026-10-05T15:00:00Z', created_at: '', updated_at: '', confirmed_at: null, outcome_at: null,
    consulta_recibida_at: null, registro_creado_at: null, precio_publicado: 180000, moneda_publicada: 'USD',
    encuesta: encuesta ? {
      sent_at: null, completed_at: '2026-10-06T10:00:00Z', expires_at: '', liked: null, price_opinion: null,
      offer_amount: null, offer_currency: null, offer_declined: null, most_liked_tags: [], least_liked_tags: [],
      most_liked_other: null, least_liked_other: null, ...encuesta,
    } : null,
  }
}

describe('fichaDeVisitas (como la ficha de Entre Ríos)', () => {
  it('realizadas, le gustó, precio, ofertas en la moneda publicada y lo que no gustó', () => {
    const r = fichaDeVisitas([
      visita('completed', { liked: true, price_opinion: 'alto', offer_amount: 170000, offer_currency: 'USD', least_liked_other: 'probables humedades de los techos' }),
      visita('completed', { liked: true, price_opinion: 'alto', offer_amount: 165000, offer_currency: 'USD', least_liked_tags: ['estado', 'otra'] }),
      visita('completed', { liked: false, price_opinion: 'alto', offer_amount: 50000000, offer_currency: 'ARS' }),
      visita('completed', { completed_at: null, liked: true }),
      visita('completed', null),
      visita('cancelled', null),
      visita('completed', { liked: true }, 'Julián [TEST]'),
    ])
    expect(r.realizadas).toBe(5)
    expect(r.ficha.respuestas).toBe(3)
    expect(r.ficha.leGusto).toEqual({ si: 2, no: 1 })
    expect(r.ficha.precio).toEqual({ correcto: 0, alto: 3, bajo: 0 })
    expect(r.ficha.ofertas).toEqual([165000, 170000])
    expect(r.ficha.moneda).toBe('USD')
    expect(r.ficha.comentariosMenosGusto).toEqual(['probables humedades de los techos'])
    expect(r.ficha.menosGusto).toHaveLength(1)
    expect(r.ficha.menosGusto[0].cantidad).toBe(1)
  })
  it('sin visitas: todo en cero (la página dice "Aún no han completado la ficha de visitas")', () => {
    const r = fichaDeVisitas([])
    expect(r.realizadas).toBe(0)
    expect(r.ficha.respuestas).toBe(0)
  })
})

describe('visitasDeMercadoLibre', () => {
  it('lee total_visits del aviso pedido (respuesta real de /items/visits)', () => {
    expect(visitasDeMercadoLibre([{ item_id: 'MLA1', date_from: '2026-10-01', date_to: '2026-10-21', total_visits: 84, visits_detail: [] }], 'MLA1')).toBe(84)
  })
  it('una respuesta rara o de otro aviso es un error, no un 0', () => {
    expect(() => visitasDeMercadoLibre({ error: 'x' }, 'MLA1')).toThrow()
    expect(() => visitasDeMercadoLibre([{ item_id: 'MLA2', total_visits: 3 }], 'MLA1')).toThrow()
  })
})

describe('contactosDeMercadoLibre (respuesta real de /vis/users/{id}/leads/buyers)', () => {
  const pagina = (total: number, results: unknown[]) => ({ paging: { offset: 0, limit: 50, total }, results })
  it('cuenta interesados (personas) y contactos por canal', () => {
    const r = contactosDeMercadoLibre([pagina(3, [
      { id: 1, item_id: 'MLA1', leads: [{ channel: 'question', contact_type: 'question' }, { channel: 'whatsapp', contact_type: 'whatsapp' }] },
      { id: 2, item_id: 'MLA1', leads: [{ channel: 'phone', contact_type: 'call' }] },
      { id: 3, item_id: 'MLA1', leads: [{ channel: 'question', contact_type: 'question' }] },
    ])])
    expect(r).toEqual({ interesados: 3, preguntas: 2, whatsapp: 1, llamadas: 1, otros: 0 })
  })
  it('junta varias páginas', () => {
    const r = contactosDeMercadoLibre([
      pagina(2, [{ id: 1, leads: [{ channel: 'question', contact_type: 'question' }] }]),
      pagina(2, [{ id: 2, leads: [{ channel: 'whatsapp', contact_type: 'whatsapp' }] }]),
    ])
    expect(r.interesados).toBe(2)
    expect(r.whatsapp).toBe(1)
  })
  it('un canal desconocido va a "otros", no se pierde', () => {
    expect(contactosDeMercadoLibre([pagina(1, [{ id: 1, leads: [{ channel: 'video_call', contact_type: 'video_call' }] }])]).otros).toBe(1)
  })
  it('sin interesados es cero (respuesta real vacía)', () => {
    expect(contactosDeMercadoLibre([pagina(0, [])])).toEqual({ interesados: 0, preguntas: 0, whatsapp: 0, llamadas: 0, otros: 0 })
  })
  it('una respuesta rara o incompleta es un error, no un 0', () => {
    expect(() => contactosDeMercadoLibre([{ error: 'x' }])).toThrow()
    expect(() => contactosDeMercadoLibre([pagina(5, [{ id: 1, leads: [] }])])).toThrow(/incompleta/)
  })
})

describe('vistasDelTelefonoEnPeriodo (respuesta real de /items/{id}/contacts/phone_views/time_window)', () => {
  const resp = {
    total: 6, item_id: 'MLA1', results: [
      { date: '2026-09-30T00:00:00Z', total: 4 }, { date: '2026-10-01T00:00:00Z', total: 1 },
      { date: '2026-10-15T00:00:00Z', total: 1 }, { date: '2026-10-16T00:00:00Z', total: 0 },
    ],
  }
  it('suma solo los días del período, ambos extremos incluidos', () => {
    expect(vistasDelTelefonoEnPeriodo(resp, '2026-10-01', '2026-10-15')).toBe(2)
  })
  it('si la ventana no cubre el período completo es un error (no un número de menos)', () => {
    expect(() => vistasDelTelefonoEnPeriodo(resp, '2026-09-20', '2026-10-15')).toThrow(/no cubre/)
  })
  it('una respuesta rara es un error', () => {
    expect(() => vistasDelTelefonoEnPeriodo({ error: 'x' }, '2026-10-01', '2026-10-15')).toThrow()
  })
})

describe('sumarAvisosMercadoLibre (varios avisos de la misma propiedad)', () => {
  const c = (interesados: number, preguntas: number, whatsapp = 0) => ({ interesados, preguntas, whatsapp, llamadas: 0, otros: 0 })
  it('suma visitas, contactos por canal y vistas del teléfono', () => {
    expect(sumarAvisosMercadoLibre([
      { visitas: 4, contactos: c(1, 1), vistasTelefono: 2 },
      { visitas: 10, contactos: c(2, 1, 1), vistasTelefono: 0 },
    ])).toEqual({ visitas: 14, contactos: c(3, 2, 1), vistasTelefono: 2 })
  })
  it('si a uno le falta la ventana del teléfono, el total del teléfono es desconocido (null), no una suma de menos', () => {
    expect(sumarAvisosMercadoLibre([
      { visitas: 4, contactos: c(0, 0), vistasTelefono: null },
      { visitas: 1, contactos: c(0, 0), vistasTelefono: 3 },
    ]).vistasTelefono).toBeNull()
  })
})

describe('Meta Ads', () => {
  it('resultadosDe toma los registros de la landing (onsite_web_lead en la respuesta real)', () => {
    expect(resultadosDe([{ action_type: 'link_click', value: '128' }, { action_type: 'onsite_web_lead', value: '3' }])).toBe(3)
    expect(resultadosDe(undefined)).toBe(0)
  })
  it('sumarMeta: totales, edad/sexo en los 6 rangos y plataformas ordenadas por alcance', () => {
    const d = sumarMeta([{
      total: [{ reach: '3026', impressions: '4136', spend: '12678.6', actions: [{ action_type: 'onsite_web_lead', value: '3' }] }],
      edadSexo: [
        { age: '35-44', gender: 'female', actions: [{ action_type: 'onsite_web_lead', value: '1' }] },
        { age: '45-54', gender: 'female', actions: [{ action_type: 'onsite_web_lead', value: '2' }] },
        { age: '45-54', gender: 'male', actions: [] },
      ],
      plataformas: [
        { publisher_platform: 'instagram', reach: '1340', actions: [{ action_type: 'onsite_web_lead', value: '2' }] },
        { publisher_platform: 'facebook', reach: '1720', actions: [{ action_type: 'onsite_web_lead', value: '1' }] },
      ],
    }])
    expect(d).toMatchObject({ campanas: 1, alcance: 3026, impresiones: 4136, resultados: 3, gasto: 12678.6 })
    expect(d.edadSexo.find(e => e.rango === '45-54')).toEqual({ rango: '45-54', hombres: 0, mujeres: 2 })
    expect(d.edadSexo).toHaveLength(6)
    expect(d.plataformas).toEqual([
      { plataforma: 'Facebook', alcance: 1720, resultados: 1 },
      { plataforma: 'Instagram', alcance: 1340, resultados: 2 },
    ])
  })
  it('una campaña sin datos en el período no cuenta', () => {
    expect(sumarMeta([{ total: [], edadSexo: [], plataformas: [] }]).campanas).toBe(0)
  })
})

describe('reelDeInsights (respuesta real de Instagram)', () => {
  it('lee cada métrica por nombre', () => {
    const r = reelDeInsights({ data: [
      { name: 'views', values: [{ value: 3354 }] }, { name: 'reach', values: [{ value: 2376 }] },
      { name: 'likes', values: [{ value: 64 }] }, { name: 'comments', values: [{ value: 60 }] },
      { name: 'saved', values: [{ value: 18 }] }, { name: 'shares', values: [{ value: 10 }] },
    ] }, { permalink: 'https://instagram.com/reel/x', publicadoEn: '2026-09-22T20:53:13Z' })
    expect(r).toEqual({ permalink: 'https://instagram.com/reel/x', publicadoEn: '2026-09-22T20:53:13Z', reproducciones: 3354, alcance: 2376, meGusta: 64, comentarios: 60, guardados: 18, compartidos: 10 })
  })
  it('respuesta rara → error', () => {
    expect(() => reelDeInsights({ error: {} }, { permalink: null, publicadoEn: null })).toThrow()
  })
})
