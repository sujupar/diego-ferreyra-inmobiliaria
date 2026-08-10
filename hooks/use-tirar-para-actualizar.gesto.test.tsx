// @vitest-environment happy-dom
/**
 * El gesto de verdad, con eventos táctiles despachados sobre el contenedor.
 *
 * Los tests de `use-tirar-para-actualizar.test.ts` cubren las funciones puras
 * (cuándo un recorrido cuenta como tirón, la resistencia, el umbral). Lo que
 * NO cubrían es el enganche: los oyentes viven adentro de un `useEffect`, y
 * ahí es donde estaba el defecto que motiva este archivo — el pellizco para
 * hacer zoom quedaba bloqueado dentro de la lista de conversaciones.
 *
 * Bloquear el zoom es una falla de accesibilidad, así que vale un test que
 * ejercite el evento en vez de mirar el código.
 */
import { describe, it, expect, vi } from 'vitest'
import { useRef } from 'react'
import { render, act } from '@testing-library/react'
import { useTirarParaActualizar, DISTANCIA_PARA_SOLTAR } from './use-tirar-para-actualizar'

/** Un `touchstart`/`touchmove`/`touchend` con N dedos en las posiciones dadas. */
function toque(tipo: string, dedos: Array<{ x: number; y: number }>) {
  const e = new Event(tipo, { bubbles: true, cancelable: true }) as Event & {
    touches: Array<{ clientX: number; clientY: number }>
  }
  Object.defineProperty(e, 'touches', {
    value: dedos.map(d => ({ clientX: d.x, clientY: d.y })),
  })
  return e
}

function montar() {
  const alRefrescar = vi.fn()
  const visto: { distancia: number } = { distancia: 0 }

  function Sonda() {
    const tiron = useTirarParaActualizar(alRefrescar)
    const puesto = useRef(false)
    visto.distancia = tiron.distancia
    return (
      <div
        data-testid="lista"
        ref={el => {
          tiron.contenedorRef.current = el
          if (el && !puesto.current) {
            puesto.current = true
            // La lista arranca arriba de todo, que es la única posición en la
            // que el tirón se puede apropiar del gesto.
            Object.defineProperty(el, 'scrollTop', { value: 0, writable: true })
          }
        }}
      />
    )
  }

  const r = render(<Sonda />)
  return { el: r.getByTestId('lista'), visto, alRefrescar }
}

describe('el gesto enganchado al contenedor', () => {
  it('un dedo bajando desde arriba de todo SÍ es nuestro: dibuja el indicador', () => {
    const { el, visto } = montar()
    act(() => {
      el.dispatchEvent(toque('touchstart', [{ x: 100, y: 100 }]))
      el.dispatchEvent(toque('touchmove', [{ x: 100, y: 100 + DISTANCIA_PARA_SOLTAR * 2 }]))
    })
    expect(visto.distancia).toBeGreaterThan(0)
  })

  it('DOS dedos son un pellizco para hacer zoom: no se toma el gesto ni se frena el zoom', () => {
    const { el, visto } = montar()
    const movimiento = toque('touchmove', [
      { x: 100, y: 260 },
      { x: 180, y: 300 },
    ])
    const frenado = vi.spyOn(movimiento, 'preventDefault')

    act(() => {
      el.dispatchEvent(toque('touchstart', [{ x: 100, y: 100 }, { x: 180, y: 140 }]))
      el.dispatchEvent(movimiento)
    })

    expect(visto.distancia).toBe(0)
    expect(frenado).not.toHaveBeenCalled()
  })

  it('un segundo dedo a mitad del tirón lo suelta: el pellizco gana aunque el gesto ya fuera nuestro', () => {
    const { el, visto } = montar()

    act(() => {
      el.dispatchEvent(toque('touchstart', [{ x: 100, y: 100 }]))
      el.dispatchEvent(toque('touchmove', [{ x: 100, y: 160 }]))
    })
    expect(visto.distancia).toBeGreaterThan(0)

    const conDosDedos = toque('touchmove', [
      { x: 100, y: 220 },
      { x: 180, y: 260 },
    ])
    const frenado = vi.spyOn(conDosDedos, 'preventDefault')
    act(() => {
      el.dispatchEvent(conDosDedos)
    })

    expect(frenado).not.toHaveBeenCalled()
  })
})
