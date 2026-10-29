// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { leerTelefono } from '@/lib/consultas/telefono'
import type { ConsultaEnBandeja } from '@/lib/consultas/tipos'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }))

import { AgendarDesdeConsulta } from './AgendarDesdeConsulta'

const CONSULTA_ID = '11111111-1111-4111-8111-111111111111'
const ASESOR = '22222222-2222-4222-8222-222222222222'
const TARIJA = { id: '33333333-3333-4333-8333-333333333333', address: 'Tarija 4000', neighborhood: 'Boedo', foto: null, assigned_to: ASESOR }
const QUESADA = { id: '44444444-4444-4444-8444-444444444444', address: 'Quesada 3500', neighborhood: 'Coghlan', foto: null, assigned_to: ASESOR }
const VISITA_ID = '55555555-5555-4555-8555-555555555555'

function consulta(p: Partial<ConsultaEnBandeja> = {}): ConsultaEnBandeja {
  const telefono = p.telefono === undefined ? '+5491161400496' : p.telefono
  return {
    id: CONSULTA_ID, tipo: 'portal', numero: 640, recibida_at: '2026-10-29T12:24:00Z', canal: 'mail',
    portal: 'zonaprop', nombre: 'Sofía Paz', telefono, email: null, mensaje: null,
    property_id: TARIJA.id, assigned_to: ASESOR, asesor_propiedad: ASESOR, aviso_codigo: '2CBSS6',
    aviso_url: 'https://www.zonaprop.com.ar/propiedades/x-2CBSS6.html',
    aviso_direccion: null, aviso_titulo: 'Departamento 3 ambientes con balcón — Boedo', utm: null,
    estado: { tipo: 'sin_visita' }, tel: leerTelefono(telefono), repetidas: 1, accion: 'agendar',
    propiedad: { address: TARIJA.address, neighborhood: TARIJA.neighborhood }, asesor_nombre: null,
    ...p,
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status })
}

let rol = 'coordinador'
function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: ASESOR, role: rol }), { status: 200 })
    if (url === `/api/consultas/${CONSULTA_ID}/propiedad` && init?.method === 'POST') {
      return new Response(JSON.stringify({ actualizadas: 3, recordado: true }), { status: 200 })
    }
    if (url === '/api/visits' && init?.method === 'POST') return json({ id: VISITA_ID }, 201)
    if (url.startsWith('/api/visits/propiedades?id=')) return json([TARIJA])
    if (url.startsWith('/api/visits/propiedades')) return json([QUESADA, TARIJA])
    if (url.startsWith('/api/users/advisors')) return json([{ id: ASESOR, full_name: 'Lucas' }])
    if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
    return new Response('{}', { status: 404 })
  })
}

let fetchMock: ReturnType<typeof mockFetch>
beforeEach(() => {
  rol = 'coordinador'
  fetchMock = mockFetch()
  vi.stubGlobal('fetch', fetchMock)
})

/** En la ventana rápida: Hoy · 10:00 → "Agendar …". */
async function agendarHoyALas10() {
  await screen.findByRole('heading', { name: '¿Cuándo?' }, { timeout: 4000 })
  fireEvent.click(screen.getByRole('button', { name: /Hoy/ }))
  fireEvent.click(screen.getByRole('button', { name: '10:00' }))
  fireEvent.click(await screen.findByRole('button', { name: /^Agendar \S+ \d+ · 10:00$/ }))
}

function indiceDe(url: string): number {
  return fetchMock.mock.calls.findIndex(([u, init]) => u === url && (init as RequestInit | undefined)?.method === 'POST')
}

describe('AgendarDesdeConsulta', () => {
  it('sin propiedad y coordinador: conecta el aviso entero ANTES de agendar', async () => {
    const onTerminado = vi.fn()
    render(<AgendarDesdeConsulta consulta={consulta({ property_id: null, propiedad: null, accion: 'elegir_propiedad' })}
      puedeIdentificar onTerminado={onTerminado} onCerrar={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: '¿Qué propiedad quiere ver?' })).toBeInTheDocument()
    // La del barrio que nombra el aviso va arriba, como sugerida.
    expect(await screen.findByText('Sugeridas para este aviso')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('radio', { name: /Tarija 4000/ }))
    // Sin casilla: la hoja dice que se conecta el aviso entero.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText(/todas las consultas de este aviso/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Seguir/ }))
    await agendarHoyALas10()
    expect(await screen.findByRole('heading', { name: /Visita agendada/ })).toBeInTheDocument()

    const conexion = indiceDe(`/api/consultas/${CONSULTA_ID}/propiedad`)
    const alta = indiceDe('/api/visits')
    expect(conexion).toBeGreaterThanOrEqual(0)
    expect(alta).toBeGreaterThan(conexion)
    const cuerpo = JSON.parse((fetchMock.mock.calls[conexion][1] as RequestInit).body as string) as unknown
    expect(cuerpo).toEqual({ propertyId: TARIJA.id })
    const visita = JSON.parse((fetchMock.mock.calls[alta][1] as RequestInit).body as string) as Record<string, unknown>
    expect(visita).toMatchObject({ propiedadId: TARIJA.id, persona: { tipo: 'consulta', id: CONSULTA_ID } })
  }, 20000)

  it('teléfono "4941-0027": "Usar este número" se habilita con la característica y la visita lleva el canónico', async () => {
    render(<AgendarDesdeConsulta consulta={consulta({ telefono: '4941-0027', accion: 'revisar_telefono' })}
      puedeIdentificar onTerminado={vi.fn()} onCerrar={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Revisá el teléfono' })).toBeInTheDocument()
    expect(screen.getByText('Tiene 8 números: le falta la característica.', { exact: false })).toBeInTheDocument()
    const usar = screen.getByRole('button', { name: 'Usar este número' })
    expect(usar).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Característica'), { target: { value: '11' } })
    expect(usar).toBeEnabled()
    expect(screen.getByText('+54 9 11 4941-0027')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Probar: abrir este chat en WhatsApp/ }))
      .toHaveAttribute('href', 'https://wa.me/5491149410027')
    fireEvent.click(usar)
    await agendarHoyALas10()
    await screen.findByRole('heading', { name: /Visita agendada/ })
    const alta = indiceDe('/api/visits')
    const visita = JSON.parse((fetchMock.mock.calls[alta][1] as RequestInit).body as string) as Record<string, unknown>
    expect(visita).toMatchObject({ persona: { tipo: 'consulta', id: CONSULTA_ID, telefono: '+5491149410027' } })

    // Listo: el botón principal abre el WhatsApp de esa persona con el mensaje armado.
    const confirmar = screen.getByRole('link', { name: /Confirmarle por WhatsApp/ })
    expect(confirmar.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/549/)
    expect(confirmar).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Ver la visita' })).toHaveAttribute('href', `/visits/${VISITA_ID}`)
  }, 20000)

  it('asesor y sin propiedad: pide a un coordinador y no hay botón Seguir', async () => {
    rol = 'asesor'
    render(<AgendarDesdeConsulta consulta={consulta({ property_id: null, propiedad: null, accion: 'elegir_propiedad' })}
      puedeIdentificar={false} onTerminado={vi.fn()} onCerrar={vi.fn()} />)
    expect(await screen.findByText(/Pedile a un coordinador que identifique este aviso/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Seguir/ })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith(`/api/consultas/${CONSULTA_ID}/propiedad`))).toBe(false)
  })

  it('MercadoLibre sin teléfono: lo pide por el chat del portal, sin campo de nombre', async () => {
    render(<AgendarDesdeConsulta consulta={consulta({ portal: 'mercadolibre', telefono: null, accion: 'pedir_telefono' })}
      puedeIdentificar onTerminado={vi.fn()} onCerrar={vi.fn()} />)
    expect(await screen.findByText('MercadoLibre no comparte el contacto. Pedile el celular por el chat del portal.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Nombre/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar este número' })).toBeDisabled()
  })

  it('número de otro país: solo se acepta empezando con +', async () => {
    render(<AgendarDesdeConsulta consulta={consulta({ telefono: '4941-0027', accion: 'revisar_telefono' })}
      puedeIdentificar onTerminado={vi.fn()} onCerrar={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Es un número de otro país' }))
    const libre = screen.getByLabelText('Número completo con código de país')
    const usar = screen.getByRole('button', { name: 'Usar este número' })
    fireEvent.change(libre, { target: { value: '59899123456' } })
    expect(usar).toBeDisabled()
    fireEvent.change(libre, { target: { value: '+598 99 123 456' } })
    expect(usar).toBeEnabled()
  })

  it('si la propiedad no tiene asesor (el aviso no se recordó), avisa sin frenar y sigue a agendar', async () => {
    const { toast } = await import('sonner')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `/api/consultas/${CONSULTA_ID}/propiedad` && init?.method === 'POST') {
        return new Response(JSON.stringify({ actualizadas: 1, recordado: false }), { status: 200 })
      }
      return mockFetch()(url, init)
    })
    render(<AgendarDesdeConsulta consulta={consulta({ property_id: null, propiedad: null, accion: 'elegir_propiedad' })}
      puedeIdentificar onTerminado={vi.fn()} onCerrar={vi.fn()} />)
    fireEvent.click(await screen.findByRole('radio', { name: /Tarija 4000/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Seguir/ }))
    await screen.findByRole('heading', { name: '¿Cuándo?' }, { timeout: 4000 })
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      'La propiedad no tiene asesor: las próximas consultas de este aviso no se van a conectar solas. Asigná un asesor a la propiedad.',
    ))
  }, 20000)

  it('cancelar después de conectar la propiedad avisa onCerrar(true): la bandeja se re-pide', async () => {
    const onCerrar = vi.fn()
    render(<AgendarDesdeConsulta consulta={consulta({ property_id: null, propiedad: null, accion: 'elegir_propiedad' })}
      puedeIdentificar onTerminado={vi.fn()} onCerrar={onCerrar} />)
    fireEvent.click(await screen.findByRole('radio', { name: /Tarija 4000/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Seguir/ }))
    await screen.findByRole('heading', { name: '¿Cuándo?' }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(onCerrar).toHaveBeenCalledWith(true))
  }, 20000)

  it('cancelar sin haber conectado nada avisa onCerrar(false)', async () => {
    const onCerrar = vi.fn()
    render(<AgendarDesdeConsulta consulta={consulta({ property_id: null, propiedad: null, accion: 'elegir_propiedad' })}
      puedeIdentificar onTerminado={vi.fn()} onCerrar={onCerrar} />)
    await screen.findByRole('heading', { name: '¿Qué propiedad quiere ver?' })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(onCerrar).toHaveBeenCalledWith(false))
  })

  it('la búsqueda inicial pide el inventario entero (limite=200) para ordenar por barrio', async () => {
    render(<AgendarDesdeConsulta consulta={consulta({ property_id: null, propiedad: null, accion: 'elegir_propiedad' })}
      puedeIdentificar onTerminado={vi.fn()} onCerrar={vi.fn()} />)
    await screen.findByRole('radio', { name: /Tarija 4000/ })
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/visits/propiedades?q=&limite=200')).toBe(true)
  })

  it('al agendar no se repite el toast de la ventana: la confirmación es la hoja "Visita agendada"', async () => {
    const { toast } = await import('sonner')
    vi.mocked(toast.success).mockClear()
    render(<AgendarDesdeConsulta consulta={consulta()} puedeIdentificar onTerminado={vi.fn()} onCerrar={vi.fn()} />)
    await agendarHoyALas10()
    await screen.findByRole('heading', { name: /Visita agendada/ })
    expect(toast.success).not.toHaveBeenCalled()
  }, 20000)

  it('si conectar la propiedad falla, muestra el error y se queda', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `/api/consultas/${CONSULTA_ID}/propiedad` && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'No tenés permiso para conectar consultas con propiedades' }), { status: 403 })
      }
      return mockFetch()(url, init)
    })
    render(<AgendarDesdeConsulta consulta={consulta({ property_id: null, propiedad: null, accion: 'elegir_propiedad' })}
      puedeIdentificar onTerminado={vi.fn()} onCerrar={vi.fn()} />)
    fireEvent.click(await screen.findByRole('radio', { name: /Tarija 4000/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Seguir/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para conectar consultas con propiedades')
    expect(screen.getByRole('heading', { name: '¿Qué propiedad quiere ver?' })).toBeInTheDocument()
  })
})
