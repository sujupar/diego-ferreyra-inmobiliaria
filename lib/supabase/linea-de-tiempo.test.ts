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

import { leerEventosDelSistema } from './linea-de-tiempo'

const C = '00000000-0000-4000-8000-000000000001'
const OTRO = '00000000-0000-4000-8000-000000000002'
const D1 = '00000000-0000-4000-8000-0000000000d1'
const D_OTRO = '00000000-0000-4000-8000-0000000000d2'
const PAULA = '00000000-0000-4000-8000-0000000000a1'

type Tablas = Record<string, Record<string, unknown>[]>
let base: ReturnType<typeof baseSimulada>

function tablas(extra: Partial<Tablas> = {}): Tablas {
  return {
    contacts: [
      { id: C, phone_norm: '1155550142' },
      { id: OTRO, phone_norm: '1199990000' },
    ],
    profiles: [{ id: PAULA, full_name: 'Paula', phone: '+57 300 111 2233' }],
    deals: [
      { id: D1, contact_id: C, meta_ad_name: 'AD04 - VID08' },
      { id: D_OTRO, contact_id: OTRO, meta_ad_name: 'AD99' },
    ],
    funnel_lead_submissions: [
      { id: 's1', contact_id: C, deal_id: D1, funnel: 'tasacion', status: 'complete', created_at: '2026-11-20T10:00:00Z' },
      { id: 's2', contact_id: OTRO, deal_id: D_OTRO, funnel: 'tasacion', status: 'complete', created_at: '2026-11-20T11:00:00Z' },
    ],
    deal_stage_history: [
      { id: 1, deal_id: D1, from_stage: null, to_stage: 'request', changed_at: '2026-11-20T10:00:01Z', changed_by: null },
      { id: 2, deal_id: D1, from_stage: 'request', to_stage: 'scheduled', changed_at: '2026-11-21T10:00:00Z', changed_by: PAULA },
      { id: 3, deal_id: D_OTRO, from_stage: 'request', to_stage: 'lost', changed_at: '2026-11-21T11:00:00Z', changed_by: null },
    ],
    tasks: [
      { id: 't1', contact_id: C, title: 'Pedir documentación', status: 'completed', assigned_to: PAULA, created_at: '2026-11-21T12:00:00Z', created_by: null, completed_at: '2026-11-22T12:00:00Z', completed_by: PAULA, source_activity_id: null },
      { id: 't2', contact_id: OTRO, title: 'Ajena', status: 'pending', assigned_to: PAULA, created_at: '2026-11-21T12:00:00Z', created_by: null, completed_at: null, completed_by: null, source_activity_id: null },
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
    const r = await leerEventosDelSistema(C, null, 50)
    expect(r.fuentesConError).toEqual([])
    expect(ids(r)).toEqual(['etapa:2', 'registro:s1', 'tarea:t1:completada', 'tarea:t1:creada', 'video:v1', 'whatsapp:w1'].sort())
    const etapa = r.eventos.find((e) => e.id === 'etapa:2')!
    expect(etapa.autor).toEqual({ id: PAULA, nombre: 'Paula' })
    expect(r.eventos.find((e) => e.id === 'registro:s1')!.detalle).toBe('Anuncio de Meta · AD04 - VID08')
  })

  it('WhatsApp se busca por los últimos 10 dígitos', async () => {
    await leerEventosDelSistema(C, null, 50)
    const q = base.consultas.find((c) => c.tabla === 'whatsapp_messages')!
    expect(q.filtros).toContain('like:phone_e164=%1155550142')
  })

  it('sin WhatsApp si el teléfono es del equipo', async () => {
    usar(tablas({ profiles: [{ id: PAULA, full_name: 'Paula', phone: '11 5555-0142' }] }))
    const r = await leerEventosDelSistema(C, null, 50)
    expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
    expect(base.consultas.some((c) => c.tabla === 'whatsapp_messages')).toBe(false)
  })

  it('sin WhatsApp si otro contacto comparte el teléfono', async () => {
    const t = tablas()
    t.contacts.push({ id: '00000000-0000-4000-8000-000000000003', phone_norm: '1155550142' })
    usar(t)
    const r = await leerEventosDelSistema(C, null, 50)
    expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
  })

  it('sin WhatsApp si el contacto no tiene teléfono', async () => {
    const t = tablas()
    t.contacts[0] = { id: C, phone_norm: null }
    usar(t)
    const r = await leerEventosDelSistema(C, null, 50)
    expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
    expect(r.fuentesConError).toEqual([])
  })

  it('si no se pueden leer los teléfonos del equipo, WhatsApp queda con error y no se muestra', async () => {
    usar(tablas(), { fallarConsulta: (c) => c.tabla === 'profiles' && c.select.includes('phone') })
    const r = await leerEventosDelSistema(C, null, 50)
    expect(r.fuentesConError).toEqual(['whatsapp'])
    expect(r.eventos.some((e) => e.clase === 'whatsapp')).toBe(false)
    expect(r.eventos.some((e) => e.clase === 'etapa')).toBe(true)
  })

  it('una fuente que falla no tapa las demás', async () => {
    usar(tablas(), { fallar: ['video_view_state'] })
    const r = await leerEventosDelSistema(C, null, 50)
    expect(r.fuentesConError).toEqual(['video'])
    expect(r.eventos.some((e) => e.clase === 'registro')).toBe(true)
  })

  it('si fallan los procesos, registro y etapas quedan con error', async () => {
    usar(tablas(), { fallar: ['deals'] })
    const r = await leerEventosDelSistema(C, null, 50)
    expect(r.fuentesConError.sort()).toEqual(['etapa', 'registro'])
    expect(r.eventos.some((e) => e.clase === 'video')).toBe(true)
  })

  it('con cursor, cada fuente con fecha lee hasta esa fecha inclusive (los empates se cortan en memoria)', async () => {
    await leerEventosDelSistema(C, { fecha: '2026-11-21T10:00:00.000Z', id: 'etapa:2' }, 50)
    for (const [tabla, col] of [
      ['deal_stage_history', 'changed_at'],
      ['whatsapp_messages', 'created_at'],
      ['video_view_state', 'first_at'],
    ]) {
      const q = base.consultas.find((c) => c.tabla === tabla)!
      expect(q.filtros).toContain(`lte:${col}=2026-11-21T10:00:00.000Z`)
      expect(q.rangos).toEqual([[0, 50]])
    }
  })
})
