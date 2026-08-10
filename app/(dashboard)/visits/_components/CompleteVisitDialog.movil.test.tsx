// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { CompleteVisitDialog } from './CompleteVisitDialog'

/**
 * "¿Cómo fue la visita?" es el formulario más largo del sistema —dos grupos de
 * radios, tres textareas y un número— y el que se completa parado en la vereda,
 * con el teclado abierto tapando media pantalla.
 *
 * Traía `max-h-[85vh] overflow-y-auto` propio, y ahí estaba el problema: `cn()`
 * es tailwind-merge, así que una clase `max-h-*` del consumidor PISA la del
 * primitivo. Este diálogo se quedaba fuera del techo nuevo justo cuando más lo
 * necesita. Y encima `85vh` en iOS se mide contra el viewport GRANDE (el de la
 * barra de direcciones escondida): ~717px de 844 cuando lo visible son ~640, o
 * sea que el botón "Guardar" caía debajo del borde y con el teclado abierto era
 * inalcanzable.
 *
 * El otro arreglo: los `RadioGroupItem` de Radix son `<button>` de 16px, NO
 * `<input type="radio">`, así que no les llega el halo táctil de 44px que
 * `app/globals.css` reparte en `@media (pointer: coarse)`. El alto se lo pone
 * la fila.
 */

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function abrir() {
  render(
    <CompleteVisitDialog visitId="v1" open onOpenChange={() => {}} onCompleted={() => {}} />,
  )
  return document.querySelector('[data-slot="dialog-content"]') as HTMLElement
}

describe('CompleteVisitDialog — el techo de altura lo pone el primitivo', () => {
  it('no declara un max-h propio que pise al del sistema', () => {
    const contenido = abrir()
    // Si el consumidor volviera a poner un `max-h-*`, tailwind-merge borraría
    // ESTA clase: que siga presente es la prueba de que no hay override.
    expect(contenido).toHaveClass('max-h-[calc(var(--app-vh)-2rem)]')
    expect(contenido.className).not.toContain('max-h-[85vh]')
  })

  it('nunca vuelve a medirse en `vh` (en iOS miente ~110px)', () => {
    const contenido = abrir()
    expect(contenido.className).not.toMatch(/max-h-\[\d+vh\]/)
  })

  it('el botón Guardar existe y queda dentro del diálogo que scrollea', () => {
    const contenido = abrir()
    const guardar = screen.getByRole('button', { name: 'Guardar' })
    expect(contenido.contains(guardar)).toBe(true)
    expect(contenido).toHaveClass('overflow-y-auto')
  })
})

describe('CompleteVisitDialog — las opciones se pueden tocar con el pulgar', () => {
  it('cada fila de radio llega a 44px en celular', () => {
    abrir()
    for (const etiqueta of ['Se realizó', 'No se realizó']) {
      const fila = screen.getByText(etiqueta).closest('div')!
      expect(fila.className, `la fila de "${etiqueta}" no llega al mínimo táctil`).toContain('max-md:min-h-11')
    }
  })

  it('la etiqueta ocupa el renglón entero (tocar el texto también marca)', () => {
    abrir()
    const label = screen.getByText('Se realizó')
    expect(label).toHaveAttribute('for', 'o1')
    expect(label.className).toContain('flex-1')
  })
})

describe('CompleteVisitDialog — el importe abre el teclado numérico', () => {
  it('el campo de oferta declara inputMode decimal', () => {
    abrir()
    // El grupo del cuestionario solo aparece con "Se realizó", que es el valor
    // inicial.
    const oferta = screen.getByLabelText('¿Cuánto ofrecería? (USD)')
    expect(oferta).toHaveAttribute('inputmode', 'decimal')
  })
})
