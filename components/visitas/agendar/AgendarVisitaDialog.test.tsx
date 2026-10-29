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

  // Ronda 2, ítem 1 (regresión de la ronda 1): si falla la carga de
  // interesados, el botón "cargar a mano" quedaba atrapado adentro del caso
  // `lista.length > 0` — un 500/504/sin red dejaba el paso SIN salida. Ahora
  // el error viene siempre con "Reintentar" + "Cargar a mano".
  it('si falla la carga de interesados: error + "Reintentar" vuelve a pedir y, si trae gente, se ve', async () => {
    let llamadasInteresados = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) {
        llamadasInteresados += 1
        if (llamadasInteresados === 1) return new Response('{}', { status: 500 })
        return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: 'Mariana López', telefono: '1158234521', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
      }
      if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await irAPersonaYLuegoCuando()
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cargar a mano' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Mariana López')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('si falla la carga de interesados: "Cargar a mano" abre el formulario igual', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) return new Response('{}', { status: 500 })
      if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await irAPersonaYLuegoCuando()
    fireEvent.click(await screen.findByRole('button', { name: 'Cargar a mano' }))
    expect(await screen.findByText('Nombre y apellido')).toBeInTheDocument()
    expect(screen.getByText('Teléfono (WhatsApp)')).toBeInTheDocument()
  })

  // Ronda 2, ítem 2: mismo defecto en PasoAsesor — "Probá de nuevo" sin
  // ningún botón. `onReintentar` vive en el armazón (ahí está el fetch de
  // /api/users/advisors) y sube `intentoAsesores`.
  it('si falla la carga de asesores: "Reintentar" vuelve a pedir y, si trae asesores, se ven', async () => {
    rol = 'admin'
    let llamadasAsesores = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: 'Mariana López', telefono: '1158234521', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
      if (url.startsWith('/api/users/advisors')) {
        llamadasAsesores += 1
        if (llamadasAsesores === 1) return new Response('{}', { status: 500 })
        return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      }
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
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
    await screen.findByRole('heading', { name: '¿Quién la muestra?' })
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('radio', { name: /Lucas/ })).toBeInTheDocument()
  })
})

// Modo rápido (sección Consultas): la consulta ya dice quién es, de dónde vino
// y qué propiedad miró. La ventana abre directo en "Día y hora".
describe('AgendarVisitaDialog — modo rápido desde una consulta', () => {
  const RAPIDO = {
    origen: 'portal' as const,
    persona: { tipo: 'consulta' as const, id: 'c1', nombre: 'Mariana López', telefono: '1158234521', detalle: 'Zonaprop' },
    telefono: '+5491158234521',
  }
  const VISITA_ID = '55555555-5555-4555-8555-555555555555'

  function mockConPost(post: () => Response) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/visits' && init?.method === 'POST') return post()
      return mockPorDefecto()(url)
    })
  }

  it('abre en "Día y hora" con la persona, su teléfono y la propiedad a la vista', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} rapido={RAPIDO} />)
    expect(await screen.findByRole('heading', { name: '¿Cuándo?' })).toBeInTheDocument()
    expect(screen.getByText('Mariana López')).toBeInTheDocument()
    expect(screen.getByText(/\+54 9 11 5823-4521/)).toBeInTheDocument()
    expect(screen.getByText('Doblas 248')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Ya la confirmé con la persona' })).toBeChecked()
    expect(screen.queryByRole('heading', { name: '¿De dónde viene esta visita?' })).not.toBeInTheDocument()
  })

  it('día + hora + "Agendar …" hace UN solo POST con la consulta y avisa el día y la hora', async () => {
    const fetchMock = mockConPost(() => json({ id: VISITA_ID }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const onAgendada = vi.fn()
    const onOpenChange = vi.fn()
    render(<AgendarVisitaDialog open onOpenChange={onOpenChange} propiedadId={PROP.id} rapido={RAPIDO} onAgendada={onAgendada} />)
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    const boton = await screen.findByRole('button', { name: /^Agendar \S+ \d+ · 10:00$/ })
    fireEvent.click(boton)
    fireEvent.click(boton)
    await waitFor(() => expect(onAgendada).toHaveBeenCalled())
    const posts = fetchMock.mock.calls.filter(([u]) => u === '/api/visits')
    expect(posts).toHaveLength(1)
    const cuerpo = JSON.parse((posts[0][1] as RequestInit).body as string) as Record<string, unknown>
    expect(cuerpo).toMatchObject({
      propiedadId: PROP.id, origen: 'portal', confirmada: true, fecha: hoyEnArgentina(), hora: '10:00',
      persona: { tipo: 'consulta', id: 'c1', telefono: '+5491158234521' },
    })
    expect(onAgendada).toHaveBeenCalledWith(VISITA_ID, { fecha: hoyEnArgentina(), hora: '10:00' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('sin día ni hora no manda nada y explica qué falta', async () => {
    const fetchMock = mockConPost(() => json({ id: VISITA_ID }, 201))
    vi.stubGlobal('fetch', fetchMock)
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} rapido={RAPIDO} />)
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }))
    expect(await screen.findByText('Elegí el día y la hora')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/visits')).toHaveLength(0)
  })

  it('desmarcar "Ya la confirmé" manda la visita a confirmar', async () => {
    const fetchMock = mockConPost(() => json({ id: VISITA_ID }, 201))
    vi.stubGlobal('fetch', fetchMock)
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} rapido={RAPIDO} />)
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ya la confirmé con la persona' }))
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Agendar .* · 10:00$/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === '/api/visits')).toBe(true))
    const post = fetchMock.mock.calls.find(([u]) => u === '/api/visits')
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toMatchObject({ confirmada: false })
  })

  it('409 VISITA_DUPLICADA → pasa a la revisión con el aviso del duplicado', async () => {
    vi.stubGlobal('fetch', mockConPost(() => new Response(JSON.stringify({
      error: 'Ya tiene una visita', code: 'VISITA_DUPLICADA',
      visita: { id: '66666666-6666-4666-8666-666666666666', scheduled_at: construirInstante('2026-12-25', '09:00')!.toISOString() },
    }), { status: 409 })))
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} rapido={RAPIDO} />)
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Agendar .* · 10:00$/ }))
    expect(await screen.findByRole('heading', { name: 'Revisá y agendá' })).toBeInTheDocument()
    expect(screen.getByText(/Esta persona ya tiene una visita el/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agendar igual' })).toBeInTheDocument()
  })

  it('409 PROPIEDAD_NO_DISPONIBLE → el error se ve ahí mismo, sin cambiar de paso', async () => {
    vi.stubGlobal('fetch', mockConPost(() => new Response(JSON.stringify({
      error: 'La propiedad ya no está disponible', code: 'PROPIEDAD_NO_DISPONIBLE',
    }), { status: 409 })))
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} rapido={RAPIDO} />)
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Agendar .* · 10:00$/ }))
    expect(await screen.findByText('La propiedad ya no está disponible')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Cuándo?' })).toBeInTheDocument()
  })

  it('si la propiedad no está disponible, vuelve al flujo normal con el aviso', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/visits/propiedades')) return json([])
      return mockPorDefecto()(url)
    }))
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} rapido={RAPIDO} />)
    expect(await screen.findByText('Esa propiedad no está disponible para agendar.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '¿Cuándo?' })).not.toBeInTheDocument()
  })

  it('un asesor ve quién la muestra pero no "Cambiar"', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} rapido={RAPIDO} />)
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    expect(await screen.findByText('Lucas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cambiar/ })).not.toBeInTheDocument()
  })

  it('un admin toca "Cambiar", elige asesor y vuelve a "Día y hora"', async () => {
    rol = 'admin'
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} rapido={RAPIDO} />)
    await screen.findByRole('heading', { name: '¿Cuándo?' })
    fireEvent.click(await screen.findByRole('button', { name: /Cambiar/ }))
    await screen.findByRole('heading', { name: '¿Quién la muestra?' })
    fireEvent.click(await screen.findByRole('radio', { name: /Lucas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(await screen.findByRole('heading', { name: '¿Cuándo?' })).toBeInTheDocument()
  })
})

/** Hoy, en Argentina, con el mismo formato (AAAA-MM-DD) que usa el selector. */
function hoyEnArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
