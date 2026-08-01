import { describe, it, expect } from 'vitest'
import { filterConversations, DEFAULT_CONVERSATION_FILTERS, type ConversationFilters } from './filters'
import type { ConversationListItem } from './types'

function conv(overrides: Partial<ConversationListItem>): ConversationListItem {
  return {
    phone_e164: '5491100000000',
    contact_name: 'Cliente Genérico',
    lead_id: null,
    lead_number: null,
    property_id: null,
    property: null,
    advisor_id: null,
    advisor_name: null,
    last_message: 'hola',
    last_direction: 'in',
    last_status: 'received',
    last_at: '2026-07-30T10:00:00Z',
    unread_count: 0,
    ...overrides,
  }
}

const f = (overrides: Partial<ConversationFilters> = {}): ConversationFilters => ({
  ...DEFAULT_CONVERSATION_FILTERS,
  ...overrides,
})

describe('filterConversations', () => {
  it('sin filtros, devuelve todo', () => {
    const list = [conv({ phone_e164: 'a' }), conv({ phone_e164: 'b' })]
    expect(filterConversations(list, f())).toHaveLength(2)
  })

  it('onlyUnread filtra por unread_count > 0', () => {
    const list = [conv({ phone_e164: 'a', unread_count: 0 }), conv({ phone_e164: 'b', unread_count: 2 })]
    const r = filterConversations(list, f({ onlyUnread: true }))
    expect(r.map(c => c.phone_e164)).toEqual(['b'])
  })

  it('onlyUnanswered solo deja las que esperan respuesta (último mensaje entrante)', () => {
    const list = [
      conv({ phone_e164: 'esperando', last_direction: 'in' }),
      // `last_status` importa: desde que "contestada" es lista blanca, un
      // saliente solo cuenta como respuesta si SALIÓ de verdad. El default del
      // fixture es 'received', que es el estado de un ENTRANTE — dejarlo acá
      // describía una fila imposible (saliente recibido) y tapaba la regla real.
      conv({ phone_e164: 'contestada', last_direction: 'out', last_status: 'accepted' }),
    ]
    const r = filterConversations(list, f({ onlyUnanswered: true }))
    expect(r.map(c => c.phone_e164)).toEqual(['esperando'])
  })

  it('onlyUnanswered ordena por más tiempo esperando primero', () => {
    const list = [
      conv({ phone_e164: 'reciente', last_direction: 'in', last_at: '2026-07-30T11:00:00Z' }),
      conv({ phone_e164: 'vieja', last_direction: 'in', last_at: '2026-07-30T08:00:00Z' }),
    ]
    const r = filterConversations(list, f({ onlyUnanswered: true }))
    expect(r.map(c => c.phone_e164)).toEqual(['vieja', 'reciente'])
  })

  it('filtra por propiedad', () => {
    const list = [
      conv({ phone_e164: 'a', property_id: 'p1', property: { id: 'p1', address: 'Corrientes 1', title: null } }),
      conv({ phone_e164: 'b', property_id: 'p2', property: { id: 'p2', address: 'Corrientes 2', title: null } }),
    ]
    expect(filterConversations(list, f({ propertyId: 'p1' })).map(c => c.phone_e164)).toEqual(['a'])
  })

  it('filtra por asesor', () => {
    const list = [conv({ phone_e164: 'a', advisor_id: 'adv1' }), conv({ phone_e164: 'b', advisor_id: 'adv2' })]
    expect(filterConversations(list, f({ advisorId: 'adv1' })).map(c => c.phone_e164)).toEqual(['a'])
  })

  it('filtra por etiqueta', () => {
    const list = [
      conv({ phone_e164: 'a', tags: [{ slug: 'caliente', label: 'Caliente', color: 'red' }] }),
      conv({ phone_e164: 'b', tags: [{ slug: 'frio', label: 'Frío', color: 'blue' }] }),
    ]
    expect(filterConversations(list, f({ tagSlug: 'caliente' })).map(c => c.phone_e164)).toEqual(['a'])
  })

  it('sin campo tags (API vieja), el filtro de etiqueta no revienta — simplemente no matchea', () => {
    const list = [conv({ phone_e164: 'a', tags: undefined })]
    expect(() => filterConversations(list, f({ tagSlug: 'caliente' }))).not.toThrow()
    expect(filterConversations(list, f({ tagSlug: 'caliente' }))).toHaveLength(0)
  })

  it('filtra por estado del embudo', () => {
    const list = [conv({ phone_e164: 'a', pipeline_state: 'nuevo' }), conv({ phone_e164: 'b', pipeline_state: 'negociando' })]
    expect(filterConversations(list, f({ pipelineState: 'negociando' })).map(c => c.phone_e164)).toEqual(['b'])
  })

  it('busca por nombre, teléfono, mensaje, dirección y #número', () => {
    const list = [
      conv({ phone_e164: 'a', contact_name: 'Juana Pérez', lead_number: 1002 }),
      conv({ phone_e164: 'b', contact_name: 'Martín Gómez' }),
    ]
    expect(filterConversations(list, f({ search: 'juana' })).map(c => c.phone_e164)).toEqual(['a'])
    expect(filterConversations(list, f({ search: '#1002' })).map(c => c.phone_e164)).toEqual(['a'])
  })

  it('busca también por etiqueta', () => {
    const list = [conv({ phone_e164: 'a', tags: [{ slug: 'exterior', label: 'Comprador del exterior', color: 'violet' }] })]
    expect(filterConversations(list, f({ search: 'exterior' }))).toHaveLength(1)
  })

  it('onlyWindowClosing deja solo las que tienen la ventana ABIERTA', () => {
    const list = [
      conv({ phone_e164: 'abierta', window: { open: true, msRemaining: 10 * 60000 } }),
      conv({ phone_e164: 'cerrada', window: { open: false, msRemaining: 0 } }),
      conv({ phone_e164: 'sin-dato' }), // API vieja sin `window` — queda afuera, no rompe
    ]
    const r = filterConversations(list, f({ onlyWindowClosing: true }))
    expect(r.map(c => c.phone_e164)).toEqual(['abierta'])
  })

  it('onlyWindowClosing ordena por menos tiempo restante primero', () => {
    const list = [
      conv({ phone_e164: 'mucho', window: { open: true, msRemaining: 20 * 60 * 60000 } }),
      conv({ phone_e164: 'poco', window: { open: true, msRemaining: 5 * 60000 } }),
    ]
    const r = filterConversations(list, f({ onlyWindowClosing: true }))
    expect(r.map(c => c.phone_e164)).toEqual(['poco', 'mucho'])
  })

  it('onlyAiOrder NO filtra nada — una conversación sin analizar sigue en la lista', () => {
    const list = [
      conv({ phone_e164: 'analizada', priority: { score: 90, reason: 'x', windowUrgency: 10, analyzed: true } }),
      conv({ phone_e164: 'sin-analizar', priority: { score: 20, reason: 'y', windowUrgency: 20, analyzed: false } }),
    ]
    const r = filterConversations(list, f({ onlyAiOrder: true }))
    expect(r).toHaveLength(2)
  })

  it('onlyAiOrder ordena por priority.score descendente', () => {
    const list = [
      conv({ phone_e164: 'baja', priority: { score: 30, reason: 'x', windowUrgency: 30, analyzed: true } }),
      conv({ phone_e164: 'alta', priority: { score: 95, reason: 'y', windowUrgency: 10, analyzed: true } }),
    ]
    const r = filterConversations(list, f({ onlyAiOrder: true }))
    expect(r.map(c => c.phone_e164)).toEqual(['alta', 'baja'])
  })

  it('onlyAiOrder sin campo priority (API vieja) no revienta, se ordena al final', () => {
    const list = [
      conv({ phone_e164: 'con-priority', priority: { score: 50, reason: 'x', windowUrgency: 50, analyzed: true } }),
      conv({ phone_e164: 'sin-priority' }),
    ]
    expect(() => filterConversations(list, f({ onlyAiOrder: true }))).not.toThrow()
  })

  it('combina varios filtros a la vez (AND)', () => {
    const list = [
      conv({ phone_e164: 'a', unread_count: 1, advisor_id: 'adv1' }),
      conv({ phone_e164: 'b', unread_count: 1, advisor_id: 'adv2' }),
      conv({ phone_e164: 'c', unread_count: 0, advisor_id: 'adv1' }),
    ]
    const r = filterConversations(list, f({ onlyUnread: true, advisorId: 'adv1' }))
    expect(r.map(c => c.phone_e164)).toEqual(['a'])
  })
})
