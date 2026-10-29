// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { leerTelefono } from '@/lib/consultas/telefono'
import type { ConsultaEnBandeja, RespuestaBandeja } from '@/lib/consultas/tipos'
import type { InicioRapido } from '@/lib/visitas/agendar-estado'

let busqueda = ''
const escrituras: string[] = []
vi.mock('next/navigation', () => ({
  usePathname: () => '/consultas',
  useSearchParams: () => new URLSearchParams(busqueda),
  useRouter: () => ({ replace: (href: string) => { escrituras.push(href) }, push: vi.fn() }),
}))

// La ventana de agendar tiene sus propias pruebas (Tarea 7): acá importa con qué
// datos se abre y qué hace la bandeja cuando avisa que se agendó.
let rapidoRecibido: { propiedadId?: string; rapido?: InicioRapido } | null = null
vi.mock('@/components/visitas/agendar/AgendarVisitaDialog', () => ({
  AgendarVisitaDialog: (p: {
    open: boolean; propiedadId?: string; rapido?: InicioRapido
    onAgendada?: (id: string, cuando: { fecha: string; hora: string }) => void
  }) => {
    if (!p.open) return null
    rapidoRecibido = { propiedadId: p.propiedadId, rapido: p.rapido }
    return (
      <div role="dialog" aria-label="Agendar (simulado)">
        <button type="button" onClick={() => p.onAgendada?.('v-9', { fecha: '2026-10-30', hora: '17:00' })}>Simular agendada</button>
      </div>
    )
  },
}))

import { ConsultasClient } from './ConsultasClient'

const YO = '11111111-1111-4111-8111-111111111111'
const PROP = '33333333-3333-4333-8333-333333333333'
let rol = 'admin'
let respuestas: Map<number, RespuestaBandeja[]>
let pedidos: string[] = []

function c(p: Partial<ConsultaEnBandeja> = {}): ConsultaEnBandeja {
  const telefono = p.telefono === undefined ? '541161400496' : p.telefono
  return {
    id: 'c-1', tipo: 'portal', numero: 640, recibida_at: '2026-10-29T12:24:00Z', canal: 'whatsapp',
    portal: 'zonaprop', nombre: 'Martina Gómez', telefono, email: null, mensaje: 'Hola, ¿sigue disponible?',
    property_id: PROP, assigned_to: null, asesor_propiedad: null, aviso_codigo: null,
    aviso_url: 'https://www.zonaprop.com.ar/aviso-1', aviso_direccion: null, aviso_titulo: null, utm: null,
    estado: { tipo: 'sin_visita' }, tel: leerTelefono(telefono), repetidas: 1, accion: 'agendar',
    propiedad: { address: 'Entre Ríos 2333', neighborhood: 'Martínez' }, asesor_nombre: 'Lucas',
    ...p,
  }
}

function bandeja(filas: ConsultaEnBandeja[], cambios: Partial<RespuestaBandeja> = {}): RespuestaBandeja {
  return {
    filas, total: filas.length, pagina: 1, porPagina: 25,
    tarjetas: { sinVisita: 38, sinPropiedad: 12, telefonoRevisar: 3 },
    porPortal: [{ valor: 'zonaprop', etiqueta: 'ZonaProp', n: 45 }, { valor: 'argenprop', etiqueta: 'Argenprop', n: 15 }],
    porPropiedad: [
      { valor: 'sin', etiqueta: 'Sin propiedad identificada', n: 12 },
      { valor: PROP, etiqueta: 'Entre Ríos 2333', n: 14 },
    ],
    periodo: { desde: '2026-10-23', hasta: '2026-10-29', etiqueta: 'Últimos 7 días' },
    ...cambios,
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  busqueda = ''; escrituras.length = 0; rol = 'admin'; pedidos = []; rapidoRecibido = null
  respuestas = new Map([[1, [bandeja([c()])]]])
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-29T15:00:00Z'))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/auth/me')) return json(200, { id: YO, role: rol })
    if (url.startsWith('/api/visits/propiedades')) return json(200, { data: [] })
    if (url.startsWith('/api/users/advisors')) return json(200, { data: [{ id: '22222222-2222-4222-8222-222222222222', full_name: 'Lucas Pérez' }] })
    if (url.startsWith('/api/consultas')) {
      pedidos.push(url)
      const pagina = Number(new URL(url, 'http://x').searchParams.get('pagina') ?? '1')
      const cola = respuestas.get(pagina) ?? []
      const r = cola.length > 1 ? cola.shift() : cola[0]
      return r ? json(200, r) : json(500, { error: 'No pudimos cargar las consultas' })
    }
    throw new Error(`fetch inesperado: ${url}`)
  }))
})
afterEach(() => { vi.useRealTimers() })

describe('/consultas', () => {
  it('pinta los grupos por día en orden, del más nuevo al más viejo', async () => {
    respuestas.set(1, [bandeja([
      c({ id: 'a', recibida_at: '2026-10-29T12:24:00Z' }),
      c({ id: 'b', recibida_at: '2026-10-28T22:00:00Z', nombre: 'Lucas Ferreira' }),
      c({ id: 'c', recibida_at: '2026-10-26T14:00:00Z', nombre: 'Sofía Paz' }),
    ])])
    render(<ConsultasClient />)
    const lista = await screen.findByRole('region', { name: 'Lista de consultas' })
    await within(lista).findByText('Sofía Paz')
    expect(within(lista).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Hoy', 'Ayer', 'lun 26 oct'])
  })

  it('pide los últimos 7 días por defecto, sin filtros de más', async () => {
    render(<ConsultasClient />)
    await waitFor(() => expect(pedidos).toHaveLength(1))
    const qs = new URL(pedidos[0], 'http://x').searchParams
    expect(qs.get('periodo')).toBe('7d')
    expect(qs.get('pagina')).toBe('1')
    expect(qs.get('portal')).toBeNull()
  })

  it('cada fila: nombre, teléfono formateado, portal, canal y hora, propiedad y "N consultas"', async () => {
    respuestas.set(1, [bandeja([c({ repetidas: 2 })])])
    render(<ConsultasClient />)
    const lista = await screen.findByRole('region', { name: 'Lista de consultas' })
    expect(await within(lista).findByText('Martina Gómez')).toBeInTheDocument()
    expect(within(lista).getByText('+54 9 11 6140-0496')).toBeInTheDocument()
    expect(within(lista).getByText('ZonaProp')).toBeInTheDocument()
    expect(within(lista).getByText('WhatsApp · 09:24')).toBeInTheDocument()
    expect(within(lista).getByText('Entre Ríos 2333, Martínez')).toBeInTheDocument()
    expect(within(lista).getByText('2 consultas')).toBeInTheDocument()
  })

  it('con visita: "Visita vie 30 · 17:00" enlazada a la visita y sin botón de agendar', async () => {
    respuestas.set(1, [bandeja([c({ estado: { tipo: 'con_visita', visitaId: 'v-1', scheduled_at: '2026-10-30T20:00:00Z' } })])])
    render(<ConsultasClient />)
    const enlace = await screen.findByRole('link', { name: 'Visita vie 30 · 17:00' })
    expect(enlace).toHaveAttribute('href', '/visits/v-1')
    expect(screen.queryByRole('button', { name: 'Agendar visita' })).not.toBeInTheDocument()
  })

  it('MercadoLibre sin contacto lo dice en vez de pedir revisar', async () => {
    respuestas.set(1, [bandeja([c({ portal: 'mercadolibre', telefono: null, nombre: null, accion: 'pedir_telefono' })])])
    render(<ConsultasClient />)
    expect(await screen.findByText('MercadoLibre no comparte el contacto')).toBeInTheDocument()
    expect(screen.getByText('Pregunta en MercadoLibre')).toBeInTheDocument()
  })

  it('tocar "Sin propiedad identificada" pone propiedad=sin en la dirección', async () => {
    render(<ConsultasClient />)
    await userEvent.click(await screen.findByRole('button', { name: /Sin propiedad identificada/ }))
    expect(escrituras.some((h) => h.includes('propiedad=sin'))).toBe(true)
  })

  it('la tarjeta activa queda marcada y tocarla de nuevo saca el filtro', async () => {
    busqueda = 'estado=sin_visita'
    render(<ConsultasClient />)
    const tarjeta = await screen.findByRole('button', { name: /Sin visita todavía/ })
    expect(tarjeta).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(tarjeta)
    expect(escrituras.at(-1)).not.toContain('estado=')
  })

  it('el selector de propiedad: "⚠ Sin propiedad identificada" primero después de "Todas", con conteo', async () => {
    render(<ConsultasClient />)
    const select = await screen.findByRole('combobox', { name: 'Propiedad' })
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3))
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todas', '⚠ Sin propiedad identificada (12)', 'Entre Ríos 2333 (14)',
    ])
    const portal = screen.getByRole('combobox', { name: 'Portal' })
    expect(within(portal).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos', 'ZonaProp (45)', 'Argenprop (15)'])
  })

  it('"Ver más" con una fila repetida no la duplica, y cuenta "Mostrando X de total"', async () => {
    respuestas.set(1, [bandeja([c({ id: 'a', nombre: 'Ana' }), c({ id: 'b', nombre: 'Beto' })], { total: 3 })])
    respuestas.set(2, [bandeja([c({ id: 'b', nombre: 'Beto' }), c({ id: 'c', nombre: 'Carla' })], { total: 3, pagina: 2 })])
    render(<ConsultasClient />)
    expect(await screen.findByText('Mostrando 2 de 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }))
    expect(await screen.findByText('Carla')).toBeInTheDocument()
    expect(screen.getAllByText('Beto')).toHaveLength(1)
    expect(screen.getByText('Mostrando 3 de 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument()
  })

  it('el asesor no ve el selector de asesor ni pide la lista de asesores', async () => {
    rol = 'asesor'
    render(<ConsultasClient />)
    await screen.findByRole('combobox', { name: 'Propiedad' })
    await waitFor(() => expect(pedidos).toHaveLength(1))
    expect(screen.queryByRole('combobox', { name: 'Asesor' })).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith('/api/users/advisors'))).toBe(false)
  })

  it('quien ve todo tiene el selector de asesor con "Sin asesor"', async () => {
    render(<ConsultasClient />)
    const select = await screen.findByRole('combobox', { name: 'Asesor' })
    await waitFor(() => expect(within(select).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Todos', 'Sin asesor', 'Lucas Pérez']))
  })

  it('el detalle: teléfono, lo que dejó, WhatsApp y Llamar, aviso, mensaje y otras consultas', async () => {
    respuestas.set(1, [bandeja([
      c({ id: 'a' }),
      c({ id: 'b', telefono: '011 15 6140-0496', portal: 'argenprop', recibida_at: '2026-10-12T15:00:00Z',
        propiedad: { address: 'Av. de Los Incas 5200', neighborhood: null } }),
    ])])
    render(<ConsultasClient />)
    await userEvent.click((await screen.findAllByRole('button', { name: /Ver la consulta de Martina Gómez/ }))[0])
    const detalle = await screen.findByRole('dialog')
    expect(within(detalle).getByText('Lo dejó como «541161400496»')).toBeInTheDocument()
    expect(within(detalle).getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute('href', 'https://wa.me/5491161400496')
    expect(within(detalle).getByRole('link', { name: 'Llamar' })).toHaveAttribute('href', 'tel:+5491161400496')
    expect(within(detalle).getByRole('link', { name: 'Ver aviso en ZonaProp' })).toHaveAttribute('href', 'https://www.zonaprop.com.ar/aviso-1')
    expect(within(detalle).getByText('Hola, ¿sigue disponible?')).toBeInTheDocument()
    expect(within(detalle).getByText(/Av\. de Los Incas 5200 · Argenprop/)).toBeInTheDocument()
  })

  it('un enlace de aviso que no es https no se muestra', async () => {
    respuestas.set(1, [bandeja([c({ aviso_url: 'javascript:alert(1)' })])])
    render(<ConsultasClient />)
    await userEvent.click(await screen.findByRole('button', { name: /Ver la consulta de Martina Gómez/ }))
    const detalle = await screen.findByRole('dialog')
    expect(within(detalle).queryByRole('link', { name: /Ver aviso/ })).not.toBeInTheDocument()
  })

  it('"Agendar visita" abre la ventana en modo rápido y, al agendar, vuelve a pedir la bandeja', async () => {
    respuestas.set(1, [
      bandeja([c()]),
      bandeja([c({ estado: { tipo: 'con_visita', visitaId: 'v-9', scheduled_at: '2026-10-30T20:00:00Z' } })]),
    ])
    render(<ConsultasClient />)
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar visita' }))
    expect(rapidoRecibido?.propiedadId).toBe(PROP)
    expect(rapidoRecibido?.rapido).toMatchObject({
      origen: 'portal', telefono: '+5491161400496', telefonoValido: true,
      persona: { tipo: 'consulta', id: 'c-1', nombre: 'Martina Gómez' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Simular agendada' }))
    // Primero la hoja "Visita agendada"; la bandeja se re-pide al volver.
    expect(await screen.findByRole('heading', { name: /Visita agendada/ })).toBeInTheDocument()
    expect(pedidos).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Volver a consultas' }))
    await waitFor(() => expect(pedidos).toHaveLength(2))
    expect(await screen.findByRole('link', { name: 'Visita vie 30 · 17:00' })).toBeInTheDocument()
  })

  it('una consulta sin propiedad abre primero "¿Qué propiedad quiere ver?", no la ventana', async () => {
    respuestas.set(1, [bandeja([c({ property_id: null, propiedad: null, accion: 'elegir_propiedad' })])])
    render(<ConsultasClient />)
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar visita' }))
    expect(await screen.findByRole('heading', { name: '¿Qué propiedad quiere ver?' })).toBeInTheDocument()
    // Admin identifica avisos: puede seguir (aunque todavía no eligió).
    expect(screen.getByRole('button', { name: /^Seguir/ })).toBeDisabled()
    expect(rapidoRecibido).toBeNull()
  })

  it('un teléfono a revisar abre primero "Revisá el teléfono"', async () => {
    respuestas.set(1, [bandeja([c({ telefono: '4941-0027', accion: 'revisar_telefono' })])])
    render(<ConsultasClient />)
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar visita' }))
    expect(await screen.findByRole('heading', { name: 'Revisá el teléfono' })).toBeInTheDocument()
    expect(rapidoRecibido).toBeNull()
  })

  it('un período sin consultas lo dice', async () => {
    respuestas.set(1, [bandeja([])])
    render(<ConsultasClient />)
    expect(await screen.findByText('No hay consultas en este período.')).toBeInTheDocument()
  })

  it('si el servidor falla: el mensaje real y "Reintentar"', async () => {
    respuestas.set(1, [])
    render(<ConsultasClient />)
    expect(await screen.findByText('No pudimos cargar las consultas')).toBeInTheDocument()
    respuestas.set(1, [bandeja([c()])])
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Martina Gómez')).toBeInTheDocument()
  })

  it('Estadísticas está, pero deshabilitada', async () => {
    render(<ConsultasClient />)
    const tab = await screen.findByRole('tab', { name: /Estadísticas/ })
    expect(tab).toBeDisabled()
    expect(tab).toHaveTextContent('Próximamente')
  })
})
