// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NotificationsSettingsPage from './page'

/**
 * D45 y D48 — la pantalla de Notificaciones no puede afirmar cosas que no sabe.
 *
 * D48: `loadLogs()` no miraba `res.ok`, así que un 401/500 dejaba `json.data` en
 * undefined → `setLogs([])` → la tarjeta decía "No hay registros aún." El admin
 * abre esta pantalla justamente para saber si un email salió: leer "no pasó
 * nada" cuando lo que pasó es "no pude preguntar" lo manda a buscar un bug que
 * no existe, o a reenviar algo que ya se había enviado.
 *
 * D45: `save()` tampoco miraba `res.ok` y llamaba a `loadSettings()` igual, que
 * pisa el email y los checkboxes con lo que hay en la base. Ante el 400 "Email
 * inválido" (que `diego@inmodf` dispara: pasa la validación del navegador pero
 * no la del servidor) el usuario veía desaparecer lo que escribió, sin mensaje.
 */

type Respuesta = { ok: boolean; status: number; body: unknown }

let respuestas: Record<string, Respuesta>
let pedidos: string[]

const CONFIG_OK: Respuesta = {
  ok: true,
  status: 200,
  body: {
    data: {
      id: 'default',
      test_mode_enabled: false,
      test_recipient_email: 'contacto@inmodf.com.ar',
      alert_admins_on_lawyer_failure: true,
      updated_at: '2026-08-01T00:00:00Z',
    },
  },
}

function respuestaPara(url: string, metodo: string): Respuesta {
  for (const [clave, r] of Object.entries(respuestas)) {
    if (clave.startsWith(`${metodo} `) && url.startsWith(clave.slice(metodo.length + 1))) return r
  }
  for (const [clave, r] of Object.entries(respuestas)) {
    if (!clave.includes(' ') && url.startsWith(clave)) return r
  }
  return { ok: false, status: 401, body: { error: 'unauthorized' } }
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

describe('Notificaciones — el historial que no se pudo leer no se muestra como vacío', () => {
  it('un 500 del historial dice que no se pudo leer, NO "No hay registros aún"', async () => {
    respuestas = {
      '/api/settings/notifications/history': { ok: false, status: 500, body: { error: 'boom' } },
      '/api/settings/notifications': CONFIG_OK,
    }
    render(<NotificationsSettingsPage />)

    expect(await screen.findByText('No se pudo leer el historial.')).toBeInTheDocument()
    expect(screen.getByText(/No se sabe si hubo envíos o no/)).toBeInTheDocument()
    expect(screen.queryByText('No hay registros aún.')).not.toBeInTheDocument()
  })

  it('con la sesión vencida (401) el motivo manda a volver a entrar', async () => {
    respuestas = {
      '/api/settings/notifications/history': { ok: false, status: 401, body: { error: 'unauthorized' } },
      '/api/settings/notifications': CONFIG_OK,
    }
    render(<NotificationsSettingsPage />)

    expect(await screen.findByText('Se venció la sesión. Volvé a entrar.')).toBeInTheDocument()
    expect(screen.queryByText('No hay registros aún.')).not.toBeInTheDocument()
  })

  it('el historial vacío DE VERDAD (200 con lista vacía) sí dice "No hay registros aún"', async () => {
    respuestas = {
      '/api/settings/notifications/history': { ok: true, status: 200, body: { data: [], total: 0 } },
      '/api/settings/notifications': CONFIG_OK,
    }
    render(<NotificationsSettingsPage />)

    expect(await screen.findByText('No hay registros aún.')).toBeInTheDocument()
    expect(screen.queryByText('No se pudo leer el historial.')).not.toBeInTheDocument()
  })

  it('un historial con filas se pinta como siempre', async () => {
    respuestas = {
      '/api/settings/notifications/history': {
        ok: true,
        status: 200,
        body: {
          data: [{
            id: 'l1',
            notification_type: 'deal_created_advisor',
            recipient_email: 'asesor@inmodf.com.ar',
            original_recipient_email: null,
            subject: 'Tasación agendada: Juan',
            entity_type: 'deal',
            entity_id: 'd1',
            status: 'sent',
            error_message: null,
            test_mode: false,
            sent_at: '2026-08-01T12:00:00Z',
          }],
          total: 1,
        },
      },
      '/api/settings/notifications': CONFIG_OK,
    }
    render(<NotificationsSettingsPage />)

    expect(await screen.findByText('Tasación agendada: Juan')).toBeInTheDocument()
    expect(screen.queryByText('No hay registros aún.')).not.toBeInTheDocument()
  })
})

describe('Notificaciones — "Guardar" rechazado se explica y no borra lo tipeado', () => {
  it('el 400 "Email inválido" se muestra y el email escrito SIGUE en el campo', async () => {
    respuestas = {
      '/api/settings/notifications/history': { ok: true, status: 200, body: { data: [], total: 0 } },
      '/api/settings/notifications': CONFIG_OK,
      'PATCH /api/settings/notifications': { ok: false, status: 400, body: { error: 'Email inválido' } },
    }
    render(<NotificationsSettingsPage />)

    const campo = await screen.findByLabelText('Email de prueba')
    fireEvent.change(campo, { target: { value: 'diego@inmodf' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Email inválido')).toBeInTheDocument()
    // Lo tipeado sobrevive: sin esto, `loadSettings()` lo pisaba con la base.
    expect(campo).toHaveValue('diego@inmodf')
    expect(screen.queryByText(/Configuración guardada/)).not.toBeInTheDocument()
    // Y no se recargó la configuración tras el rechazo.
    expect(pedidos.filter(p => p === 'GET /api/settings/notifications')).toHaveLength(1)
  })

  it('un guardado exitoso confirma y sí recarga', async () => {
    respuestas = {
      '/api/settings/notifications/history': { ok: true, status: 200, body: { data: [], total: 0 } },
      '/api/settings/notifications': CONFIG_OK,
      'PATCH /api/settings/notifications': { ok: true, status: 200, body: CONFIG_OK.body },
    }
    render(<NotificationsSettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(/Configuración guardada/)).toBeInTheDocument()
    await waitFor(() =>
      expect(pedidos.filter(p => p === 'GET /api/settings/notifications')).toHaveLength(2),
    )
  })
})

describe('Notificaciones — la configuración que no se pudo leer tampoco se disfraza', () => {
  it('un 500 en la configuración muestra el motivo y un Reintentar, no un formulario en blanco', async () => {
    respuestas = {
      '/api/settings/notifications/history': { ok: true, status: 200, body: { data: [], total: 0 } },
      '/api/settings/notifications': { ok: false, status: 500, body: { error: 'boom' } },
    }
    render(<NotificationsSettingsPage />)

    expect(await screen.findByText('No se pudo leer la configuración.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email de prueba')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Reintentar/ }).length).toBeGreaterThan(0)
  })
})

describe('Notificaciones — el error de la API se muestra, pero la tubería interna no', () => {
  it('un 500 con el NEXT_REDIRECT crudo se traduce a un motivo entendible', async () => {
    respuestas = {
      '/api/settings/notifications/history': { ok: true, status: 200, body: { data: [], total: 0 } },
      '/api/settings/notifications': CONFIG_OK,
      // Lo que devuelve HOY la ruta cuando su `requirePermission` lanza adentro
      // del try/catch: el redirect de Next serializado como si fuera un mensaje.
      'PATCH /api/settings/notifications': { ok: false, status: 500, body: { error: 'NEXT_REDIRECT;replace;/;307;' } },
    }
    render(<NotificationsSettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('No se pudo guardar.')).toBeInTheDocument()
    expect(screen.queryByText(/NEXT_REDIRECT/)).not.toBeInTheDocument()
  })
})
