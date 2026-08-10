// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import TasksPage from './page'

/**
 * Pendientes (`/tasks`). Cubre los cinco defectos del grupo, y todos tienen la
 * misma forma: la pantalla afirmaba algo (Todo al día / N tareas / la tarea
 * quedó hecha) sin haberlo comprobado.
 *
 *   D11 — un 500 al listar se pintaba como "Todo al día · No hay tareas
 *         pendientes", con tilde verde, sobre 140 pendientes reales.
 *   D12 — "Todas" mandaba el pedido SIN `status`, que del otro lado significa
 *         "pendientes": el botón corría la consulta idéntica a "Pendientes" y
 *         las descartadas no eran alcanzables desde ningún filtro.
 *   D13 — el encabezado imprimía el largo del arreglo YA RECORTADO por el
 *         `.limit(50)` del servidor como si fuera el total.
 *   D14 — completar/descartar sacaba la fila aunque el servidor rechazara.
 *   D35 — si `/api/auth/me` no devuelve 200, `loadTasks` hace `return` antes de
 *         tocar `loading` (que arranca en `true`) y el spinner giraba para
 *         siempre, sin mensaje ni salida.
 */

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

interface Respuesta { ok: boolean; status: number; body: unknown }

function ok(body: unknown): Respuesta { return { ok: true, status: 200, body } }
function falla(status: number, body: unknown = { error: 'boom' }): Respuesta {
  return { ok: false, status, body }
}

function tarea(id: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    type: 'follow_up',
    title: `Tarea ${id}`,
    description: null,
    deal_id: null,
    appraisal_id: null,
    property_id: null,
    contact_id: null,
    status: 'pending',
    created_at: '2026-08-01T10:00:00Z',
    due_date: null,
    due_time: null,
    all_day: true,
    channel: null,
    ...extra,
  }
}

let auth: Respuesta
let porEstado: Record<string, Respuesta>
let putRespuesta: Respuesta
let calls: string[]
let puts: string[]

beforeEach(() => {
  toastError.mockClear()
  auth = ok({ id: 'u1', role: 'admin' })
  porEstado = {
    pending: ok({ data: [] }),
    completed: ok({ data: [] }),
    dismissed: ok({ data: [] }),
  }
  putRespuesta = ok({ success: true })
  calls = []
  puts = []
  vi.stubGlobal('fetch', vi.fn((url: string, init?: { method?: string }) => {
    if (init?.method === 'PUT') {
      puts.push(url)
      return Promise.resolve({ ok: putRespuesta.ok, status: putRespuesta.status, json: async () => putRespuesta.body })
    }
    calls.push(url)
    if (url.startsWith('/api/auth/me')) {
      return Promise.resolve({ ok: auth.ok, status: auth.status, json: async () => auth.body })
    }
    if (url.startsWith('/api/tasks')) {
      const estado = new URL(url, 'http://localhost').searchParams.get('status') ?? 'pending'
      const r = porEstado[estado] ?? ok({ data: [] })
      return Promise.resolve({ ok: r.ok, status: r.status, json: async () => r.body })
    }
    if (url.startsWith('/api/visits')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) })
    }
    if (url.startsWith('/api/portal-inquiries/unidentified')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) })
    }
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

/** Espera a que la pantalla salga del estado "cargando". */
async function esperarPintado() {
  await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())
}

describe('/tasks — D11: un fallo al listar NO es "Todo al día"', () => {
  it('con 500 del servidor muestra el error y ofrece reintentar, nunca el tilde verde', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      porEstado.pending = falla(500)
      render(<TasksPage />)

      await screen.findByText('No se pudieron traer tus tareas')
      expect(screen.queryByText('Todo al día')).not.toBeInTheDocument()
      expect(screen.queryByText('No hay tareas pendientes.')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
      // Y el encabezado tampoco puede afirmar "0 tareas pendientes".
      expect(screen.getByText('No se pudo consultar')).toBeInTheDocument()
      expect(screen.queryByText(/^0 tareas/)).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('un vacío DE VERDAD (200 con lista vacía) sí dice "Todo al día"', async () => {
    render(<TasksPage />)
    await screen.findByText('Todo al día')
    expect(screen.getByText('0 tareas pendientes')).toBeInTheDocument()
    expect(screen.queryByText('No se pudieron traer tus tareas')).not.toBeInTheDocument()
  })

  it('"Reintentar" vuelve a pedir, y si esta vez anda, se ven las tareas', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      porEstado.pending = falla(500)
      render(<TasksPage />)
      await screen.findByText('No se pudieron traer tus tareas')

      porEstado.pending = ok({ data: [tarea('t1')] })
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      await screen.findByText('Tarea t1')
      expect(screen.queryByText('No se pudieron traer tus tareas')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })
})

describe('/tasks — D12: "Todas" muestra de verdad todas', () => {
  it('pide los tres estados por nombre y junta los lotes (las descartadas dejan de ser inalcanzables)', async () => {
    porEstado.pending = ok({ data: [tarea('p1')] })
    porEstado.completed = ok({ data: [tarea('c1', { status: 'completed' })] })
    porEstado.dismissed = ok({ data: [tarea('d1', { status: 'dismissed' })] })

    render(<TasksPage />)
    await screen.findByText('Tarea p1')

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    await screen.findByText('Tarea d1')

    expect(screen.getByText('Tarea p1')).toBeInTheDocument()
    expect(screen.getByText('Tarea c1')).toBeInTheDocument()
    expect(screen.getByText('3 tareas')).toBeInTheDocument()

    // La prueba de que NO repitió la consulta de "Pendientes": los tres
    // estados viajaron por su nombre.
    const pedidos = calls.filter(c => c.startsWith('/api/tasks'))
    expect(pedidos.some(c => c.includes('status=completed'))).toBe(true)
    expect(pedidos.some(c => c.includes('status=dismissed'))).toBe(true)
    // Y ninguno viaja sin `status`: la ausencia significa "pendientes".
    expect(pedidos.every(c => c.includes('status='))).toBe(true)
  })

  it('las tareas cerradas se distinguen de las vivas y no ofrecen completar/descartar', async () => {
    porEstado.pending = ok({ data: [] })
    porEstado.completed = ok({ data: [tarea('c1', { status: 'completed' })] })
    porEstado.dismissed = ok({ data: [tarea('d1', { status: 'dismissed' })] })

    render(<TasksPage />)
    await esperarPintado()
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    await screen.findByText('Tarea c1')

    expect(screen.getByText('Completada')).toBeInTheDocument()
    expect(screen.getByText('Descartada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Completar tarea' })).not.toBeInTheDocument()
  })
})

describe('/tasks — D13: el encabezado no puede vender el recorte como el total', () => {
  it('con el lote lleno (50) declara que hay más', async () => {
    porEstado.pending = ok({ data: Array.from({ length: 50 }, (_, i) => tarea(`t${i}`)) })
    render(<TasksPage />)
    await screen.findByText('Tarea t0')
    expect(screen.getByText('50 tareas pendientes · las primeras 50 — puede haber más')).toBeInTheDocument()
  })

  it('por debajo del tope no declara nada raro', async () => {
    porEstado.pending = ok({ data: Array.from({ length: 49 }, (_, i) => tarea(`t${i}`)) })
    render(<TasksPage />)
    await screen.findByText('Tarea t0')
    expect(screen.getByText('49 tareas pendientes')).toBeInTheDocument()
  })
})

describe('/tasks — D14: la fila sale de la pantalla solo si el servidor confirmó', () => {
  it('con 500 al completar, la tarea SIGUE en pantalla y se avisa', async () => {
    porEstado.pending = ok({ data: [tarea('t1')] })
    render(<TasksPage />)
    await screen.findByText('Tarea t1')

    putRespuesta = falla(500, { error: 'no anduvo' })
    fireEvent.click(screen.getByRole('button', { name: 'Completar tarea' }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(screen.getByText('Tarea t1')).toBeInTheDocument()
    expect(String(toastError.mock.calls[0][0])).toContain('no anduvo')
  })

  it('con 401 (sesión vencida) tampoco la saca, y el aviso dice que hay que volver a entrar', async () => {
    porEstado.pending = ok({ data: [tarea('t1')] })
    render(<TasksPage />)
    await screen.findByText('Tarea t1')

    putRespuesta = falla(401, { error: 'unauthorized' })
    fireEvent.click(screen.getByRole('button', { name: 'Descartar tarea' }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(screen.getByText('Tarea t1')).toBeInTheDocument()
    expect(String(toastError.mock.calls[0][0])).toContain('Volvé a entrar')
  })

  it('con 200 sí la saca (el camino feliz sigue igual)', async () => {
    porEstado.pending = ok({ data: [tarea('t1')] })
    render(<TasksPage />)
    await screen.findByText('Tarea t1')

    fireEvent.click(screen.getByRole('button', { name: 'Completar tarea' }))

    await waitFor(() => expect(screen.queryByText('Tarea t1')).not.toBeInTheDocument())
    expect(puts).toHaveLength(1)
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('/tasks — D35: sin identidad no hay spinner eterno', () => {
  it('con 401 de /api/auth/me muestra la salida y NO pide tareas', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      auth = falla(401, { error: 'unauthorized' })
      render(<TasksPage />)

      await screen.findByText('No pudimos confirmar quién sos')
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Volver a entrar' })).toHaveAttribute('href', '/login')
      // Lo que definía el defecto: el spinner que no paraba nunca.
      expect(document.querySelector('.animate-spin')).toBeNull()
      expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(false)
    } finally {
      errores.mockRestore()
    }
  })

  it('un 200 sin id tampoco es una identidad (y tampoco cuelga)', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      auth = ok({ role: 'admin' })
      render(<TasksPage />)

      await screen.findByText('No pudimos confirmar quién sos')
      expect(document.querySelector('.animate-spin')).toBeNull()
      expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(false)
    } finally {
      errores.mockRestore()
    }
  })
})
