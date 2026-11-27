// @vitest-environment happy-dom
// crm-cartera-por-rol, tarea 6.6: el "‹ Volver" arriba de la cabecera de la ficha.
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { FichaCabecera } from './FichaCabecera'

const cabecera = (volver: { href: string; texto: string } | null) =>
  render(<FichaCabecera estado="cargando" ficha={null} onReintentar={() => {}} pestanas={null} volver={volver} />)

describe('FichaCabecera — Volver', () => {
  it('con la vuelta del CRM: "Volver al CRM" con su flecha, a la lista con sus filtros', () => {
    cabecera({ href: '/crm?etapa=seguimiento&q=Pinto', texto: 'Volver al CRM' })
    const enlace = screen.getByRole('link', { name: 'Volver al CRM' })
    expect(enlace).toHaveAttribute('href', '/crm?etapa=seguimiento&q=Pinto')
    expect(enlace.querySelector('svg')).not.toBeNull()
    expect(enlace.className).toContain('min-h-11')
  })

  it('sin vuelta, sin enlace', () => {
    cabecera(null)
    expect(screen.queryByRole('link', { name: /Volver/ })).toBeNull()
  })
})
