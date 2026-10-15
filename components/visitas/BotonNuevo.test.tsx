// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('./agendar/AgendarVisitaDialog', () => ({ AgendarVisitaDialog: ({ open }: { open: boolean }) => open ? <div>ventana abierta</div> : null }))

import { BotonNuevo } from './BotonNuevo'

// userEvent SIN temporizadores simulados: con fake timers cuelga cualquier clic
// (CLAUDE.md § "Correr las pruebas en esta Mac").
describe('BotonNuevo', () => {
  it('el abogado no lo ve', () => {
    const { container } = render(<BotonNuevo role="abogado" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('un asesor ve "Agendar visita" y "Nueva tasación"', async () => {
    const user = userEvent.setup()
    render(<BotonNuevo role="asesor" />)
    await user.click(screen.getByRole('button', { name: /Nuevo/ }))
    expect(await screen.findByRole('menuitem', { name: 'Agendar visita' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Nueva tasación' })).toBeInTheDocument()
  })
  it('elegir "Agendar visita" abre la ventana', async () => {
    const user = userEvent.setup()
    render(<BotonNuevo role="asesor" />)
    await user.click(screen.getByRole('button', { name: /Nuevo/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Agendar visita' }))
    expect(await screen.findByText('ventana abierta')).toBeInTheDocument()
  })
  it('un coordinador no ve "Nueva tasación" (no la tiene en el menú)', async () => {
    const user = userEvent.setup()
    render(<BotonNuevo role="coordinador" />)
    await user.click(screen.getByRole('button', { name: /Nuevo/ }))
    expect(await screen.findByRole('menuitem', { name: 'Agendar visita' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Nueva tasación' })).not.toBeInTheDocument()
  })
})
