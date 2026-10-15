// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccionVisitaDialog, type VisitaConHistorial } from './AccionVisitaDialog'

/**
 * Revisión final, grupo G: si la red se cae al guardar (fetch RECHAZA, no responde
 * un error), el diálogo tiene que decirlo. Antes `guardar()` tenía try/finally sin
 * catch: el botón volvía a "Guardar" y no aparecía ningún mensaje — el asesor no
 * sabía si se había guardado o no.
 */
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const VISITA: VisitaConHistorial = {
  id: '66666666-6666-4666-8666-666666666666', property_id: 'p1', advisor_id: null, created_by: null,
  lead_id: null, portal_inquiry_id: null, client_name: 'Cliente Uno', client_email: null, client_phone: null,
  scheduled_at: '2026-08-05T15:00:00Z', status: 'pending_confirmation', origin: null, origin_detail: null, notes: null,
  completion_notes: null, outcome_reason: null, advisor_interest: null, confirmed_at: null, outcome_at: null,
  reschedule_count: 0, created_at: '2026-08-01T12:00:00Z', updated_at: '2026-08-01T12:00:00Z', created_by_ai: false,
  propiedad: null, asesor: null, comprador: null, consulta: null,
  eventos: [], acciones: ['confirmar'],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
})

describe('AccionVisitaDialog — red caída al guardar', () => {
  it('muestra "No hay conexión. Probá de nuevo." y deja reintentar', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const usuario = userEvent.setup()
      const onHecho = vi.fn()
      render(<AccionVisitaDialog visita={VISITA} accion="confirmar" onClose={vi.fn()} onHecho={onHecho} onRecargar={vi.fn()} />)
      await usuario.click(screen.getByRole('button', { name: 'Guardar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión. Probá de nuevo.')
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
      expect(onHecho).not.toHaveBeenCalled()
      expect(errores).toHaveBeenCalled() // el fallo queda registrado, no se traga
    } finally { errores.mockRestore() }
  })
})
