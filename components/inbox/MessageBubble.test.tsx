// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MessageBubble } from './MessageBubble'
import type { ThreadMessage } from './types'

function msg(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: 'm1',
    direction: 'out',
    body_preview: 'Hola',
    template_name: null,
    status: 'delivered',
    error_message: null,
    sent_by: null,
    created_at: new Date().toISOString(),
    media_url: null,
    media_mime_type: null,
    media_filename: null,
    media_type: null,
    ...overrides,
  }
}

function bubble(m: ThreadMessage) {
  const { container } = render(<MessageBubble message={m} />)
  return { text: container.textContent ?? '', html: container.innerHTML }
}

/**
 * Las cuatro filas SALIENTES que el agente de IA escribe en `whatsapp_messages`
 * y que NUNCA salen hacia el cliente (constantes en `lib/ai/scheduling-agent.ts`).
 */
const NOTAS_INTERNAS = ['agent_handoff', 'agent_visit_pending', 'agent_visit_failed', 'agent_visit_unconfirmed']

describe('MessageBubble — notas internas del agente de IA', () => {
  it.each(NOTAS_INTERNAS)('%s se rotula como nota interna, no como string crudo', status => {
    const { text } = bubble(msg({ status, body_preview: '[Agente IA] Sigue una persona.' }))
    expect(text).toContain('Nota interna')
    // El defecto: el `default` de `outboundStatusMeta` imprimía el status tal cual.
    expect(text).not.toContain(status)
  })

  it.each(NOTAS_INTERNAS)('%s no se pinta con el verde de un mensaje que SÍ salió', status => {
    const { html } = bubble(msg({ status }))
    expect(html).not.toContain('bg-emerald-100')
  })

  it.each(NOTAS_INTERNAS)('%s aclara en pantalla que el cliente no lo vio', status => {
    expect(bubble(msg({ status })).text).toContain('el cliente no la vio')
  })

  it('el cuerpo de la nota se sigue leyendo', () => {
    const { text } = bubble(msg({ status: 'agent_handoff', body_preview: '[Agente IA] Se alcanzó el tope de 6 mensajes.' }))
    expect(text).toContain('Se alcanzó el tope de 6 mensajes.')
  })
})

describe('MessageBubble — mensajes reales (no se tocan)', () => {
  it('un saliente entregado sigue siendo la burbuja verde con su tilde', () => {
    const { text, html } = bubble(msg({ status: 'delivered' }))
    expect(html).toContain('bg-emerald-100')
    expect(text).toContain('Entregado')
    expect(text).not.toContain('Nota interna')
  })

  it('un entrante no es una nota interna', () => {
    const { text } = bubble(msg({ direction: 'in', status: 'received', body_preview: 'Me interesa' }))
    expect(text).toContain('Me interesa')
    expect(text).not.toContain('Nota interna')
  })

  it('un envío fallido sigue mostrando el motivo en pantalla (requisito no negociable del brief)', () => {
    const { text } = bubble(msg({ status: 'failed', error_message: 'Número inválido' }))
    expect(text).toContain('No se pudo enviar: Número inválido')
    expect(text).not.toContain('Nota interna')
  })
})
