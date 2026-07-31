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
})
