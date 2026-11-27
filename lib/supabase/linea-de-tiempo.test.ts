/**
 * Lectura de los eventos del sistema de un contacto (crm-linea-de-tiempo, design.md D4)
 * contra una base simulada que aplica de verdad los filtros. Los textos de cada evento se
 * prueban en `lib/crm/linea-de-tiempo.test.ts`; acá: que se lea SOLO lo de este contacto,
 * las exclusiones de WhatsApp (decisión 5 del dueño) y que una fuente rota no tape las demás.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseSimulada, type OpcionesBaseSimulada } from './cartera.simulada'

const m = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.cliente }))

import { leerEventosDelSistema, MARGEN_EMPATES } from './linea-de-tiempo'

const C = '00000000-0000-4000-8000-000000000001'
const OTRO = '00000000-0000-4000-8000-000000000002'
const D1 = '00000000-0000-4000-8000-0000000000d1'
const D_OTRO = '00000000-0000-4000-8000-0000000000d2'
const PAULA = '00000000-0000-4000-8000-0000000000a1'
const TOMAS = '00000000-0000-4000-8000-0000000000a2'
const BRUNO = '00000000-0000-4000-8000-0000000000a3'
const D2 = '00000000-0000-4000-8000-0000000000d3'
const TODO = { usuarioId: PAULA, soloPropios: false }
const leer = (cursor: Parameters<typeof leerEventosDelSistema>[1] = null, alcance = TODO) => leerEventosDelSistema(C, cursor, 50, alcance)

type Tablas = Record<string, Record<string, unknown>[]>
let base: ReturnType<typeof baseSimulada>

function tablas(extra: Partial<Tablas> = {}): Tablas {
  return {
    contacts: [
      { id: C, phone_norm: '1155550142' },
      { id: OTRO, phone_norm: '1199990000' },
    ],
    profiles: [
      { id: PAULA, full_name: 'Paula', phone: '+57 300 111 2233', role: 'coordinador' },
      { id: TOMAS, full_name: 'Tomás', phone: null, role: 'asesor' },
      { id: BRUNO, full_name: 'Bruno', phone: null, role: 'asesor' },
    ],
    deals: [
      { id: D1, contact_id: C, meta_ad_name: 'AD04 - VID08', created_at: '2026-11-20T10:00:00Z', scheduled_date: '2026-11-25', assigned_to: TOMAS },
      { id: D_OTRO, contact_id: OTRO, meta_ad_name: 'AD99', created_at: '2026-11-20T10:00:00Z', scheduled_date: null, assigned_to: null },
    ],
    funnel_lead_submissions: [
      { id: 's1', contact_id: C, deal_id: D1, funnel: 'tasacion', status: 'complete', created_at: '2026-11-20T10:00:00Z' },
      { id: 's2', contact_id: OTRO, deal_id: D_OTRO, funnel: 'tasacion', status: 'complete', created_at: '2026-11-20T11:00:00Z' },
    ],
    deal_stage_history: [
      { id: 1, deal_id: D1, from_stage: null, to_stage: 'request', changed_at: '2026-11-20T10:00:01Z', changed_by: null },
      { id: 2, deal_id: D1, from_stage: 'request', to_stage: 'scheduled', changed_at: '2026-11-21T10:00:00Z', changed_by: PAULA, metadata: { scheduled_date: '2026-11-25', scheduled_date_antes: null } },
      { id: 3, deal_id: D_OTRO, from_stage: 'request', to_stage: 'lost', changed_at: '2026-11-21T11:00:00Z', changed_by: null },
    ],
    tasks: [
      { id: 't1', type: 'follow_up', deal_id: null, contact_id: C, title: 'Pedir documentación', status: 'completed', assigned_to: PAULA, created_at: '2026-11-21T12:00:00Z', created_by: null, completed_at: '2026-11-22T12:00:00Z', completed_by: PAULA, source_activity_id: null },
      { id: 't2', type: 'follow_up', deal_id: null, contact_id: OTRO, title: 'Ajena', status: 'pending', assigned_to: PAULA, created_at: '2026-11-21T12:00:00Z', created_by: null, completed_at: null, completed_by: null, source_activity_id: null },
    ],
    whatsapp_messages: [
      { id: 'w1', phone_e164: '5491155550142', direction: 'in', status: 'received', template_name: null, body_preview: 'Hola', sent_by: null, ai_generated: false, created_at: '2026-11-21T09:00:00Z' },
      { id: 'w2', phone_e164: '5491199990000', direction: 'in', status: 'received', template_name: null, body_preview: 'Ajeno', sent_by: null, ai_generated: false, created_at: '2026-11-21T09:00:00Z' },
    ],
    video_view_state: [
      { id: 'v1', contact_id: C, video_key: 'hero-tasacion', max_percent: 62, first_at: '2026-11-20T10:04:00Z', playback_started: true },
      { id: 'v2', contact_id: OTRO, video_key: 'hero-tasacion', max_percent: 10, first_at: '2026-11-20T10:04:00Z', playback_started: true },
    ],
    ...extra,
  }
}

function usar(t: Tablas, o: OpcionesBaseSimulada = {}) {
  base = baseSimulada(t, o)
  m.cliente = base.cliente
}

beforeEach(() => usar(tablas()))

const ids = (r: Awaited<ReturnType<typeof leerEventosDelSistema>>) => r.eventos.map((e) => e.id).sort()

describe('leerEventosDelSistema', () => {
  it('trae solo lo de este contacto, de cada fuente', async () => {
    const r = await leer()
    expect(r.fuentesConError).toEqual([])
    expect(ids(r)).toEqual(['etapa:2', 'registro:s1', 'tarea:t1:completada', 'tarea:t1:creada', 'video:v1', 'whatsapp:w1'].sort())
    const etapa = r.eventos.find((e) => e.id === 'etapa:2')!
    expect(etapa.autor).toEqual({ id: PAULA, nombre: 'Paula' })
    expect(r.eventos.find((e) => e.id === 'registro:s1')!.detalle).toBe('Anuncio de Meta · AD04 - VID08')
  })

  it('WhatsApp se busca por los últimos 10 dígitos', async () => {
    await leer()
    const q = base.consultas.find((c) => c.tabla === 'whatsapp_messages')!
    expect(q.filtros).toContain('like:phone_e164=%1155550142')
  })

  it('sin WhatsApp si el teléfono es del equipo', async () => {
    usar(tablas({ profiles: [{ id: PAULA, full_name: 'Paula', phone: '11 5555-0142' }] }))
    const r = await leer()
    expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
    // Los mensajes ni se leen (solo la comprobación de avisos al equipo).
    expect(base.consultas.some((c) => c.tabla === 'whatsapp_messages' && c.select.includes('body_preview'))).toBe(false)
  })

  it('sin WhatsApp si otro contacto comparte el teléfono', async () => {
    const t = tablas()
    t.contacts.push({ id: '00000000-0000-4000-8000-000000000003', phone_norm: '1155550142' })
    usar(t)
    const r = await leer()
    expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
  })

  it('sin WhatsApp si el contacto no tiene teléfono', async () => {
    const t = tablas()
    t.contacts[0] = { id: C, phone_norm: null }
    usar(t)
    const r = await leer()
    expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
    expect(r.fuentesConError).toEqual([])
  })

  it('si no se pueden leer los teléfonos del equipo, WhatsApp queda con error y no se muestra', async () => {
    usar(tablas(), { fallarConsulta: (c) => c.tabla === 'profiles' && c.select.includes('phone') })
    const r = await leer()
    expect(r.fuentesConError).toEqual(['whatsapp'])
    expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
    expect(r.eventos.some((e) => e.clase === 'etapa')).toBe(true)
  })

  it('una fuente que falla no tapa las demás', async () => {
    usar(tablas(), { fallar: ['video_view_state'] })
    const r = await leer()
    expect(r.fuentesConError).toEqual(['video'])
    expect(r.eventos.some((e) => e.clase === 'registro')).toBe(true)
  })

  it('si fallan los procesos, registro y etapas quedan con error', async () => {
    usar(tablas(), { fallar: ['deals'] })
    const r = await leer()
    // Las tareas también: sin los procesos no se sabe cuáles le toca ver a quien mira.
    expect(r.fuentesConError.sort()).toEqual(['etapa', 'registro', 'tarea'])
    expect(r.eventos.some((e) => e.clase === 'video')).toBe(true)
  })

  it('con cursor, cada fuente con fecha lee hasta esa fecha inclusive (los empates se cortan en memoria)', async () => {
    await leer({ fecha: '2026-11-21T10:00:00.000Z', id: 'etapa:2' })
    for (const [tabla, col] of [
      ['deal_stage_history', 'changed_at'],
      ['whatsapp_messages', 'created_at'],
      ['video_view_state', 'first_at'],
    ]) {
      const q = base.consultas.find((c) => c.tabla === tabla && c.select.includes(col))!
      // El milisegundo siguiente con `<`: la base tiene microsegundos (auditoría, hallazgo 2).
      expect(q.filtros).toContain(`lt:${col}=2026-11-21T10:00:00.001Z`)
      expect(q.rangos).toEqual([[0, 50 + MARGEN_EMPATES]])
    }
  })

  it('un empate al microsegundo con el cursor vuelve a leerse', async () => {
    const t = tablas()
    t.video_view_state[0].first_at = '2026-11-21T10:00:00.000400Z'
    usar(t)
    const r = await leer({ fecha: '2026-11-21T10:00:00.000Z', id: 'zzz' })
    expect(r.eventos.some((e) => e.id === 'video:v1')).toBe(true)
  })

  it('WhatsApp: si el número recibió avisos de consultas, es del equipo', async () => {
    const t = tablas()
    t.whatsapp_messages.push({ id: 'w9', phone_e164: '5491155550142', direction: 'out', status: 'read', template_name: 'consulta_portal_v2', body_preview: 'Nueva consulta de otra persona', sent_by: null, ai_generated: false, created_at: '2026-11-21T09:30:00Z' })
    usar(t)
    const r = await leer()
    expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
  })

  it('WhatsApp: si el número está en las variables de entorno de las copias, es del equipo', async () => {
    vi.stubEnv('WHATSAPP_CC_PHONES', '5493000000000, 5491155550142')
    try {
      const r = await leer()
      expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('WhatsApp: dos números completos con los mismos 10 dígitos → ninguno', async () => {
    const t = tablas()
    t.whatsapp_messages.push({ id: 'w8', phone_e164: '11155550142', direction: 'in', status: 'received', template_name: null, body_preview: 'De otro país', sent_by: null, ai_generated: false, created_at: '2026-11-21T08:00:00Z' })
    usar(t)
    expect((await leer()).eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
  })

  it('tareas: también las del proceso que no llevan contacto', async () => {
    const t = tablas()
    t.tasks.push({ id: 't3', type: 'new_assignment', deal_id: D1, contact_id: null, title: 'Tasación coordinada', status: 'pending', assigned_to: TOMAS, created_at: '2026-11-21T12:00:00Z', created_by: null, completed_at: null, completed_by: null, source_activity_id: null })
    usar(t)
    expect((await leer()).eventos.some((e) => e.id === 'tarea:t3:creada')).toBe(true)
  })

  describe('asesor: lo de un proceso de otro asesor no viaja', () => {
    function conDosProcesos() {
      const t = tablas()
      t.deals.push({ id: D2, contact_id: C, meta_ad_name: 'AD77', created_at: '2026-11-22T10:00:00Z', scheduled_date: null, assigned_to: BRUNO })
      t.funnel_lead_submissions.push({ id: 's3', contact_id: C, deal_id: D2, funnel: 'clase', status: 'complete', created_at: '2026-11-22T10:00:00Z' })
      t.deal_stage_history.push({ id: 4, deal_id: D2, from_stage: 'clase_gratuita', to_stage: 'lost', changed_at: '2026-11-23T10:00:00Z', changed_by: BRUNO, metadata: {} })
      t.tasks.push(
        { id: 't4', type: 'follow_up', deal_id: D2, contact_id: C, title: 'De Bruno', status: 'pending', assigned_to: BRUNO, created_at: '2026-11-22T12:00:00Z', created_by: null, completed_at: null, completed_by: null, source_activity_id: null },
        { id: 't5', type: 'update_contact', deal_id: null, contact_id: C, title: 'De la coordinación', status: 'pending', assigned_to: PAULA, created_at: '2026-11-22T12:00:00Z', created_by: null, completed_at: null, completed_by: null, source_activity_id: null },
      )
      usar(t)
    }

    it('Tomás ve lo suyo y lo de la persona, no lo de Bruno', async () => {
      conDosProcesos()
      const r = await leer(null, { usuarioId: TOMAS, soloPropios: true })
      const ids = r.eventos.map((e) => e.id)
      expect(ids).toEqual(expect.arrayContaining(['registro:s1', 'etapa:2', 'video:v1', 'whatsapp:w1']))
      expect(ids).not.toContain('registro:s3')
      expect(ids).not.toContain('etapa:4')
      expect(ids).not.toContain('tarea:t4:creada')
      // Una tarea ligada solo al contacto y asignada a otra persona tampoco (spec vigente).
      expect(ids).not.toContain('tarea:t5:creada')
      // Ni por la red: el historial del proceso ajeno ni se consulta.
      const q = base.consultas.find((c) => c.tabla === 'deal_stage_history')!
      expect(q.filtros.join(' ')).not.toContain(D2)
    })

    it('la coordinación ve todo', async () => {
      conDosProcesos()
      const ids = (await leer()).eventos.map((e) => e.id)
      expect(ids).toEqual(expect.arrayContaining(['registro:s3', 'etapa:4', 'tarea:t4:creada', 'tarea:t5:creada']))
    })
  })
})
