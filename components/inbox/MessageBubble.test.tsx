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
 * El contrato con el agente es el PREFIJO `agent_`, no esta lista: acá había
 * cuatro status copiados a mano mientras `lib/ai/scheduling-agent.ts` ya escribía
 * seis, y los dos que faltaban (`agent_visit_lookup_failed`,
 * `agent_propose_unsent`) se dibujaban como un mensaje enviado al cliente.
 *
 * Los ejemplos de abajo son eso, EJEMPLOS — lo que garantiza que un séptimo
 * status quede bien tratado es el par de tests "prefijo": el de acá (cualquier
 * `agent_*` se dibuja como nota interna) y el de
 * `lib/ai/scheduling-agent.test.ts` (todo status que el agente escribe arranca
 * con ese prefijo). Ese archivo no se puede importar desde este test: corre en
 * `happy-dom` y el módulo del agente arrastra la cadena de mails, que empieza
 * con `import 'server-only'` — el mismo motivo por el que el componente tampoco
 * lo importa.
 */
const NOTAS_INTERNAS = [
  'agent_handoff',
  'agent_visit_pending',
  'agent_visit_failed',
  'agent_visit_unconfirmed',
  'agent_visit_lookup_failed',
  'agent_propose_unsent',
]

describe('MessageBubble — notas internas del agente de IA', () => {
  it.each(NOTAS_INTERNAS)('%s se rotula como nota interna, no como string crudo', status => {
    const { text } = bubble(msg({ status, body_preview: '[Agente IA] Sigue una persona.' }))
    expect(text).toContain('Nota interna')
    // El defecto: el `default` de `outboundStatusMeta` imprimía el status tal cual.
    expect(text).not.toContain(status)
  })

  it.each(NOTAS_INTERNAS)('%s no se pinta con el color de un mensaje que SÍ salió', status => {
    const { html } = bubble(msg({ status }))
    // El color del saliente sale del token `--chat-out-bg` desde la Fase 1 del
    // sistema móvil (antes era `bg-emerald-100` escrito a mano).
    expect(html).not.toContain('var(--chat-out-bg)')
  })

  it.each(NOTAS_INTERNAS)('%s aclara en pantalla que el cliente no lo vio', status => {
    expect(bubble(msg({ status })).text).toContain('el cliente no la vio')
  })

  it('cada nota interna dice EN CASTELLANO por qué está ahí', () => {
    const motivos = NOTAS_INTERNAS.map(status => bubble(msg({ status })).text)
    expect(motivos.some(t => t.includes('sigue una persona'))).toBe(true)
    expect(motivos.some(t => t.includes('no se pudo verificar si ya había una visita anotada'))).toBe(true)
    expect(motivos.some(t => t.includes('no se le pudieron mandar las opciones de día'))).toBe(true)
  })

  it('un status del agente que todavía no existe igual se dibuja como nota interna (el criterio es el prefijo)', () => {
    // Este es EL test del arreglo: sin él, el séptimo status vuelve a caer en el
    // `default` y se pinta como un mensaje que salió hacia el cliente.
    const { text, html } = bubble(msg({ status: 'agent_lo_que_venga', body_preview: '[Agente IA] Algo pasó.' }))
    expect(text).toContain('Nota interna')
    expect(text).not.toContain('agent_lo_que_venga')
    expect(html).not.toContain('var(--chat-out-bg)')
  })

  it('el cuerpo de la nota se sigue leyendo', () => {
    const { text } = bubble(msg({ status: 'agent_handoff', body_preview: '[Agente IA] Se alcanzó el tope de 6 mensajes.' }))
    expect(text).toContain('Se alcanzó el tope de 6 mensajes.')
  })
})

describe('MessageBubble — mensajes reales (no se tocan)', () => {
  it('un saliente entregado sigue siendo la burbuja del lado propio con su tilde', () => {
    const { text, html } = bubble(msg({ status: 'delivered' }))
    expect(html).toContain('var(--chat-out-bg)')
    expect(text).toContain('Entregado')
    expect(text).not.toContain('Nota interna')
  })

  it('un entrante no es una nota interna', () => {
    const { text } = bubble(msg({ direction: 'in', status: 'received', body_preview: 'Me interesa' }))
    expect(text).toContain('Me interesa')
    expect(text).not.toContain('Nota interna')
  })

  it('un ENTRANTE con un status raro tampoco se convierte en nota interna', () => {
    // El prefijo solo se mira en los SALIENTES: las notas del agente son filas
    // que escribe el sistema, nunca algo que llegó del cliente.
    const { text } = bubble(msg({ direction: 'in', status: 'agent_handoff', body_preview: 'Me interesa' }))
    expect(text).not.toContain('Nota interna')
  })

  it('un envío fallido sigue mostrando el motivo en pantalla (requisito no negociable del brief)', () => {
    const { text } = bubble(msg({ status: 'failed', error_message: 'Número inválido' }))
    expect(text).toContain('No se pudo enviar: Número inválido')
    expect(text).not.toContain('Nota interna')
  })
})

/**
 * Fase 1 del sistema móvil. Son clases y un formato de hora: nada de esto se
 * puede mirar en un navegador desde acá, pero cada uno tiene un síntoma concreto
 * en un teléfono y ningún test de comportamiento los cubre.
 */
describe('MessageBubble — la burbuja en un teléfono', () => {
  const anchoDeLaBurbuja = (html: string) => html.match(/max-w-\[\d+%\][^"]*/)?.[0] ?? ''

  it('ocupa el 85% en celular y el 75% de md: para arriba', () => {
    // Con 75% fijo, en una columna de ~356px las burbujas quedaban en ~245px y
    // una dirección con altura y barrio se partía en tres renglones.
    const ancho = anchoDeLaBurbuja(bubble(msg()).html)
    expect(ancho).toContain('max-w-[85%]')
    expect(ancho).toContain('md:max-w-[75%]')
  })

  it('muestra la HORA (14:32), no "hace 3 días"', () => {
    // El hilo ya viene agrupado por día con su separador: lo relativo era
    // redundante y escondía el único dato que faltaba.
    const created = new Date()
    created.setHours(14, 32, 0, 0)
    const { text } = bubble(msg({ created_at: created.toISOString(), direction: 'in', status: 'received' }))
    expect(text).toContain('14:32')
    expect(text).not.toMatch(/hace \d|recién/)
  })

  it('la hora va ADENTRO de la burbuja, no en un renglón aparte', () => {
    // Afuera costaba un renglón por mensaje sobre un hilo que arrancaba con ~50px.
    const created = new Date()
    created.setHours(9, 5, 0, 0)
    const { html } = bubble(msg({ created_at: created.toISOString(), direction: 'in', status: 'received' }))
    const burbuja = html.slice(html.indexOf('max-w-[85%]'))
    const cierre = burbuja.indexOf('</div>')
    expect(burbuja.slice(0, cierre)).toContain('09:05')
  })

  it('una foto no se derrama fuera de la burbuja', () => {
    // Sin `max-w-full`, una foto apaisada se iba a ~455px dentro de una burbuja
    // de ~220px y el hilo entero ganaba scroll horizontal. Es el caso más común:
    // los clientes mandan fotos.
    const { html } = bubble(
      msg({ direction: 'in', status: 'received', media_url: 'https://ejemplo/f.jpg', media_mime_type: 'image/jpeg' }),
    )
    const img = html.match(/<img[^>]*>/)?.[0] ?? ''
    expect(img).toContain('max-w-full')
    expect(img).toContain('h-auto')
  })
})
