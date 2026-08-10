// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

/**
 * Las claves de `respuestas` pueden ser un prefijo de URL (`'/api/x'`) o un
 * prefijo con método (`'PUT /api/x'`). El método gana, así que un mismo camino
 * puede responder distinto al leer y al escribir.
 */
function respuestaPara(url: string, metodo: string): Respuesta {
  for (const [clave, r] of Object.entries(respuestas)) {
    if (clave.startsWith(`${metodo} `) && url.startsWith(clave.slice(metodo.length + 1))) return r
  }
  for (const [clave, r] of Object.entries(respuestas)) {
    if (!clave.includes(' ') && url.startsWith(clave)) return r
  }
  return NO_AUTORIZADO
}

beforeEach(() => {
  pedidos = []
  respuestas = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string }) => {
      const metodo = init?.method ?? 'GET'
      pedidos.push(`${metodo} ${url}`)
      const r = respuestaPara(url, metodo)
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
    expect(pedidos.some(u => u.includes('/api/settings/market-images'))).toBe(true)
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

/**
 * D20 — el defecto de pérdida de datos.
 *
 * El PUT de `/api/settings/report-recipients` REEMPLAZA la lista entera. Si la
 * lectura falló y la pantalla igual muestra el formulario con la lista vacía,
 * un "Guardar" bienintencionado borra los destinatarios reales. Por eso la
 * pantalla tiene que tener TRES estados distintos y, en el de error, no debe
 * existir el botón que sobrescribe.
 */
describe('SettingsPage — destinatarios de reportes: no se pudo leer ≠ no hay ninguno', () => {
  it('si la lectura falla NO hay formulario ni botón de guardar, y sí motivo + Reintentar', async () => {
    respuestas = {
      '/api/settings/market-images': { ok: true, status: 200, body: { slots: [] } },
      '/api/settings/report-recipients': { ok: false, status: 500, body: { error: 'boom' } },
    }
    render(<SettingsPage />)

    expect(await screen.findByText(/No se pudo leer la configuración de reportes/)).toBeInTheDocument()
    expect(
      screen.getByText(/no es que no haya ninguno configurado/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument()

    // Lo que evita el borrado: sin botón, no hay PUT posible.
    expect(screen.queryByRole('button', { name: /Guardar configuracion/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Todavía no hay destinatarios configurados/)).not.toBeInTheDocument()
  })

  it('con la sesión vencida (401) el motivo dice que hay que volver a entrar', async () => {
    respuestas = {
      '/api/settings/market-images': { ok: true, status: 200, body: { slots: [] } },
      '/api/settings/report-recipients': { ok: false, status: 401, body: { error: 'unauthorized' } },
    }
    render(<SettingsPage />)

    expect(await screen.findByText(/Se venció la sesión/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Guardar configuracion/ })).not.toBeInTheDocument()
  })

  it('"Reintentar" vuelve a pedir y, si esta vez sale bien, aparece el formulario', async () => {
    respuestas = {
      '/api/settings/market-images': { ok: true, status: 200, body: { slots: [] } },
      '/api/settings/report-recipients': { ok: false, status: 500, body: {} },
    }
    render(<SettingsPage />)
    const reintentar = await screen.findByRole('button', { name: /Reintentar/ })

    // La próxima lectura sí anda.
    respuestas['/api/settings/report-recipients'] = {
      ok: true,
      status: 200,
      body: { recipients: ['diego@inmodf.com.ar'], daily_enabled: true, weekly_enabled: true, monthly_enabled: true },
    }
    fireEvent.click(reintentar)

    expect(await screen.findByText('diego@inmodf.com.ar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar configuracion/ })).toBeInTheDocument()
  })

  it('el vacío DE VERDAD se dice con palabras, y ahí sí se puede guardar', async () => {
    respuestas = {
      '/api/settings/market-images': { ok: true, status: 200, body: { slots: [] } },
      '/api/settings/report-recipients': {
        ok: true,
        status: 200,
        body: { recipients: [], daily_enabled: true, weekly_enabled: true, monthly_enabled: true },
      },
    }
    render(<SettingsPage />)

    expect(await screen.findByText(/Todavía no hay destinatarios configurados/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar configuracion/ })).toBeInTheDocument()
    expect(screen.queryByText(/No se pudo leer la configuración de reportes/)).not.toBeInTheDocument()
  })

  it('un guardado rechazado se dice; uno exitoso se confirma', async () => {
    respuestas = {
      '/api/settings/market-images': { ok: true, status: 200, body: { slots: [] } },
      '/api/settings/report-recipients': {
        ok: true,
        status: 200,
        body: { recipients: ['diego@inmodf.com.ar'], daily_enabled: true, weekly_enabled: true, monthly_enabled: true },
      },
      'PUT /api/settings/report-recipients': { ok: false, status: 500, body: { error: 'La base no responde' } },
    }
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Guardar configuracion/ }))
    expect(await screen.findByText('La base no responde')).toBeInTheDocument()
    expect(screen.queryByText(/Configuración guardada/)).not.toBeInTheDocument()

    // Ahora el PUT anda: el mismo botón tiene que confirmar.
    respuestas['PUT /api/settings/report-recipients'] = { ok: true, status: 200, body: {} }
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuracion/ }))
    expect(await screen.findByText(/Configuración guardada/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('La base no responde')).not.toBeInTheDocument())
  })
})
