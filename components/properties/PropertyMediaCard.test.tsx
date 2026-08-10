// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { PropertyMediaCard } from './PropertyMediaCard'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() }),
}))

function montar() {
  return render(
    <PropertyMediaCard
      propertyId="p1"
      photos={['https://x/a.jpg']}
      plans={[]}
      videoFileUrl={null}
      tourUrl={null}
      videoRecorridoUrl={null}
      onChanged={() => {}}
    />
  )
}

describe('PropertyMediaCard — las cinco pestañas en un teléfono', () => {
  /**
   * ~487px de ancho mínimo (los rótulos son `whitespace-nowrap`) contra ~334px
   * adentro de la tarjeta: sin `overflow`, "Video recorrido" quedaba fuera del
   * borde y no había ningún gesto que la alcanzara.
   */
  it('la barra se desliza en vez de recortar la última pestaña', () => {
    montar()
    const barra = screen.getByTestId('pestanas-multimedia')

    expect(barra.className).toContain('max-md:overflow-x-auto')
    // Sin `h-auto` el carril sigue clavado en 36px y los 44 de las pestañas se
    // desbordan hacia afuera.
    expect(barra.className).toContain('max-md:h-auto')
    expect(barra.className).toContain('max-md:justify-start')
  })

  it('cada pestaña llega al mínimo táctil y no se comprime', () => {
    montar()
    const pestanas = screen.getAllByRole('tab')
    expect(pestanas).toHaveLength(5)
    for (const p of pestanas) {
      expect(p.className).toContain('max-md:min-h-11')
      // Sin `shrink-0` el flex las achica hasta partir el rótulo en vez de
      // dejar que la barra se deslice.
      expect(p.className).toContain('max-md:shrink-0')
    }
  })

  it('la pestaña de "Video recorrido" existe y se puede alcanzar', () => {
    montar()
    expect(screen.getByRole('tab', { name: /video recorrido/i })).toBeInTheDocument()
  })
})
