import { describe, expect, it } from 'vitest'
import {
  aplicarAActividades,
  eventosDeEtapa,
  eventosDeRegistro,
  eventosDeTareas,
  eventosDeVideo,
  eventosDeWhatsapp,
  nombreEtapaHistorial,
  recortarTexto,
  telefonoUtilizable,
  unirYCortar,
  type ItemLinea,
} from './linea-de-tiempo'

const nombres = new Map([
  ['u-paula', 'Paula'],
  ['u-tomas', 'Tomás Agüero'],
])

describe('eventosDeRegistro', () => {
  it('tasación con anuncio', () => {
    const [e] = eventosDeRegistro(
      [{ id: 's1', funnel: 'tasacion', status: 'complete', deal_id: 'd1', created_at: '2026-11-20T10:00:00Z' }],
      new Map([['d1', { meta_ad_name: 'AD04 - VID08' }]]),
    )
    expect(e).toMatchObject({
      id: 'registro:s1',
      clase: 'registro',
      titulo: 'Se registró · Solicitud de tasación',
      detalle: 'Anuncio de Meta · AD04 - VID08',
      autor: null,
      fecha: '2026-11-20T10:00:00Z',
    })
  })

  it('clase sin anuncio, y los reservados no aparecen', () => {
    const r = eventosDeRegistro(
      [
        { id: 's1', funnel: 'clase', status: 'complete', deal_id: null, created_at: '2026-11-20T10:00:00Z' },
        { id: 's2', funnel: 'tasacion', status: 'reserved', deal_id: null, created_at: '2026-11-21T10:00:00Z' },
      ],
      new Map(),
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ titulo: 'Se registró · Clase gratuita', detalle: null })
  })

  it('un anuncio vacío o con espacios no se muestra', () => {
    const [e] = eventosDeRegistro(
      [{ id: 's1', funnel: 'tasacion', status: 'complete', deal_id: 'd1', created_at: '2026-11-20T10:00:00Z' }],
      new Map([['d1', { meta_ad_name: '   ' }]]),
    )
    expect(e.detalle).toBeNull()
  })
})

describe('nombreEtapaHistorial', () => {
  it('usa los nombres de la plataforma; scheduled es Coordinada', () => {
    expect(nombreEtapaHistorial('request')).toBe('Solicitud')
    expect(nombreEtapaHistorial('scheduled')).toBe('Coordinada')
    expect(nombreEtapaHistorial('lost')).toBe('Descartado')
    expect(nombreEtapaHistorial('appraisal_sent')).toBe('Entregada')
  })
  it('una etapa desconocida se muestra cruda', () => {
    expect(nombreEtapaHistorial('rara')).toBe('rara')
  })
})

describe('eventosDeEtapa', () => {
  const h = (o: Partial<{ id: number; deal_id: string; from_stage: string | null; to_stage: string; changed_at: string; changed_by: string | null }>) => ({
    id: 1,
    deal_id: 'd1',
    from_stage: 'request',
    to_stage: 'scheduled',
    changed_at: '2026-11-21T10:00:00Z',
    changed_by: null,
    ...o,
  })

  it('cambio con autor', () => {
    const [e] = eventosDeEtapa([h({ changed_by: 'u-paula' })], new Set(), nombres)
    expect(e).toMatchObject({ id: 'etapa:1', clase: 'etapa', titulo: 'Pasó de Solicitud a Coordinada', autor: { id: 'u-paula', nombre: 'Paula' } })
  })

  it('sin autor, o con un autor que ya no existe, no inventa un nombre', () => {
    expect(eventosDeEtapa([h({})], new Set(), nombres)[0].autor).toBeNull()
    expect(eventosDeEtapa([h({ changed_by: 'u-borrado' })], new Set(), nombres)[0].autor).toBeNull()
  })

  it('la apertura se omite si el proceso nació de un registro', () => {
    expect(eventosDeEtapa([h({ from_stage: null, to_stage: 'request' })], new Set(['d1']), nombres)).toEqual([])
  })

  it('la apertura de un proceso cargado a mano', () => {
    const [e] = eventosDeEtapa([h({ from_stage: null, to_stage: 'scheduled' })], new Set(), nombres)
    expect(e.titulo).toBe('Se abrió un proceso en Coordinada')
  })

  it('un "cambio" a la misma etapa no se muestra', () => {
    expect(eventosDeEtapa([h({ from_stage: 'lost', to_stage: 'lost' })], new Set(), nombres)).toEqual([])
  })
})

describe('eventosDeTareas', () => {
  const t = (o: Record<string, unknown>) => ({
    id: 't1',
    title: 'Pedir documentación',
    status: 'pending',
    assigned_to: 'u-tomas',
    created_at: '2026-11-17T12:00:00Z',
    completed_at: null,
    completed_by: null,
    source_activity_id: null,
    ...o,
  })

  it('creada y completada', () => {
    const r = eventosDeTareas(
      [t({ status: 'completed', completed_at: '2026-11-18T15:00:00Z', completed_by: 'u-tomas' })],
      nombres,
    )
    expect(r).toEqual([
      expect.objectContaining({ id: 'tarea:t1:creada', titulo: 'Se creó la tarea «Pedir documentación»', detalle: 'Para Tomás Agüero', autor: null }),
      expect.objectContaining({
        id: 'tarea:t1:completada',
        titulo: 'Se completó la tarea «Pedir documentación»',
        autor: { id: 'u-tomas', nombre: 'Tomás Agüero' },
        fecha: '2026-11-18T15:00:00Z',
      }),
    ])
  })

  it('una descartada solo muestra su creación', () => {
    const r = eventosDeTareas([t({ status: 'dismissed', completed_at: '2026-11-18T15:00:00Z' })], nombres)
    expect(r.map((e) => e.id)).toEqual(['tarea:t1:creada'])
  })

  it('la creada por una llamada no se repite', () => {
    expect(eventosDeTareas([t({ source_activity_id: 'a1' })], nombres)).toEqual([])
  })

  it('el autor de la creación se muestra si se guardó', () => {
    const [e] = eventosDeTareas([t({ created_by: 'u-paula' })], nombres)
    expect(e.autor).toEqual({ id: 'u-paula', nombre: 'Paula' })
  })

  it('las copias de la coordinación se ven una sola vez', () => {
    const r = eventosDeTareas(
      [
        t({ id: 'a', title: 'Contactar a Marcela', assigned_to: 'u-c1', created_at: '2026-11-17T12:00:00Z' }),
        t({ id: 'b', title: 'Contactar a Marcela', assigned_to: 'u-c2', created_at: '2026-11-17T12:00:30Z' }),
      ],
      nombres,
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'tarea:a:creada', detalle: 'Para la coordinación' })
  })

  it('el mismo título lejos en el tiempo son dos tareas', () => {
    const r = eventosDeTareas(
      [
        t({ id: 'a', assigned_to: 'u-c1', created_at: '2026-11-17T12:00:00Z' }),
        t({ id: 'b', assigned_to: 'u-c2', created_at: '2026-11-17T12:05:00Z' }),
      ],
      nombres,
    )
    expect(r).toHaveLength(2)
  })

  it('sin asignado, sin detalle', () => {
    expect(eventosDeTareas([t({ assigned_to: null })], nombres)[0].detalle).toBeNull()
  })
})

describe('telefonoUtilizable', () => {
  it('devuelve los 10 dígitos', () => {
    expect(telefonoUtilizable('1155550142', new Set(), false)).toBe('1155550142')
  })
  it('null si no hay 10 dígitos, si es del equipo o si se comparte', () => {
    expect(telefonoUtilizable(null, new Set(), false)).toBeNull()
    expect(telefonoUtilizable('12345', new Set(), false)).toBeNull()
    expect(telefonoUtilizable('1155550142', new Set(['1155550142']), false)).toBeNull()
    expect(telefonoUtilizable('1155550142', new Set(), true)).toBeNull()
  })
})

describe('recortarTexto', () => {
  it('corta por palabra con "…"', () => {
    expect(recortarTexto('hola que tal', 140)).toBe('hola que tal')
    expect(recortarTexto('uno dos tres cuatro', 10)).toBe('uno dos…')
    expect(recortarTexto('   ', 10)).toBeNull()
    expect(recortarTexto(null, 10)).toBeNull()
  })
})

describe('eventosDeWhatsapp', () => {
  const m = (o: Record<string, unknown>) => ({
    id: 'w1',
    direction: 'in',
    status: 'received',
    template_name: null,
    body_preview: '¿Me pueden llamar a la tarde?',
    sent_by: null,
    ai_generated: false,
    created_at: '2026-11-21T10:00:00Z',
    ...o,
  })

  it('recibido', () => {
    expect(eventosDeWhatsapp([m({})], nombres)[0]).toMatchObject({
      id: 'whatsapp:w1',
      clase: 'whatsapp',
      titulo: 'Escribió por WhatsApp',
      detalle: '¿Me pueden llamar a la tarde?',
      autor: null,
    })
  })

  it('enviado por una persona, por el asistente y automático', () => {
    const r = eventosDeWhatsapp(
      [
        m({ id: 'a', direction: 'out', status: 'read', sent_by: 'u-paula' }),
        m({ id: 'b', direction: 'out', status: 'delivered', ai_generated: true }),
        m({ id: 'c', direction: 'out', status: 'delivered', template_name: 'tasacion_llamada_v1' }),
      ],
      nombres,
    )
    expect(r.map((e) => [e.titulo, e.autor?.nombre ?? null])).toEqual([
      ['Se le envió un WhatsApp', 'Paula'],
      ['Le respondió el asistente por WhatsApp', null],
      ['Se le envió un WhatsApp automático', null],
    ])
  })

  it('no se pudo enviar', () => {
    const [e] = eventosDeWhatsapp([m({ direction: 'out', status: 'failed', template_name: 'x' })], nombres)
    expect(e.titulo).toBe('Se le envió un WhatsApp automático · no se pudo enviar')
    expect(e.fallido).toBe(true)
  })

  it('descarta avisos al equipo y notas internas del agente', () => {
    const r = eventosDeWhatsapp(
      [
        m({ id: 'a', direction: 'out', template_name: 'consulta_portal_v2' }),
        m({ id: 'b', direction: 'out', template_name: 'consulta_sin_enlace_v2' }),
        m({ id: 'c', direction: 'out', template_name: 'consulta_plano_util' }),
        m({ id: 'd', direction: 'out', status: 'agent_handoff' }),
      ],
      nombres,
    )
    expect(r).toEqual([])
  })
})

describe('eventosDeVideo', () => {
  const v = (o: Record<string, unknown>) => ({
    id: 'v1',
    video_key: 'hero-tasacion',
    max_percent: 62,
    first_at: '2026-11-20T10:04:00Z',
    playback_started: true,
    ...o,
  })
  it('textos por página', () => {
    const r = eventosDeVideo([
      v({}),
      v({ id: 'v2', video_key: 'hero-tasacion-b-animado', max_percent: 35 }),
      v({ id: 'v3', video_key: 'hero-clase', max_percent: 80 }),
      v({ id: 'v4', video_key: 'clase-completa', max_percent: 10 }),
      v({ id: 'v5', video_key: 'otra-clave', max_percent: null }),
    ])
    expect(r.map((e) => e.titulo)).toEqual([
      'Vio el video de la landing de tasación · 62 %',
      'Vio el video de la landing de tasación · 35 %',
      'Vio el video de la landing de la clase · 80 %',
      'Vio la clase completa · 10 %',
      'Vio un video de la landing · 0 %',
    ])
    expect(r[0]).toMatchObject({ id: 'video:v1', clase: 'video', fecha: '2026-11-20T10:04:00Z', autor: null })
  })
  it('sin reproducir no aparece', () => {
    expect(eventosDeVideo([v({ playback_started: false })])).toEqual([])
  })
})

describe('unirYCortar', () => {
  const ev = (id: string, fecha: string): ItemLinea => ({
    tipo: 'evento',
    evento: { id, clase: 'etapa', titulo: id, detalle: null, autor: null, fecha },
  })

  it('mezcla del más nuevo al más viejo', () => {
    const r = unirYCortar([[ev('a', '2026-11-20T10:00:00Z')], [ev('b', '2026-11-22T10:00:00Z'), ev('c', '2026-11-21T10:00:00Z')]], null, 50)
    expect(r.items.map(claveDe)).toEqual(['b', 'c', 'a'])
    expect(r.hayMas).toBe(false)
  })

  it('corta en el límite y el cursor no repite ni pierde un empate', () => {
    const f = '2026-11-20T10:00:00Z'
    const todos = [ev('x1', f), ev('x2', f), ev('x3', f)]
    const p1 = unirYCortar([todos], null, 2)
    expect(p1.items.map(claveDe)).toEqual(['x3', 'x2'])
    expect(p1.hayMas).toBe(true)
    const p2 = unirYCortar([todos], { fecha: f, id: 'x2' }, 2)
    expect(p2.items.map(claveDe)).toEqual(['x1'])
    expect(p2.hayMas).toBe(false)
  })

  it('compara instantes, no textos de fecha', () => {
    const r = unirYCortar([[ev('a', '2026-11-20T10:00:00.000Z'), ev('b', '2026-11-20T07:30:00-03:00')]], null, 50)
    expect(r.items.map(claveDe)).toEqual(['b', 'a'])
  })
})

function claveDe(i: ItemLinea) {
  return i.tipo === 'evento' ? i.evento.id : i.actividad.id
}

describe('aplicarAActividades', () => {
  type A = { id: string; occurred_at: string; body: string }
  const a = (id: string, body = id): ItemLinea<A> => ({ tipo: 'actividad', actividad: { id, occurred_at: '2026-11-20T10:00:00Z', body } })
  const e = (id: string): ItemLinea<A> => ({ tipo: 'evento', evento: { id, clase: 'etapa', titulo: id, detalle: null, autor: null, fecha: '2026-11-20T10:00:00Z' } })
  const ver = (xs: ItemLinea<A>[]) => xs.map((i) => (i.tipo === 'evento' ? i.evento.id : `${i.actividad.id}=${i.actividad.body}`))

  it('editar deja la actividad en su lugar, entre los eventos', () => {
    const r = aplicarAActividades([e('x'), a('n1'), e('y')], (as) => as.map((v) => (v.id === 'n1' ? { ...v, body: 'nuevo' } : v)))
    expect(ver(r)).toEqual(['x', 'n1=nuevo', 'y'])
  })
  it('sacar no toca los eventos', () => {
    expect(ver(aplicarAActividades([e('x'), a('n1'), a('n2')], (as) => as.filter((v) => v.id !== 'n1')))).toEqual(['x', 'n2=n2'])
  })
  it('una nueva va primero', () => {
    const nueva = { id: 'n9', occurred_at: '2026-11-27T10:00:00Z', body: 'n9' }
    expect(ver(aplicarAActividades([e('x'), a('n1')], (as) => [nueva, ...as]))).toEqual(['n9=n9', 'x', 'n1=n1'])
  })
})
