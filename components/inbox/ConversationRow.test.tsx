// @vitest-environment happy-dom
/**
 * La fila de la lista de conversaciones, con el pulgar.
 *
 * Son clases y atributos, y no hay navegador para mirarlos — pero cada uno tiene
 * un síntoma concreto: una fila que no se puede tocar entera, o un mensaje sin
 * leer que no se distingue de uno ya contestado bajando la lista a las apuradas.
 *
 * Y la otra mitad de cada test es la promesa de escritorio: de 768px para arriba
 * NADA de esto se ve, así que todo lo nuevo va con `max-md:`.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ConversationRow } from './ConversationRow'
import type { ConversationListItem } from './types'

function convo(overrides: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    phone_e164: '5491122334455',
    contact_name: 'Ana Gómez',
    lead_id: 'lead-1',
    lead_number: 12,
    property: null,
    property_id: null,
    advisor_id: null,
    advisor_name: null,
    assigned_to_name: null,
    last_message: 'Hola, quiero ver la propiedad',
    last_at: new Date().toISOString(),
    last_direction: 'out',
    last_status: 'delivered',
    unread_count: 0,
    ...overrides,
  } as ConversationListItem
}

function fila(item: ConversationListItem) {
  const { container } = render(<ConversationRow item={item} active={false} onSelect={() => {}} />)
  return container.firstElementChild as HTMLElement
}

describe('ConversationRow — la fila entera se toca', () => {
  it('el disparador es un botón de ancho completo, no el nombre', () => {
    const el = fila(convo())
    expect(el.tagName).toBe('BUTTON')
    expect(el.className).toContain('w-full')
  })

  it('tiene piso de alto táctil en celular, y solo en celular', () => {
    // Una fila sin propiedad, sin etiquetas y con un nombre corto se quedaba
    // por debajo del mínimo cómodo para el pulgar.
    expect(fila(convo()).className).toContain('max-md:min-h-16')
  })
})

describe('ConversationRow — el no leído se ve', () => {
  const sinLeer = convo({ unread_count: 3, last_direction: 'out' })
  const leida = convo({ unread_count: 0, last_direction: 'out' })

  it('el contador dice de qué son los 3', () => {
    const { container } = render(<ConversationRow item={sinLeer} active={false} onSelect={() => {}} />)
    const badge = container.querySelector('[aria-label="3 sin leer"]')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toBe('3')
  })

  it('sin mensajes sin leer no hay contador', () => {
    const { container } = render(<ConversationRow item={leida} active={false} onSelect={() => {}} />)
    expect(container.querySelector('[aria-label$="sin leer"]')).toBeNull()
  })

  it('el contador es más grande en celular (y del mismo tamaño de siempre en escritorio)', () => {
    const { container } = render(<ConversationRow item={sinLeer} active={false} onSelect={() => {}} />)
    const badge = container.querySelector('[aria-label="3 sin leer"]') as HTMLElement
    expect(badge.className).toContain('h-5')
    expect(badge.className).toContain('max-md:h-6')
  })

  it('el adelanto del mensaje deja de ser gris apagado, pero SOLO en celular', () => {
    const html = fila(sinLeer).innerHTML
    expect(html).toContain('max-md:font-medium')
    expect(html).toContain('max-md:text-foreground')
    // Y con la conversación leída, ni rastro.
    expect(fila(leida).innerHTML).not.toContain('max-md:font-medium')
  })

  it('la hora toma el color del contador en celular, y nada en escritorio', () => {
    const html = fila(sinLeer).innerHTML
    expect(html).toContain('max-md:text-emerald-700')
    expect(fila(leida).innerHTML).not.toContain('max-md:text-emerald-700')
  })

  it('el verde de la hora es el 700 y no el 600: el 600 no llega al contraste mínimo', () => {
    // A 10px semibold la norma pide 4.5 de contraste. Medido:
    //   emerald-600 → 3.67 sobre la tarjeta · 3.26 sobre la fila activa  ✗
    //   emerald-700 → 5.37 sobre la tarjeta · 4.78 sobre la fila activa  ✓
    // En oscuro el 400 ya daba 9.73, así que el problema era solo el tema claro.
    // Si alguien lo baja de vuelta buscando "que se vea más verde", este test
    // le dice por qué no.
    const html = fila(sinLeer).innerHTML
    expect(html).not.toContain('emerald-600')
  })

  it('nada de lo nuevo se cuela en escritorio: todo va detrás de `max-md:`', () => {
    // El contrato del sistema móvil: de 768px para arriba la fila se dibuja
    // exactamente igual que antes.
    const html = fila(sinLeer).innerHTML
    for (const clase of ['font-medium', 'text-emerald-600', 'h-6', 'min-w-6']) {
      const sueltas = html.split(`"`).join(' ').split(/\s+/).filter(c => c === clase)
      expect(sueltas, `"${clase}" tiene que ir siempre con el prefijo max-md:`).toHaveLength(0)
    }
  })
})
