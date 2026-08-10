import { describe, it, expect } from 'vitest'
import { agenteApagadoEn, conAgenteMarcado } from './agente'
import type { ConversationListItem } from './types'

const PHONE = '5491122334455'
const OTRO = '5491199887766'

function conversacion(over: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    phone_e164: PHONE,
    contact_name: 'Cliente',
    lead_id: null,
    lead_number: null,
    property_id: null,
    property: null,
    advisor_id: null,
    advisor_name: null,
    last_message: 'Hola',
    last_direction: 'in',
    last_status: 'received',
    last_at: '2026-08-03T10:00:00.000Z',
    unread_count: 1,
    ...over,
  }
}

describe('agenteApagadoEn', () => {
  it('lee el flag de la fila, no de `ai`', () => {
    expect(agenteApagadoEn([conversacion({ agent_off: true })], PHONE)).toBe(true)
  })

  it('el caso que estaba roto: apagado en una conversación que la IA nunca analizó (ai null)', () => {
    expect(agenteApagadoEn([conversacion({ agent_off: true, ai: null })], PHONE)).toBe(true)
  })

  it('con el agente encendido devuelve false', () => {
    expect(agenteApagadoEn([conversacion({ agent_off: false })], PHONE)).toBe(false)
  })

  it('sin dato (endpoint viejo) NO inventa "apagado"', () => {
    expect(agenteApagadoEn([conversacion()], PHONE)).toBe(false)
  })

  it('no confunde una conversación con otra', () => {
    expect(agenteApagadoEn([conversacion({ agent_off: true })], OTRO)).toBe(false)
  })

  it('sin lista o sin teléfono seleccionado, activo', () => {
    expect(agenteApagadoEn(null, PHONE)).toBe(false)
    expect(agenteApagadoEn([conversacion({ agent_off: true })], null)).toBe(false)
  })
})

describe('conAgenteMarcado', () => {
  it('apagar deja la fila en agent_off true', () => {
    const out = conAgenteMarcado([conversacion()], PHONE, false)
    expect(out[0].agent_off).toBe(true)
  })

  it('prender la deja en false', () => {
    const out = conAgenteMarcado([conversacion({ agent_off: true })], PHONE, true)
    expect(out[0].agent_off).toBe(false)
  })

  it('el eco funciona aunque la conversación NO tenga análisis de IA', () => {
    // Con la guarda vieja (`c.ai ? … : c`) este caso devolvía la fila intacta:
    // el botón no hacía nada visible justo en el estado más común.
    const out = conAgenteMarcado([conversacion({ ai: null })], PHONE, false)
    expect(out[0].agent_off).toBe(true)
  })

  it('no toca las demás conversaciones', () => {
    const out = conAgenteMarcado([conversacion(), conversacion({ phone_e164: OTRO })], PHONE, false)
    expect(out[1].agent_off).toBeUndefined()
  })
})
