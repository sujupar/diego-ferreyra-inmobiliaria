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

  /**
   * Fase 2 — qué muestra la agenda cuando se apila como ficha en el teléfono.
   *
   * Visitas era la única lista del sistema SIN alternativa a la tabla: seis
   * columnas, ~870px, y el asesor entre visita y visita veía la columna de la
   * fecha y nada más. El reparto de abajo es una decisión de negocio (cuándo es
   * la identidad, adónde voy y con quién son los datos, el asesor y el botón
   * "Ver" sobran) y el CSS de la ficha la lee de estos atributos.
   */
  describe('la ficha del teléfono', () => {
    function rolesPorColumna(): Record<string, string | null> {
      const celdas = Array.from(document.querySelectorAll('tbody tr:first-child td'))
      return Object.fromEntries(
        celdas.map((td, i) => [i === 0 ? 'fecha' : ['propiedad', 'cliente', 'asesor', 'estado', 'acciones', 'salto'][i - 1], td.getAttribute('data-celda')]),
      )
    }

    it('la fecha es la identidad, el estado la insignia, propiedad y cliente los datos', () => {
      render(<VisitsTable visits={[visita('a')]} />)
      expect(rolesPorColumna()).toMatchObject({
        fecha: 'titulo',
        propiedad: 'dato',
        cliente: 'dato',
        estado: 'insignia',
      })
    })

    it('esconde el asesor y el botón "Ver": la ficha entera ya navega al mismo lado', () => {
      render(<VisitsTable visits={[visita('a')]} />)
      expect(rolesPorColumna()).toMatchObject({ asesor: 'oculto', acciones: 'oculto' })
    })

    it('la fecha va corta y alineada: sin segundos, con reloj de 24 y dos dígitos siempre', () => {
      // `toLocaleString('es-AR')` pelado imprime "1/8/2026, 12:00:00". En la
      // ficha esa fecha es el TÍTULO: cada carácter de más le come ancho a lo
      // que sigue. Las tres trampas que este test cierra:
      //   · los segundos, que no le importan a nadie;
      //   · el "a. m." que aparece si no se fija el reloj de 24 horas;
      //   · el día de un solo dígito ("1/8"), que descuadra la columna.
      render(<VisitsTable visits={[visita('a')]} />)
      const titulo = document.querySelector('[data-celda="titulo"]')!.textContent!
      expect(titulo).not.toMatch(/:\d{2}:\d{2}/)
      expect(titulo).not.toMatch(/[ap]\.\s?m\./i)
      expect(titulo).toMatch(/^\d{2}\/\d{2}\/\d{2}, \d{2}:\d{2}$/)
    })
  })
})
