// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { construirInstante } from '@/lib/visitas/horario'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AgendarVisitaDialog } from './AgendarVisitaDialog'

const PROP = { id: '33333333-3333-4333-8333-333333333333', address: 'Doblas 248', neighborhood: 'Caballito', foto: null, assigned_to: '22222222-2222-4222-8222-222222222222', status: 'approved', commercial_status: 'disponible', asking_price: 220000, currency: 'USD' }
let rol = 'asesor'

// Espera REAL (no simulada): la ventana de debounce de "Agendar" (item 1 de la
// ronda 1) es un `Date.now()` de verdad — con temporizadores simulados
// (`vi.useFakeTimers`) `userEvent` se cuelga (CLAUDE.md § vitest en esta Mac),
// así que estos tests usan `fireEvent` + esta espera de milisegundos reales.
const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status })
}

/** Mock default: una sola interesada (Mariana López, teléfono utilizable) y sin choques. */
function mockPorDefecto() {
  return vi.fn(async (url: string) => {
    if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
    if (url.startsWith('/api/visits/propiedades')) return json([PROP])
    if (url.includes('/interesados')) return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: 'Mariana López', telefono: '1158234521', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
    if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
    if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
    return new Response('{}', { status: 404 })
  })
}

beforeEach(() => {
  rol = 'asesor'
  vi.stubGlobal('fetch', mockPorDefecto())
})

/** Navega propiedad fija → origen portal → elige a Mariana López → paso "¿Cuándo?". */
async function irAPersonaYLuegoCuando() {
  render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
  fireEvent.click(await screen.findByRole('button', { name: /Consulta de portal/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  await screen.findByRole('heading', { name: '¿Quién consultó?' })
}

describe('AgendarVisitaDialog', () => {
  it('desde la ficha arranca en "¿De dónde viene esta visita?"', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    expect(await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })).toBeInTheDocument()
  })

  it('no deja avanzar sin elegir y explica por qué', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Elegí de dónde viene la visita')).toBeInTheDocument()
  })

  it('consulta de portal → lista quienes consultaron', async () => {
    await irAPersonaYLuegoCuando()
    expect(await screen.findByText('Mariana López')).toBeInTheDocument()
  })

  it('un asesor no ve el paso "Asesor"', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })
    await waitFor(() => expect(screen.queryByText('Asesor', { selector: 'li *' })).not.toBeInTheDocument())
  })

  it('un admin SÍ ve el paso "Asesor"', async () => {
    rol = 'admin'
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })
    await waitFor(() => expect(screen.getByText('Asesor', { selector: 'li *' })).toBeInTheDocument())
  })

  // Decisión del controlador (Tarea 16, ronda 0): el campo de teléfono de la
  // persona elegida en la lista aparece cuando ese teléfono NO es utilizable
  // (`!ultimos10Digitos`), no solo cuando es `null`. Un '123' de carga vieja
  // "cuenta" como truthy pero no identifica un teléfono argentino completo.
  it('persona de la lista con teléfono de menos de 10 dígitos igual pide completarlo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) {
        return json([{ clave: 'consulta:c2', tipo: 'consulta', id: 'c2', nombre: 'Juan Pérez', telefono: '123', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: false, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
      }
      if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
      return new Response('{}', { status: 404 })
    }))
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    fireEvent.click(await screen.findByRole('button', { name: /Consulta de portal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(await screen.findByRole('button', { name: /Juan Pérez/ }))
    expect(await screen.findByLabelText(/Teléfono de Juan Pérez/)).toBeInTheDocument()
  })

  // Ronda 1, ítem 1: "Siguiente"/"Agendar" son el MISMO botón. Un segundo clic
  // rápido en el paso previo a Confirmar (sin re-consultar el botón: es el
  // mismo nodo del DOM que ya pasó a decir "Agendar") no tiene que saltear la
  // revisión ni mandar el POST.
  it('doble clic rápido en "Siguiente" justo antes de Confirmar no salta la revisión ni manda el POST', async () => {
    const fetchMock = mockPorDefecto()
    vi.stubGlobal('fetch', fetchMock)
    await irAPersonaYLuegoCuando()
    fireEvent.click(await screen.findByRole('button', { name: /Mariana López/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    const boton = screen.getByRole('button', { name: 'Siguiente' })
    fireEvent.click(boton)
    fireEvent.click(boton)
    expect(await screen.findByRole('heading', { name: 'Revisá y agendá' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/visits')).toHaveLength(0)
  })

  // Ronda 1, ítems 2 y 4: el teléfono completado A MANO (porque el de la
  // lista no alcanza) se ve en el resumen y es el que viaja en el POST — no
  // el teléfono crudo (no utilizable) de la persona elegida.
  it('persona con teléfono incompleto + teléfono completado a mano: el resumen y el POST usan el completado', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) {
        return json([{ clave: 'consulta:c2', tipo: 'consulta', id: 'c2', nombre: 'Juan Pérez', telefono: '123', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: false, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
      }
      if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
      if (url === '/api/visits' && init?.method === 'POST') return json({ id: '55555555-5555-4555-8555-555555555555' }, 201)
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await irAPersonaYLuegoCuando()
    fireEvent.click(await screen.findByRole('button', { name: /Juan Pérez/ }))
    const telefono = await screen.findByLabelText(/Teléfono de Juan Pérez/)
    fireEvent.change(telefono, { target: { value: '11 4444-5555' } })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: 'Revisá y agendá' })
    expect(screen.getByText(/11 4444-5555/)).toBeInTheDocument()

    await esperar(701) // fuera de la ventana de debounce del ítem 1
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === '/api/visits')).toBe(true))
    const llamada = fetchMock.mock.calls.find(([u]) => u === '/api/visits')
    const init = llamada?.[1] as RequestInit
    const cuerpo = JSON.parse(init.body as string) as { persona: { telefono?: string } }
    expect(cuerpo.persona.telefono).toBe('11 4444-5555')
  })

  // Ronda 1, ítem 4: doble toque en "Agendar" (ya en Confirmar, lejos de la
  // ventana de debounce del ítem 1) manda UN solo POST — lo cubre el guard
  // `enviandoRef` existente.
  it('doble toque en "Agendar" manda un solo POST', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: 'Mariana López', telefono: '1158234521', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
      if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
      if (url === '/api/visits' && init?.method === 'POST') return json({ id: '55555555-5555-4555-8555-555555555555' }, 201)
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await irAPersonaYLuegoCuando()
    fireEvent.click(await screen.findByRole('button', { name: /Mariana López/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: 'Revisá y agendá' })

    await esperar(701)
    const boton = screen.getByRole('button', { name: 'Agendar' })
    fireEvent.click(boton)
    fireEvent.click(boton)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => u === '/api/visits')).toHaveLength(1))
  })

  // Ronda 1, ítem 4: 409 VISITA_DUPLICADA con un instante DISTINTO al pedido
  // → aviso + botón "Agendar igual" que manda `forzarDuplicado: true`.
  it('409 VISITA_DUPLICADA en otro horario → aviso y "Agendar igual" con forzarDuplicado', async () => {
    let llamadasPost = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: 'Mariana López', telefono: '1158234521', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
      if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
      if (url === '/api/visits' && init?.method === 'POST') {
        llamadasPost += 1
        if (llamadasPost === 1) {
          const otroInstante = construirInstante('2026-12-25', '09:00')
          return new Response(JSON.stringify({
            error: 'Ya tiene una visita', code: 'VISITA_DUPLICADA',
            visita: { id: '66666666-6666-4666-8666-666666666666', scheduled_at: otroInstante!.toISOString() },
          }), { status: 409 })
        }
        return json({ id: '77777777-7777-4777-8777-777777777777' }, 201)
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await irAPersonaYLuegoCuando()
    fireEvent.click(await screen.findByRole('button', { name: /Mariana López/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: 'Revisá y agendá' })

    await esperar(701)
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }))
    const botonIgual = await screen.findByRole('button', { name: 'Agendar igual' })
    expect(await screen.findByText(/Esta persona ya tiene una visita el/)).toBeInTheDocument()

    await esperar(701)
    fireEvent.click(botonIgual)
    await waitFor(() => expect(llamadasPost).toBe(2))
    const segundaLlamada = fetchMock.mock.calls.filter(([u]) => u === '/api/visits')[1]
    const init = segundaLlamada[1] as RequestInit
    const cuerpo = JSON.parse(init.body as string) as { forzarDuplicado?: boolean }
    expect(cuerpo.forzarDuplicado).toBe(true)
  })

  // Ronda 1, ítem 12: si el `scheduled_at` del duplicado es el MISMO instante
  // que se pidió, es la MISMA visita (no una distinta de la misma persona):
  // mensaje definitivo + link "Ver visita", y no se ofrece "Agendar igual".
  it('409 VISITA_DUPLICADA en el MISMO instante → "ya quedó agendada" con link, sin "Agendar igual"', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: 'Mariana López', telefono: '1158234521', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
      if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
      if (url === '/api/visits' && init?.method === 'POST') {
        const instante = construirInstante(hoyEnArgentina(), '10:00')
        return new Response(JSON.stringify({
          error: 'Ya está agendada', code: 'VISITA_DUPLICADA',
          visita: { id: '88888888-8888-4888-8888-888888888888', scheduled_at: instante!.toISOString() },
        }), { status: 409 })
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await irAPersonaYLuegoCuando()
    fireEvent.click(await screen.findByRole('button', { name: /Mariana López/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: 'Revisá y agendá' })

    await esperar(701)
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }))
    expect(await screen.findByText('Esta visita ya quedó agendada.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver visita' })).toHaveAttribute('href', '/visits/88888888-8888-4888-8888-888888888888')
    expect(screen.queryByRole('button', { name: 'Agendar igual' })).not.toBeInTheDocument()
  })

  // Ronda 1, ítem 4: un 504 que devuelve HTML (gateway de Netlify) muestra el
  // mensaje en castellano (nunca el parseo roto) y NO borra lo ya elegido.
  it('504 con HTML → mensaje de demora en Confirmar, y los datos siguen al volver', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: 'Mariana López', telefono: '1158234521', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
      if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
      if (url === '/api/visits' && init?.method === 'POST') return new Response('<html>Gateway Timeout</html>', { status: 504 })
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await irAPersonaYLuegoCuando()
    fireEvent.click(await screen.findByRole('button', { name: /Mariana López/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: 'Revisá y agendá' })

    await esperar(701)
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }))
    expect(await screen.findByText('El servidor tardó demasiado. Probá de nuevo.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: 'Revisá y agendá' })
    expect(screen.getAllByText(/Mariana López/).length).toBeGreaterThan(0)
  })
})

/** Hoy, en Argentina, con el mismo formato (AAAA-MM-DD) que usa el selector. */
function hoyEnArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
