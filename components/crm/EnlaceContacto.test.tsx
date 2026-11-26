// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EnlaceContacto } from './EnlaceContacto'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))

describe('EnlaceContacto (11.1)', () => {
  it('con contacto y un rol que puede abrir fichas, enlaza a /contacts/<id>', () => {
    render(<EnlaceContacto contactoId="c-1" rol="asesor">Ana</EnlaceContacto>)
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/contacts/c-1')
  })
  it.each([
    ['sin contacto', null, 'coordinador'],
    ['para el abogado', 'c-1', 'abogado'],
    ['sin rol conocido todavía', 'c-1', null],
  ])('%s queda como texto', (_caso, contactoId, rol) => {
    render(
      <EnlaceContacto contactoId={contactoId} rol={rol}>
        Ana
      </EnlaceContacto>,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })
  it('con detenerClic, el clic no sube a la fila', () => {
    const fila = vi.fn()
    render(
      <div onClick={fila}>
        <EnlaceContacto contactoId="c-1" rol="admin" detenerClic>
          Ana
        </EnlaceContacto>
      </div>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'Ana' }))
    expect(fila).not.toHaveBeenCalled()
  })
})
