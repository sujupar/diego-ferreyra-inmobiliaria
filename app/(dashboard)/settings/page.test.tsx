// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import SettingsPage from './page'

/**
 * A1 — la sesión que vence con la pantalla de Configuración abierta.
 *
 * Antes del cambio de 307 a 401, una ruta de API sin sesión redirigía a `/login`,
 * `fetch` seguía el redirect, aterrizaba en HTML y `r.json()` TIRABA: el `.then()`
 * no corría, `slots` se quedaba en su `useState([])` y la pantalla se veía vacía
 * pero viva.
 *
 * Ahora el middleware corta con 401 en JSON, así que `r.json()` RESUELVE con
 * `{error:'unauthorized'}`. El `.then()` corre, y como `setLoading(false)` está en
 * ese mismo `.then()`, el spinner deja de tapar el render. Sin chequear `r.ok` el
 * componente hacía `setSlots(undefined)` y el `slots.map(...)` del cuerpo tiraba
 * "Cannot read properties of undefined" — pantalla de error de React, la de
 * Configuración entera caída.
 *
 * El caso NO es exótico: la sesión vence sola, y desde que el middleware llama a
 * `getUser()` en cada request a `/api/*`, cualquier hipo de Supabase Auth también
 * lo dispara.
 */

type Respuesta = { ok: boolean; status: number; body: unknown }

let respuestas: Record<string, Respuesta>
let pedidos: string[]

const NO_AUTORIZADO: Respuesta = { ok: false, status: 401, body: { error: 'unauthorized' } }

function respuestaPara(url: string): Respuesta {
  for (const [prefijo, r] of Object.entries(respuestas)) {
    if (url.startsWith(prefijo)) return r
  }
  return NO_AUTORIZADO
}

beforeEach(() => {
  pedidos = []
  respuestas = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      pedidos.push(url)
      const r = respuestaPara(url)
      return { ok: r.ok, status: r.status, json: async () => r.body }
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettingsPage — la sesión vencida no puede tumbar la pantalla', () => {
  it('con 401 en TODAS las rutas la pantalla sigue en pie y sin tarjetas de imagen', async () => {
    // Todas las rutas devuelven el 401 JSON del middleware (el default de
    // `respuestaPara`), incluida `/api/settings/market-images`.
    render(<SettingsPage />)

    // Si el `.then()` guardara `undefined` en `slots`, el `slots.map(...)` del
    // cuerpo tiraría durante este render y no habría nada que encontrar.
    expect(await screen.findByText('Datos de Mercado Mensuales')).toBeInTheDocument()
    expect(screen.getByText('Configuracion')).toBeInTheDocument()
    expect(
      screen.getByText(/Override manual \(emergencia\)/),
    ).toBeInTheDocument()

    // La pantalla quedó SIN slots, que es lo correcto: no hay sesión para leerlos.
    expect(screen.queryByText('Stock de departamentos')).not.toBeInTheDocument()
    expect(pedidos.some(u => u.startsWith('/api/settings/market-images'))).toBe(true)
  })

  it('un 200 cuyo cuerpo no trae `slots` tampoco rompe (el dato va blindado, no solo el status)', async () => {
    respuestas = {
      '/api/settings/market-images': { ok: true, status: 200, body: { ok: true } },
    }
    render(<SettingsPage />)

    expect(await screen.findByText('Datos de Mercado Mensuales')).toBeInTheDocument()
    expect(screen.queryByText('Stock de departamentos')).not.toBeInTheDocument()
  })

  it('con sesión válida sí pinta los slots que devuelve la API', async () => {
    respuestas = {
      '/api/settings/market-images': {
        ok: true,
        status: 200,
        body: {
          slots: [
            {
              id: 'stock',
              label: 'Stock de departamentos',
              description: 'Página 3 del informe',
              filename: 'stock-departamentos.png',
              exists: true,
              currentPath: '/pdf-assets/monthly-data/stock-departamentos.png',
            },
          ],
        },
      },
    }
    render(<SettingsPage />)

    expect(await screen.findByText('Stock de departamentos')).toBeInTheDocument()
  })
})
