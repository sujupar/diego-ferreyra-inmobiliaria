// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PortalsClient } from './PortalsClient'

/**
 * D46 y D47 — Configuración → Portales.
 *
 * D46: `creds` arrancaba en `null` y solo se escribía DENTRO de `if (r.ok)`, y
 * el cuerpo era `if (!creds) return <spinner/>`. O sea: si la primera lectura
 * fallaba, la pantalla giraba PARA SIEMPRE, sin texto, sin error y sin salida.
 * El disparador más común no era ni siquiera un fallo: un coordinador que pega
 * la URL a mano recibe 500 de la API (el `requireRole` está adentro del try, y
 * su `NEXT_REDIRECT` termina como 500) y se queda mirando el spinner.
 *
 * D47: `toggle()` no miraba `res.ok` — el botón Activar/Desactivar mostraba su
 * spinner, lo apagaba, y nada cambiaba. Sin forma de distinguir "falló" de
 * "tocaste mal".
 */

type Respuesta = { ok: boolean; status: number; body: unknown }

let respuestas: Record<string, Respuesta>
let pedidos: string[]

const UN_PORTAL = {
  portal: 'mercadolibre',
  enabled: false,
  expires_at: null,
  updated_at: '2026-08-01T10:00:00Z',
}

function respuestaPara(metodo: string): Respuesta {
  return respuestas[metodo] ?? { ok: false, status: 500, body: { error: 'sin respuesta' } }
}

beforeEach(() => {
  pedidos = []
  respuestas = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string }) => {
      const metodo = init?.method ?? 'GET'
      pedidos.push(`${metodo} ${url}`)
      const r = respuestaPara(metodo)
      return { ok: r.ok, status: r.status, json: async () => r.body }
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Portales — la carga que falla no deja el spinner girando', () => {
  it('un 500 muestra el motivo y un Reintentar, sin spinner', async () => {
    respuestas = { GET: { ok: false, status: 500, body: { error: 'boom' } } }
    render(<PortalsClient />)

    expect(await screen.findByText('No se pudieron leer los portales.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
    // El spinner de carga tiene la clase `animate-spin`: no puede quedar ninguno
    // en pantalla cuando ya no hay ninguna carga en curso.
    expect(document.querySelectorAll('.animate-spin')).toHaveLength(0)
  })

  it('con la sesión vencida (401) el motivo manda a volver a entrar', async () => {
    respuestas = { GET: { ok: false, status: 401, body: { error: 'unauthorized' } } }
    render(<PortalsClient />)

    expect(await screen.findByText('Se venció la sesión. Volvé a entrar.')).toBeInTheDocument()
  })

  it('"Reintentar" vuelve a pedir y, si esta vez sale bien, aparecen los portales', async () => {
    respuestas = { GET: { ok: false, status: 500, body: {} } }
    render(<PortalsClient />)

    const reintentar = await screen.findByRole('button', { name: /Reintentar/ })
    respuestas = { GET: { ok: true, status: 200, body: { data: [UN_PORTAL] } } }
    fireEvent.click(reintentar)

    expect(await screen.findByText('MercadoLibre')).toBeInTheDocument()
    expect(screen.queryByText('No se pudieron leer los portales.')).not.toBeInTheDocument()
  })

  it('una lista vacía DE VERDAD se dice con palabras', async () => {
    respuestas = { GET: { ok: true, status: 200, body: { data: [] } } }
    render(<PortalsClient />)

    expect(await screen.findByText('No hay portales cargados todavía.')).toBeInTheDocument()
    expect(screen.queryByText('No se pudieron leer los portales.')).not.toBeInTheDocument()
  })
})

describe('Portales — Activar/Desactivar avisa cuando falla', () => {
  it('un PATCH rechazado muestra el motivo en la tarjeta del portal', async () => {
    respuestas = {
      GET: { ok: true, status: 200, body: { data: [UN_PORTAL] } },
      PATCH: { ok: false, status: 500, body: { error: 'La base no responde' } },
    }
    render(<PortalsClient />)

    fireEvent.click(await screen.findByRole('button', { name: 'Activar' }))

    expect(await screen.findByText('La base no responde')).toBeInTheDocument()
    // El badge sigue diciendo la verdad: no se activó nada.
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    // Y no se recargó tapando el error.
    expect(pedidos.filter(p => p.startsWith('GET '))).toHaveLength(1)
  })

  it('sin cuerpo útil igual explica qué acción falló', async () => {
    respuestas = {
      GET: { ok: true, status: 200, body: { data: [UN_PORTAL] } },
      PATCH: { ok: false, status: 500, body: null },
    }
    render(<PortalsClient />)

    fireEvent.click(await screen.findByRole('button', { name: 'Activar' }))
    expect(await screen.findByText('No se pudo activar el portal.')).toBeInTheDocument()
  })

  it('un PATCH exitoso recarga y no deja ningún error en pantalla', async () => {
    respuestas = {
      GET: { ok: true, status: 200, body: { data: [{ ...UN_PORTAL, enabled: true }] } },
      PATCH: { ok: true, status: 200, body: { ok: true } },
    }
    render(<PortalsClient />)

    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }))

    await waitFor(() => expect(pedidos.filter(p => p.startsWith('GET '))).toHaveLength(2))
    expect(screen.queryByText(/No se pudo/)).not.toBeInTheDocument()
  })
})
