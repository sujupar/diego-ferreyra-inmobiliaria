// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PropertyKeyStats } from './PropertyKeyStats'
import { buildKeyStats } from '@/lib/properties/detail-view'

describe('PropertyKeyStats', () => {
  it('no dibuja nada si no hay ningún dato cargado', () => {
    const { container } = render(<PropertyKeyStats stats={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra cada dato con su etiqueta', () => {
    render(<PropertyKeyStats stats={buildKeyStats({ rooms: 3, expensas: 185000 })} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Ambientes')).toBeInTheDocument()
    expect(screen.getByText('Expensas')).toBeInTheDocument()
  })

  /**
   * happy-dom no mide texto, así que lo verificable es la decisión de layout.
   * A 320px con tres columnas la tarjeta queda en ~91px (66 útiles) y
   * "ANTIGÜEDAD" —versalitas con `letter-spacing: .14em`— es una palabra sin
   * puntos de corte más ancha que su caja.
   */
  it('baja a dos columnas en las pantallas más angostas', () => {
    const { container } = render(<PropertyKeyStats stats={buildKeyStats({ rooms: 3 })} />)
    const grilla = container.firstElementChild!

    expect(grilla).toHaveClass('grid-cols-2')
    expect(grilla).toHaveClass('xs:grid-cols-3')
    // Escritorio intacto.
    expect(grilla).toHaveClass('sm:grid-cols-4')
    expect(grilla).toHaveClass('lg:grid-cols-7')
  })

  /**
   * `xs:` no es un breakpoint de fábrica: lo define `@theme` en globals.css. Si
   * alguien lo borra, esta grilla se queda en DOS columnas hasta los 640px —o
   * sea, en todos los teléfonos— y nadie se entera, porque la clase sin
   * definición simplemente no se emite.
   */
  it('el breakpoint `xs` que usa esta grilla existe en el sistema', () => {
    const globals = readFileSync(resolve(__dirname, '../../../app/globals.css'), 'utf8')
    expect(globals).toMatch(/--breakpoint-xs:\s*23\.4375rem/)
  })

  it('ningún dato desborda su tarjeta', () => {
    render(<PropertyKeyStats stats={buildKeyStats({ age: 15, expensas: 185000 })} />)
    const etiqueta = screen.getByText('Antigüedad')
    const valor = screen.getByText('15 años')

    expect(etiqueta).toHaveClass('truncate')
    expect(valor).toHaveClass('truncate')
    // Sin `min-w-0` en la tarjeta, el `truncate` del hijo no tiene efecto:
    // el ancho mínimo automático de un ítem de grilla es su contenido.
    expect(valor.parentElement).toHaveClass('min-w-0')
  })
})
