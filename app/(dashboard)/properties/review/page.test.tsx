// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PropertyReviewPage from './page'

/**
 * La bandeja del abogado. Dos cosas que decía mal:
 *
 *  1. Ante CUALQUIER fallo de lectura (403 de rol, 401 de sesión vencida, 500)
 *     el `.catch` era mudo y la pantalla mostraba "Todo al día — No hay
 *     propiedades pendientes de revisión": se le decía al abogado que no tenía
 *     trabajo justo cuando el sistema no sabía si lo tenía.
 *  2. Contaba `documents`, la columna huérfana desde abril, así que TODAS las
 *     filas decían "0 docs" — incluida la que tenía la escritura cargada.
 */

let respuesta: { ok: boolean; status: number; body: unknown }
let fetchMock: ReturnType<typeof vi.fn>

function fila(extra: Record<string, unknown> = {}) {
  return {
    id: 'p1', address: 'Rivadavia 4820', neighborhood: 'Caballito', city: 'CABA',
    property_type: 'departamento', asking_price: 180000, currency: 'USD',
    documentos_cargados: 3, photos: ['a.jpg'], rooms: 3, covered_area: 78,
    created_at: '2026-08-01T00:00:00Z', legal_submitted_at: '2026-08-02T00:00:00Z',
    status: 'approved',
    ...extra,
  }
}

beforeEach(() => {
  respuesta = { ok: true, status: 200, body: { data: [fila()], total: 1 } }
  fetchMock = vi.fn(() => Promise.resolve({
    ok: respuesta.ok,
    status: respuesta.status,
    json: async () => respuesta.body,
  }))
  vi.stubGlobal('fetch', fetchMock)
})

describe('Revisión Legal — la bandeja del abogado', () => {
  it('muestra lo pendiente con la cantidad REAL de documentos cargados', async () => {
    render(<PropertyReviewPage />)
    await screen.findByText('Rivadavia 4820')
    expect(screen.getByText('3 docs')).toBeInTheDocument()
    expect(screen.getByText(/1 propiedad pendiente/i)).toBeInTheDocument()
  })

  it('vacía de verdad sí es "Todo al día"', async () => {
    respuesta = { ok: true, status: 200, body: { data: [], total: 0 } }
    render(<PropertyReviewPage />)
    await screen.findByText('Todo al día')
  })

  it('un fallo de lectura NO se muestra como "Todo al día"', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = { ok: false, status: 500, body: { error: 'boom' } }
      render(<PropertyReviewPage />)

      await screen.findByText('No se pudo cargar la bandeja')
      expect(screen.queryByText('Todo al día')).not.toBeInTheDocument()
      expect(screen.getByText(/no se pudo consultar la bandeja/i)).toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('un 403 (rol o sesión vencida) se explica distinto de una caída', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = { ok: false, status: 403, body: { error: 'forbidden' } }
      render(<PropertyReviewPage />)

      await screen.findByText(/no tenés permiso para ver esta bandeja/i)
      expect(screen.queryByText('Todo al día')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('el botón de reintentar vuelve a preguntar', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = { ok: false, status: 500, body: { error: 'boom' } }
      const user = userEvent.setup()
      render(<PropertyReviewPage />)
      await screen.findByText('No se pudo cargar la bandeja')

      respuesta = { ok: true, status: 200, body: { data: [fila()], total: 1 } }
      await user.click(screen.getByRole('button', { name: /reintentar/i }))

      await screen.findByText('Rivadavia 4820')
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    } finally {
      errores.mockRestore()
    }
  })
})
