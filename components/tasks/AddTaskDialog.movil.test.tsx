// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddTaskDialog } from './AddTaskDialog'

/**
 * "Nueva tarea" es la acción principal de Pendientes, y el diálogo que la
 * auditoría midió más alto (~620px contra ~640px útiles de un iPhone con la
 * barra de Safari). El techo y el anclaje inferior los pone ahora el primitivo
 * `DialogContent`; lo que se fija acá es lo que es de ESTE formulario:
 *
 *  1. Fecha y hora son los controles NATIVOS del sistema. No hay que
 *     reemplazarlos por un calendario propio: en un teléfono la rueda de iOS y
 *     el selector de Android son mejores que cualquier cosa que escribamos.
 *  2. …pero llegan a 44px de alto en celular. El `Input` base mide 36px.
 *  3. Las etiquetas están ASOCIADAS: sin `htmlFor`/`id`, tocar la palabra
 *     "Fecha" no abre nada y el campo no tiene nombre para un lector.
 *  4. La fila de "Todo el día" —no solo la casilla— llega al mínimo táctil.
 */

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function abrir() {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true, status: 200, json: async () => ({ id: 'u1', role: 'asesor', data: [] }),
  })))
  render(<AddTaskDialog />)
  // El diálogo arranca cerrado: se abre desde su disparador.
  fireEvent.click(screen.getByRole('button', { name: /Agregar tarea/ }))
}

describe('AddTaskDialog — fecha y hora siguen siendo del sistema operativo', () => {
  it('usa input type=date y type=time, no un calendario propio', () => {
    abrir()
    expect(screen.getByLabelText('Fecha')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('Hora')).toHaveAttribute('type', 'time')
  })

  it('los dos llegan al mínimo táctil en celular', () => {
    abrir()
    expect(screen.getByLabelText('Fecha').className).toContain('max-md:h-11')
    expect(screen.getByLabelText('Hora').className).toContain('max-md:h-11')
  })
})

describe('AddTaskDialog — "Todo el día" se puede tocar con el pulgar', () => {
  it('la fila entera llega a 44px, no solo la casilla', () => {
    abrir()
    const casilla = screen.getByRole('checkbox')
    const fila = casilla.closest('label')!
    expect(fila.className).toContain('max-md:min-h-11')
  })
})
