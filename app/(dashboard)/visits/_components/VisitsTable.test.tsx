// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VisitsTable } from './VisitsTable'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

/**
 * La migración de Task 12 (`<table>` cruda → `DataTable`) le agregó a la fila
 * un `onRowClick` que no existía antes. El botón "Ver" de la columna de
 * acciones navega al MISMO destino que la fila — sin `e.stopPropagation()`
 * en su celda, tocarlo dispara las DOS navegaciones (la del `Link` y la de
 * la fila). `components/ui/DataTable.test.tsx` ya prueba este patrón para el
 * checkbox de selección ("tildar el checkbox de una fila no dispara
 * onRowClick"); acá se prueba lo mismo para la acción de fila propia de
 * Visitas, que es la que de verdad puede romperse en una migración de tabla
 * (el checkbox de `DataTable` ya viene con su propio `stopPropagation` de
 * fábrica — el de esta columna lo puso a mano `VisitsTable`).
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function visita(id: string): PropertyVisitWithRelations {
  return {
    id,
    scheduled_at: '2026-08-01T15:00:00Z',
    client_name: `Cliente ${id}`,
    status: 'scheduled',
    property: { id: 'p1', address: 'Agüero 950', neighborhood: 'Palermo', photos: [] },
    advisor: null,
  } as unknown as PropertyVisitWithRelations
}

beforeEach(() => {
  push.mockClear()
})

describe('VisitsTable', () => {
  it('clickear la fila navega a /visits/[id]', async () => {
    render(<VisitsTable visits={[visita('a')]} />)
    await userEvent.click(screen.getByText('Cliente a'))
    expect(push).toHaveBeenCalledWith('/visits/a')
  })

  it('clickear el botón "Ver" de la fila NO dispara también el click de la fila', async () => {
    render(<VisitsTable visits={[visita('a')]} />)
    await userEvent.click(screen.getByRole('link', { name: 'Ver' }))
    // Si la celda de acciones no frenara la propagación, este click también
    // dispararía el `onRowClick` de la fila (mismo destino, pero DOS
    // navegaciones — o una navegación distinta si algún día la fila apunta a
    // otro lado).
    expect(push).not.toHaveBeenCalled()
  })
})
