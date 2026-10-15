// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VisitsTable } from './VisitsTable'
import { visitaDePrueba } from '@/test/visitas/visita-de-prueba'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const visita = (id: string) => visitaDePrueba({ id, client_name: `Cliente ${id}`, scheduled_at: '2026-08-01T15:00:00Z' })

beforeEach(() => { push.mockClear() })

describe('VisitsTable', () => {
  it('clickear la fila navega a /visits/[id]', async () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor />)
    await userEvent.click(screen.getByText('Cliente a'))
    expect(push).toHaveBeenCalledWith('/visits/a')
  })
  it('el botón "Ver" no dispara también el click de la fila', async () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor />)
    await userEvent.click(screen.getByRole('link', { name: 'Ver' }))
    expect(push).not.toHaveBeenCalled()
  })
  it('la fecha va en hora ARGENTINA, corta, con año y reloj de 24 h', () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor />)
    expect(document.querySelector('[data-celda="titulo"]')?.textContent).toBe('01/08/26, 12:00')
  })
  it('en la ficha del teléfono: fecha identidad, estado insignia; asesor y "Ver" ocultos', () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor />)
    // DataTable suma al final celdas sin datos (chevron / salto de renglón): se miran las 7 de las columnas.
    const roles = Array.from(document.querySelectorAll('tbody tr:first-child td')).map(td => td.getAttribute('data-celda'))
    expect(roles.slice(0, 7)).toEqual(['titulo', 'dato', 'dato', 'dato', 'oculto', 'insignia', 'oculto'])
  })
  it('sin la columna de asesor para quien ve solo lo suyo', () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor={false} />)
    expect(screen.queryByRole('columnheader', { name: 'Asesor' })).not.toBeInTheDocument()
  })
})
