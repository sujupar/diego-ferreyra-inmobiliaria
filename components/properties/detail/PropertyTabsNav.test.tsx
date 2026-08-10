// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PropertyTabsNav } from './PropertyTabsNav'

describe('PropertyTabsNav', () => {
  it('dibuja solo las pestañas recibidas, con la activa marcada', () => {
    render(<PropertyTabsNav tabs={['propiedad', 'documentacion', 'historial']} active="documentacion" onChange={() => {}} />)

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'Documentación' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Propiedad' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('tab', { name: 'Multimedia' })).not.toBeInTheDocument()
  })

  it('avisa qué pestaña se eligió', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<PropertyTabsNav tabs={['propiedad', 'multimedia']} active="propiedad" onChange={onChange} />)

    await user.click(screen.getByRole('tab', { name: 'Multimedia' }))
    expect(onChange).toHaveBeenCalledWith('multimedia')
  })

  it('es una tablist accesible', () => {
    render(<PropertyTabsNav tabs={['propiedad', 'multimedia']} active="propiedad" onChange={() => {}} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  /**
   * happy-dom no calcula layout, así que la oclusión real no se puede observar
   * acá: lo único verificable es el CONTRATO con el marco del dashboard.
   *
   * Ese contrato CAMBIÓ con la cadena de alto del sistema móvil. Antes las dos
   * barras se pegaban al mismo scroller (el documento) y esta necesitaba
   * `top-14` para no quedar detrás de los 56px opacos del Topbar. Ahora el
   * scroller es `#contenido` y el Topbar quedó afuera, así que el offset
   * correcto es `top-0`: con `top-14` quedarían 56px de aire muerto arriba.
   *
   * Las dos mitades del contrato se fijan JUNTAS —el offset de acá y el hecho de
   * que el layout saque al Topbar del scroller— porque una sin la otra es un bug
   * visible.
   */
  it('se pega al techo del área de contenido, que es la que scrollea', () => {
    render(<PropertyTabsNav tabs={['propiedad', 'multimedia']} active="propiedad" onChange={() => {}} />)
    const barra = screen.getByTestId('barra-secciones')

    expect(barra).toHaveClass('sticky')
    expect(barra).toHaveClass('top-0')
    expect(barra).not.toHaveClass('top-14')
    // Por debajo del z-40 del Topbar: si alguna vez volvieran a compartir
    // scroller, la que se tapa al llegar arriba sigue siendo esta.
    expect(barra).toHaveClass('z-30')
  })

  /**
   * Las cinco pestañas no entran en un teléfono (~553px contra 358 útiles), así
   * que la barra se desliza. Lo que faltaba era AVISARLO: en iOS la barra de
   * scroll es invisible hasta que se la toca, y "Difusión" e "Historial"
   * arrancan enteras fuera del borde derecho.
   */
  it('avisa que hay más pestañas a la derecha, no solo deja deslizar', () => {
    render(<PropertyTabsNav tabs={['propiedad', 'multimedia', 'documentacion', 'difusion', 'historial']} active="propiedad" onChange={() => {}} />)
    const lista = screen.getByRole('tablist')

    // `scroll-x-fade` = deslizamiento + las dos sombras que aparecen al correrse
    // los degradados. `overflow-x-auto` a secas era el bug.
    expect(lista).toHaveClass('scroll-x-fade')
  })

  it('los degradados valen el color de la franja, no el de una tarjeta', () => {
    // Esos degradados TAPAN las sombras mientras no hay nada que deslizar. Con
    // el `--card` que la utilidad usa por omisión no tapaban: dibujaban dos
    // parches de 24px en los extremos, a TODOS los anchos —escritorio
    // incluido— y bien visibles en tema oscuro, donde `--card` (0.18) y
    // `--background` (0.13) están lejos. La franja es `bg-background/85`.
    render(<PropertyTabsNav tabs={['propiedad', 'multimedia']} active="propiedad" onChange={() => {}} />)
    expect(screen.getByRole('tablist')).toHaveClass('[--scroll-fade-color:var(--background)]')
  })

  it('cada pestaña llega al mínimo táctil en el teléfono', () => {
    render(<PropertyTabsNav tabs={['propiedad', 'multimedia']} active="propiedad" onChange={() => {}} />)
    for (const pestana of screen.getAllByRole('tab')) {
      expect(pestana.className).toContain('max-md:min-h-11')
    }
  })

  it('el que scrollea es `#contenido` y el Topbar queda afuera (si esto cambia, `top-0` vuelve a estar mal)', () => {
    const layout = readFileSync(resolve(__dirname, '../../../app/(dashboard)/layout.tsx'), 'utf8')

    const contenido = layout.match(/id="contenido"[^>]*className="([^"]+)"/)
    expect(contenido, 'no se encontró el contenedor #contenido del layout').toBeTruthy()
    // `scroll-pane` (app/globals.css) es lo que le pone `overflow-y: auto`.
    expect(contenido![1]).toContain('scroll-pane')
    // Y el Topbar se renderiza FUERA de ese div, como hermano anterior.
    expect(layout.indexOf('<TopbarForRole')).toBeLessThan(layout.indexOf('id="contenido"'))
  })
})
