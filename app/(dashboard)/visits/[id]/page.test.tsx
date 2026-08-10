// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import VisitDetailPage from './page'

/**
 * D30 — la ficha de una visita tenía DOS estados donde hacen falta cuatro. El
 * render era `if (!visit) return "Cargando…"`, y esa rama era terminal: una
 * visita borrada (404), un id que no es UUID (500, Postgres 22P02), una sesión
 * caída o un 504 con HTML del gateway dejaban la palabra "Cargando…" sobre
 * fondo vacío para siempre, sin mensaje, sin reintento y —peor— sin el link
 * "Volver a visitas", que vivía DEBAJO del early-return.
 *
 * `load()` tampoco miraba `res.ok`: el body de error es JSON válido, así que
 * `json.data` era `undefined` y `setVisit(undefined)` volvía al mismo lugar.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'v1' }),
}))

// La ficha monta `CompleteVisitDialog`, que importa `sonner` en el módulo.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/** Respuesta de /api/visits/v1 que devuelve cada test. */
let respuesta: () => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

function visitaOk() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        id: 'v1',
        scheduled_at: '2026-08-05T15:00:00Z',
        status: 'scheduled',
        client_name: 'Cliente Uno',
        client_email: 'cliente@example.com',
        client_phone: '11-1111-1111',
        property: { id: 'p1', address: 'Calle Falsa 123', neighborhood: 'Palermo', photos: [] },
        advisor: null,
      },
    }),
  }
}

beforeEach(() => {
  respuesta = async () => visitaOk()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    // El cuestionario matchea también `/api/visits/` — va primero.
    if (url.includes('/questionnaire')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) })
    }
    if (url.startsWith('/api/visits/')) return respuesta()
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

describe('VisitDetailPage — la pantalla no se queda en "Cargando…" ante un fallo', () => {
  it('el camino feliz sigue funcionando', async () => {
    render(<VisitDetailPage />)
    await screen.findByText('Calle Falsa 123')
    expect(screen.getByText('Cliente Uno')).toBeInTheDocument()
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  })

  it('un 404 dice que no se encontró la visita, con salida a /visits', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) })
      render(<VisitDetailPage />)

      await screen.findByText('No encontramos esta visita')
      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
      // El link de vuelta ahora se dibuja también en este camino.
      expect(screen.getByText('← Volver a visitas')).toBeInTheDocument()
      expect(screen.getByText('Ver todas las visitas')).toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('un 500 dice que no se pudo cargar, y "Reintentar" la trae', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')

      respuesta = async () => visitaOk()
      fireEvent.click(screen.getByText('Reintentar'))
      await screen.findByText('Calle Falsa 123')
      expect(screen.queryByText('No pudimos cargar la visita')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('un cuerpo que no es JSON (el 504 con HTML del gateway) tampoco la cuelga', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token \'<\'') },
      })
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('un 200 sin la visita adentro es un fallo, no una pantalla vacía', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({ ok: true, status: 200, json: async () => ({ data: null }) })
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
    } finally {
      errores.mockRestore()
    }
  })

  it('si falla el cuestionario, la ficha se muestra igual', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.stubGlobal('fetch', vi.fn((url: string) => {
        if (url.includes('/questionnaire')) return Promise.reject(new Error('caído'))
        if (url.startsWith('/api/visits/')) return respuesta()
        return Promise.reject(new Error(`fetch inesperado: ${url}`))
      }))
      render(<VisitDetailPage />)
      await screen.findByText('Calle Falsa 123')
      await waitFor(() => expect(errores).toHaveBeenCalled())
      expect(screen.queryByText('No pudimos cargar la visita')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })
})
