// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
   * acá: lo único verificable es el CONTRATO con la barra superior del
   * dashboard, que es `sticky top-0 z-40 h-14`, opaca y en el MISMO scroller.
   * Con `top-0` esta barra quedaba 100% detrás de esos 56px — invisible y sin
   * recibir clics. El test fija el offset y que el z-index no compita.
   */
  it('se pega DEBAJO de la barra superior, no atrás de ella', () => {
    render(<PropertyTabsNav tabs={['propiedad', 'multimedia']} active="propiedad" onChange={() => {}} />)
    const barra = screen.getByTestId('barra-secciones')

    expect(barra).toHaveClass('sticky')
    // 56px = h-14 del Topbar.
    expect(barra).toHaveClass('top-14')
    expect(barra).not.toHaveClass('top-0')
    // Por debajo del z-40 del Topbar: la que se tapa al llegar arriba es esta.
    expect(barra).toHaveClass('z-30')
  })
})
