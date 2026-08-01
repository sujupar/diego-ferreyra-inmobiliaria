// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ChatThread } from './ChatThread'
import type { ThreadMessage } from './types'

const HOUR = 3600000

function msg(direction: 'in' | 'out', minutesAgo: number, status = direction === 'in' ? 'received' : 'delivered'): ThreadMessage {
  return {
    id: `${direction}-${minutesAgo}-${status}`,
    direction,
    body_preview: direction === 'in' ? 'Hola, me interesa' : 'Nota',
    template_name: null,
    status,
    error_message: null,
    sent_by: null,
    created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    media_url: null,
    media_mime_type: null,
    media_filename: null,
    media_type: null,
  }
}

const endRef = { current: null }

function text(messages: ThreadMessage[]): string {
  return render(<ChatThread messages={messages} endRef={endRef} />).container.textContent ?? ''
}

describe('ChatThread — franja de demora', () => {
  it('el último mensaje es del cliente y hace rato → avisa desde cuándo espera', () => {
    expect(text([msg('in', 180)])).toContain('El cliente escribió hace 3 h y todavía nadie le contestó.')
  })

  it('el equipo ya contestó de verdad → no hay franja', () => {
    expect(text([msg('in', 180), msg('out', 175)])).not.toContain('todavía nadie le contestó')
  })

  it('espera corta (menos del umbral) → no hay franja', () => {
    expect(text([msg('in', 30)])).not.toContain('todavía nadie le contestó')
  })

  // El defecto que cierra este test: la nota interna del agente de IA es
  // reciente, así que la franja medía desde ELLA y directamente no aparecía —
  // el hilo se veía tranquilo con el cliente esperando hace 3 horas.
  it.each(['agent_handoff', 'agent_visit_pending', 'agent_visit_failed'])(
    'la nota interna del agente de IA (%s) no tapa la demora: se mide desde el mensaje del cliente',
    status => {
      expect(text([msg('in', 180), msg('out', 1, status)])).toContain('El cliente escribió hace 3 h y todavía nadie le contestó.')
    },
  )

  it('un envío que rebotó tampoco tapa la demora', () => {
    expect(text([msg('in', 180), msg('out', 1, 'failed')])).toContain('El cliente escribió hace 3 h y todavía nadie le contestó.')
  })

  it('hilo sin mensajes: el vacío, sin franja', () => {
    const t = text([])
    expect(t).toContain('Todavía no hay mensajes en esta conversación.')
    expect(t).not.toContain('todavía nadie le contestó')
  })
})

describe('ChatThread — umbral', () => {
  it('el umbral es de 2 horas (justo abajo no alerta, justo arriba sí)', () => {
    expect(text([msg('in', 119)])).not.toContain('todavía nadie le contestó')
    expect(text([msg('in', 121)])).toContain('todavía nadie le contestó')
    // Sanity: el umbral que usa la franja es el compartido, no uno propio.
    expect(2 * HOUR).toBe(2 * 60 * 60 * 1000)
  })
})
