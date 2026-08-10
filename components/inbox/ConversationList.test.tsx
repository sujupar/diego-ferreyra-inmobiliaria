// @vitest-environment happy-dom
/**
 * El "tirar para actualizar" de la lista de conversaciones, probado
 * DISPARANDO los eventos de toque.
 *
 * Las reglas puras ya están cubiertas en `hooks/use-tirar-para-actualizar.test.ts`.
 * Acá se prueba lo que esas reglas no pueden ver por sí solas: que el gesto
 * quede efectivamente enganchado al scroller, y sobre todo que NO se apropie de
 * un deslizamiento horizontal — el gesto de volver del teléfono es horizontal, y
 * apropiárselo (llamando a `preventDefault`) es la forma de romperlo sin que
 * ningún test de lógica se entere.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { ConversationList } from './ConversationList'
import { DISTANCIA_PARA_SOLTAR, FACTOR_RESISTENCIA } from '@/hooks/use-tirar-para-actualizar'
import type { ConversationListItem } from './types'

function convo(phone: string): ConversationListItem {
  return {
    phone_e164: phone,
    contact_name: `Cliente ${phone}`,
    lead_id: null,
    lead_number: null,
    property_id: null,
    property: null,
    advisor_id: null,
    advisor_name: null,
    last_message: 'Hola',
    last_direction: 'in',
    last_status: 'received',
    last_at: new Date().toISOString(),
    unread_count: 0,
  } as ConversationListItem
}

/**
 * happy-dom no trae `TouchEvent` con toques de verdad: se arma un `Event` común
 * y se le cuelga `touches`, que es lo único que lee el hook.
 */
function toque(tipo: string, x: number, y: number): Event {
  const e = new Event(tipo, { bubbles: true, cancelable: true })
  const punto = { clientX: x, clientY: y }
  Object.defineProperty(e, 'touches', { value: [punto] })
  Object.defineProperty(e, 'changedTouches', { value: [punto] })
  return e
}

function montar(onRefresh?: () => Promise<unknown> | void) {
  const datos = [convo('1'), convo('2')]
  const { container } = render(
    <ConversationList
      conversations={datos}
      visible={datos}
      filtersActive={false}
      loading={false}
      error={null}
      selectedPhone={null}
      onSelectPhone={() => {}}
      onRefresh={onRefresh}
    />,
  )
  const scroller = container.querySelector('[data-slot="lista-scroller"]') as HTMLElement
  // happy-dom no calcula layout: `scrollTop` vale 0, que es justo "la lista está
  // arriba de todo" — el caso donde el tirón corresponde.
  return { container, scroller }
}

/** Un tirón hacia abajo lo bastante largo como para cruzar el umbral. */
const RECORRIDO_SUFICIENTE = DISTANCIA_PARA_SOLTAR / FACTOR_RESISTENCIA + 20

describe('ConversationList — tirar para actualizar', () => {
  it('un tirón completo vuelve a pedir la lista', async () => {
    const refrescar = vi.fn(async () => {})
    const { scroller } = montar(refrescar)

    await act(async () => {
      scroller.dispatchEvent(toque('touchstart', 100, 100))
      scroller.dispatchEvent(toque('touchmove', 100, 100 + RECORRIDO_SUFICIENTE))
      scroller.dispatchEvent(toque('touchend', 100, 100 + RECORRIDO_SUFICIENTE))
    })

    expect(refrescar).toHaveBeenCalledTimes(1)
  })

  it('un tirón corto NO actualiza: el umbral existe para no disparar sin querer', async () => {
    const refrescar = vi.fn(async () => {})
    const { scroller } = montar(refrescar)

    await act(async () => {
      scroller.dispatchEvent(toque('touchstart', 100, 100))
      scroller.dispatchEvent(toque('touchmove', 100, 130))
      scroller.dispatchEvent(toque('touchend', 100, 130))
    })

    expect(refrescar).not.toHaveBeenCalled()
  })

  it('scrollear hacia arriba no actualiza', async () => {
    const refrescar = vi.fn(async () => {})
    const { scroller } = montar(refrescar)

    await act(async () => {
      scroller.dispatchEvent(toque('touchstart', 100, 300))
      scroller.dispatchEvent(toque('touchmove', 100, 100))
      scroller.dispatchEvent(toque('touchend', 100, 100))
    })

    expect(refrescar).not.toHaveBeenCalled()
  })

  // ESTE es el test que protege el gesto de volver.
  it('un deslizamiento HORIZONTAL no se toca: ni actualiza ni cancela el evento', async () => {
    const refrescar = vi.fn(async () => {})
    const { scroller } = montar(refrescar)

    const movimiento = toque('touchmove', 100 + 200, 110)
    await act(async () => {
      scroller.dispatchEvent(toque('touchstart', 100, 100))
      scroller.dispatchEvent(movimiento)
      scroller.dispatchEvent(toque('touchend', 300, 110))
    })

    expect(refrescar).not.toHaveBeenCalled()
    // `preventDefault` sobre un deslizamiento horizontal es exactamente cómo se
    // rompe el "deslizar desde el borde para volver".
    expect(movimiento.defaultPrevented).toBe(false)
  })

  it('un tirón vertical SÍ cancela el evento (si no, el rebote del sistema compite con el indicador)', async () => {
    const { scroller } = montar(async () => {})
    const movimiento = toque('touchmove', 100, 100 + RECORRIDO_SUFICIENTE)
    await act(async () => {
      scroller.dispatchEvent(toque('touchstart', 100, 100))
      scroller.dispatchEvent(movimiento)
      scroller.dispatchEvent(toque('touchend', 100, 100 + RECORRIDO_SUFICIENTE))
    })
    expect(movimiento.defaultPrevented).toBe(true)
  })

  it('sin `onRefresh` el gesto no dispara nada (la lista queda como estaba)', async () => {
    const { scroller } = montar(undefined)
    const movimiento = toque('touchmove', 100, 100 + RECORRIDO_SUFICIENTE)
    await act(async () => {
      scroller.dispatchEvent(toque('touchstart', 100, 100))
      scroller.dispatchEvent(movimiento)
      scroller.dispatchEvent(toque('touchend', 100, 100 + RECORRIDO_SUFICIENTE))
    })
    // No hay a quién avisar: no debería quedar nada colgado ni marcado ocupado.
    expect(scroller.getAttribute('aria-busy')).toBeNull()
  })

  it('el scroller contiene su propio gesto (no se le contagia a la página)', () => {
    // Sin `overscroll-behavior: contain`, el mismo tirón dispara ADEMÁS el
    // "recargar" del navegador en Android y se pierde todo lo que hay en pantalla.
    const { scroller } = montar(async () => {})
    expect(scroller.className).toContain('scroll-pane')
  })
})
