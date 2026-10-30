// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { leerTelefono } from '@/lib/consultas/telefono'
import type { ConsultaEnBandeja, PeriodoConsultas } from '@/lib/consultas/tipos'
import type { InicioRapido } from '@/lib/visitas/agendar-estado'

// La dirección real del navegador (happy-dom): los filtros escriben con
// history.replaceState (`soloNavegador`) y se leen de ahí, como en Next.
vi.mock('next/navigation', () => ({
  usePathname: () => '/consultas',
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: () => { throw new Error('Consultas no debe usar router.replace') }, push: vi.fn() }),
}))

// La ventana de agendar tiene sus propias pruebas: acá importa con qué datos se
// abre y qué hace la bandeja cuando avisa que se agendó.
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
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }))

import { ConsultasClient } from './ConsultasClient'

const YO = '11111111-1111-4111-8111-111111111111'
const PROP = '33333333-3333-4333-8333-333333333333'
const LUCAS = '22222222-2222-4222-8222-222222222222'

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

const SIETE = { desde: '2026-10-23', hasta: '2026-10-29', etiqueta: 'Últimos 7 días' }
const TREINTA = { desde: '2026-09-30', hasta: '2026-10-29', etiqueta: 'Últimos 30 días' }

function periodo(consultas: ConsultaEnBandeja[], p = SIETE): PeriodoConsultas {
  return { periodo: p, consultas, truncado: false }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Lo que responde `GET /api/consultas` (en orden; el último se repite). */
let respuestas: Array<PeriodoConsultas | null>
let pedidos: string[]
let posts: Array<{ url: string; body: unknown }>

function montar(opciones: { rol?: string; inicial?: PeriodoConsultas | null; errorInicial?: string | null; url?: string; abrirAvisos?: boolean } = {}) {
  window.history.replaceState(null, '', `/consultas${opciones.url ? `?${opciones.url}` : ''}`)
  return render(
    <ConsultasClient
      yo={{ id: YO, rol: opciones.rol ?? 'admin' }}
      asesores={[{ id: LUCAS, full_name: 'Lucas Pérez' }]}
      inicial={opciones.inicial === undefined ? periodo([c()]) : opciones.inicial}
      errorInicial={opciones.errorInicial ?? null}
      abrirAvisos={opciones.abrirAvisos}
    />,
  )
}

beforeEach(() => {
  rapidoRecibido = null; respuestas = []; pedidos = []; posts = []
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-29T15:00:00Z'))
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push({ url, body: JSON.parse(String(init.body)) })
      return json(200, { actualizadas: 26, recordado: true })
    }
    if (url.startsWith('/api/visits/propiedades')) {
      return json(200, { data: [{ id: PROP, address: 'Entre Ríos 2333', neighborhood: 'Martínez', foto: null, assigned_to: LUCAS }] })
    }
    if (url.startsWith('/api/consultas/avisos/quien-muestra')) return json(200, { muestraId: null })
    if (url === '/api/consultas/avisos') {
      return json(200, { avisos: [{ portal: 'zonaprop', codigo: '2DLPOM', titulo: 'Departamento 2 Ambientes en Martínez', url: null, n: 26, ultima: '2026-10-28T10:00:00Z' }], sueltas: 2 })
    }
    if (url.startsWith('/api/consultas')) {
      pedidos.push(url)
      const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0]
      return r ? json(200, r) : json(500, { error: 'No pudimos cargar las consultas' })
    }
    throw new Error(`fetch inesperado: ${url}`)
  }))
})
afterEach(() => { vi.useRealTimers() })

describe('/consultas — velocidad', () => {
  it('con el período que vino de la página no pide NADA al abrir', async () => {
    montar()
    expect(await screen.findByText('Martina Gómez')).toBeInTheDocument()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('filtrar por portal, buscar y "Ver más" no piden nada a la red', async () => {
    const treinta = Array.from({ length: 30 }, (_, i) => c({
      id: `id-${String(i).padStart(2, '0')}`, nombre: `Persona ${i}`, portal: i < 28 ? 'zonaprop' : 'argenprop',
      recibida_at: `2026-10-29T${String(10 + (i % 5)).padStart(2, '0')}:${String(i).padStart(2, '0')}:00Z`,
    }))
    montar({ inicial: periodo(treinta) })
    expect(await screen.findByText('Mostrando 25 de 30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }))
    expect(screen.getByText('Mostrando 30 de 30')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Portal' }), 'argenprop')
    expect(await screen.findByText('Mostrando 2 de 2')).toBeInTheDocument()
    expect(window.location.search).toContain('portal=argenprop')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('cambiar el período pide UNA vez; volver a uno ya visto no pide', async () => {
    respuestas = [periodo([c({ id: 'viejo', nombre: 'Consulta de septiembre', recibida_at: '2026-10-01T15:00:00Z' })], TREINTA)]
    montar()
    await screen.findByText('Martina Gómez')
    await userEvent.click(screen.getByRole('button', { name: '30 días' }))
    expect(await screen.findByText('Consulta de septiembre')).toBeInTheDocument()
    expect(pedidos).toEqual(['/api/consultas?periodo=30d'])
    await userEvent.click(screen.getByRole('button', { name: '7 días' }))
    expect(await screen.findByText('Martina Gómez')).toBeInTheDocument()
    expect(pedidos).toHaveLength(1)
  })
})

describe('/consultas — bandeja', () => {
  it('pinta los grupos por día en orden, del más nuevo al más viejo', async () => {
    montar({ inicial: periodo([
      c({ id: 'a', recibida_at: '2026-10-29T12:24:00Z' }),
      c({ id: 'b', recibida_at: '2026-10-28T22:00:00Z', nombre: 'Lucas Ferreira' }),
      c({ id: 'c', recibida_at: '2026-10-26T14:00:00Z', nombre: 'Sofía Paz' }),
    ]) })
    const lista = await screen.findByRole('region', { name: 'Lista de consultas' })
    await within(lista).findByText('Sofía Paz')
    expect(within(lista).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Hoy', 'Ayer', 'lun 26 oct'])
  })

  it('cada fila: nombre, teléfono formateado, portal, canal y hora, propiedad y "N consultas"', async () => {
    montar({ inicial: periodo([c({ repetidas: 2 })]) })
    const lista = await screen.findByRole('region', { name: 'Lista de consultas' })
    expect(within(lista).getByText('Martina Gómez')).toBeInTheDocument()
    expect(within(lista).getByText('+54 9 11 6140-0496')).toBeInTheDocument()
    expect(within(lista).getByText('ZonaProp')).toBeInTheDocument()
    expect(within(lista).getByText('WhatsApp · 09:24')).toBeInTheDocument()
    expect(within(lista).getByText('Entre Ríos 2333, Martínez')).toBeInTheDocument()
    expect(within(lista).getByText('2 consultas')).toBeInTheDocument()
  })

  it('con visita: "Visita vie 30 · 17:00" enlazada a la visita y sin botón de agendar', async () => {
    montar({ inicial: periodo([c({ estado: { tipo: 'con_visita', visitaId: 'v-1', scheduled_at: '2026-10-30T20:00:00Z' } })]) })
    const enlace = await screen.findByRole('link', { name: 'Visita vie 30 · 17:00' })
    expect(enlace).toHaveAttribute('href', '/visits/v-1')
    expect(screen.queryByRole('button', { name: 'Agendar visita' })).not.toBeInTheDocument()
  })

  it('MercadoLibre sin contacto lo dice en vez de pedir revisar', async () => {
    montar({ inicial: periodo([c({ portal: 'mercadolibre', telefono: null, nombre: null, accion: 'pedir_telefono' })]) })
    expect(await screen.findByText('MercadoLibre no comparte el contacto')).toBeInTheDocument()
    expect(screen.getByText('Pregunta en MercadoLibre')).toBeInTheDocument()
  })

  it('tocar la tarjeta "Sin propiedad identificada" filtra al instante y queda en la dirección', async () => {
    montar({ inicial: periodo([c({ id: 'a' }), c({ id: 'b', nombre: 'Sin prop', property_id: null, propiedad: null, accion: 'elegir_propiedad' })]) })
    await userEvent.click(await screen.findByRole('button', { name: /Sin propiedad identificada/ }))
    expect(window.location.search).toContain('propiedad=sin')
    await waitFor(() => expect(screen.queryByText('Martina Gómez')).not.toBeInTheDocument())
    expect(screen.getByText('Sin prop')).toBeInTheDocument()
  })

  it('la tarjeta activa queda marcada y tocarla de nuevo saca el filtro', async () => {
    montar({ url: 'estado=sin_visita' })
    const tarjeta = await screen.findByRole('button', { name: /Sin visita todavía/ })
    expect(tarjeta).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(tarjeta)
    expect(window.location.search).not.toContain('estado=')
  })

  it('el selector de propiedad: "⚠ Sin propiedad identificada" primero después de "Todas", con conteo', async () => {
    montar({ inicial: periodo([
      c({ id: 'a' }), c({ id: 'b', property_id: null, propiedad: null }), c({ id: 'c', property_id: null, propiedad: null, portal: 'argenprop' }),
    ]) })
    const select = await screen.findByRole('combobox', { name: 'Propiedad' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todas', '⚠ Sin propiedad identificada (2)', 'Entre Ríos 2333 (1)',
    ])
    const portal = screen.getByRole('combobox', { name: 'Portal' })
    expect(within(portal).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos', 'ZonaProp (2)', 'Argenprop (1)'])
  })

  it('el asesor no ve el selector de asesor', async () => {
    montar({ rol: 'asesor' })
    await screen.findByRole('combobox', { name: 'Propiedad' })
    expect(screen.queryByRole('combobox', { name: 'Asesor' })).not.toBeInTheDocument()
  })

  it('quien ve todo tiene el selector de asesor con "Sin asesor"', async () => {
    montar()
    const select = await screen.findByRole('combobox', { name: 'Asesor' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos', 'Sin asesor', 'Lucas Pérez'])
  })

  it('el detalle: teléfono, lo que dejó, WhatsApp y Llamar, aviso, mensaje y otras consultas', async () => {
    montar({ inicial: periodo([
      c({ id: 'a' }),
      c({ id: 'b', telefono: '011 15 6140-0496', portal: 'argenprop', recibida_at: '2026-10-24T15:00:00Z',
        propiedad: { address: 'Av. de Los Incas 5200', neighborhood: null } }),
    ]) })
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
    montar({ inicial: periodo([c({ aviso_url: 'javascript:alert(1)' })]) })
    await userEvent.click(await screen.findByRole('button', { name: /Ver la consulta de Martina Gómez/ }))
    const detalle = await screen.findByRole('dialog')
    expect(within(detalle).queryByRole('link', { name: /Ver aviso/ })).not.toBeInTheDocument()
  })

  it('"Agendar visita" abre la ventana en modo rápido y, al agendar, vuelve a pedir el período UNA vez', async () => {
    respuestas = [periodo([c({ estado: { tipo: 'con_visita', visitaId: 'v-9', scheduled_at: '2026-10-30T20:00:00Z' } })])]
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar visita' }))
    expect(rapidoRecibido?.propiedadId).toBe(PROP)
    expect(rapidoRecibido?.rapido).toMatchObject({
      origen: 'portal', telefono: '+5491161400496', telefonoValido: true,
      persona: { tipo: 'consulta', id: 'c-1', nombre: 'Martina Gómez' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Simular agendada' }))
    expect(await screen.findByRole('heading', { name: /Visita agendada/ })).toBeInTheDocument()
    expect(pedidos).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Volver a consultas' }))
    expect(await screen.findByRole('link', { name: 'Visita vie 30 · 17:00' })).toBeInTheDocument()
    expect(pedidos).toEqual(['/api/consultas?periodo=7d'])
  })

  it('una consulta sin propiedad abre primero "¿Qué propiedad quiere ver?", no la ventana', async () => {
    montar({ inicial: periodo([c({ property_id: null, propiedad: null, accion: 'elegir_propiedad' })]) })
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar visita' }))
    expect(await screen.findByRole('heading', { name: '¿Qué propiedad quiere ver?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Seguir/ })).toBeDisabled()
    expect(rapidoRecibido).toBeNull()
  })

  it('un teléfono a revisar abre primero "Revisá el teléfono"', async () => {
    montar({ inicial: periodo([c({ telefono: '4941-0027', accion: 'revisar_telefono' })]) })
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar visita' }))
    expect(await screen.findByRole('heading', { name: 'Revisá el teléfono' })).toBeInTheDocument()
    expect(rapidoRecibido).toBeNull()
  })

  it('un período sin consultas lo dice', async () => {
    montar({ inicial: periodo([]) })
    expect(await screen.findByText('No hay consultas en este período.')).toBeInTheDocument()
  })

  it('si el servidor no pudo leer el período: el mensaje real y "Reintentar" pide una vez', async () => {
    respuestas = [periodo([c()])]
    montar({ inicial: null, errorInicial: 'No pudimos cargar las consultas' })
    expect(await screen.findByText('No pudimos cargar las consultas')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Martina Gómez')).toBeInTheDocument()
    expect(pedidos).toHaveLength(1)
  })

  it('si falla el período nuevo, se ve SOLO el error: no quedan los datos del anterior como si fueran del nuevo', async () => {
    respuestas = [null]
    montar()
    await screen.findByText('Martina Gómez')
    await userEvent.click(screen.getByRole('button', { name: '30 días' }))
    expect(await screen.findByText('No pudimos cargar las consultas')).toBeInTheDocument()
    expect(screen.queryByText('Martina Gómez')).not.toBeInTheDocument()
    // Volver al período que estaba guardado lo muestra sin pedir.
    await userEvent.click(screen.getByRole('button', { name: '7 días' }))
    expect(await screen.findByText('Martina Gómez')).toBeInTheDocument()
    expect(pedidos).toHaveLength(1)
  })

  it('si falla la actualización después de agendar, se avisa y "Reintentar" vuelve a pedir', async () => {
    respuestas = [null]
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar visita' }))
    await userEvent.click(screen.getByRole('button', { name: 'Simular agendada' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Volver a consultas' }))
    expect(await screen.findByText(/No pudimos actualizar la lista/)).toBeInTheDocument()
    expect(screen.getByText('Martina Gómez')).toBeInTheDocument()
    respuestas = [periodo([c({ estado: { tipo: 'con_visita', visitaId: 'v-9', scheduled_at: '2026-10-30T20:00:00Z' } })])]
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('link', { name: 'Visita vie 30 · 17:00' })).toBeInTheDocument()
    expect(screen.queryByText(/No pudimos actualizar la lista/)).not.toBeInTheDocument()
  })

  it('el aviso de un período cortado lo dice', async () => {
    montar({ inicial: { ...periodo([c()]), truncado: true } })
    expect(await screen.findByText(/Mostrando las 3\.000 consultas más recientes/)).toBeInTheDocument()
  })
})

describe('/consultas — avisos sin propiedad', () => {
  const conSinPropiedad = () => periodo([
    c({ id: 'a' }),
    c({ id: 'b', property_id: null, propiedad: null, aviso_codigo: '2DLPOM', accion: 'elegir_propiedad' }),
    c({ id: 'c', property_id: null, propiedad: null, aviso_codigo: '2DLPOM', accion: 'elegir_propiedad' }),
  ])

  it('admin ve «2 consultas de 1 aviso no tienen propiedad» y conecta el aviso entero en un toque', async () => {
    respuestas = [periodo([c({ id: 'a' })])]
    montar({ inicial: conSinPropiedad() })
    expect(await screen.findByText(/2 consultas de 1 aviso no tienen propiedad/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Conectar avisos' }))
    const hoja = await screen.findByRole('dialog')
    expect(await within(hoja).findByText('Departamento 2 Ambientes en Martínez')).toBeInTheDocument()
    expect(within(hoja).getByText(/26 consultas/)).toBeInTheDocument()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Conectar' }))
    // Sugerida por el barrio del título.
    expect(await screen.findByText('Sugeridas para este aviso')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Entre Ríos 2333/ }))
    expect(screen.getByText(/Se van a conectar/)).toHaveTextContent('Se van a conectar las 26 consultas de este aviso a Entre Ríos 2333')
    // Quién la muestra es obligatorio y no se completa con quien la captó.
    expect(screen.getByRole('button', { name: 'Conectar 26 consultas' })).toBeDisabled()
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Quién la muestra/ }), LUCAS)
    await userEvent.click(screen.getByRole('button', { name: 'Conectar 26 consultas' }))
    await waitFor(() => expect(posts).toEqual([{ url: '/api/consultas/avisos', body: { portal: 'zonaprop', codigo: '2DLPOM', propertyId: PROP, muestraId: LUCAS } }]))
    // La bandeja vuelve a pedir el período para mostrar las consultas ya conectadas.
    await waitFor(() => expect(pedidos).toHaveLength(1))
    expect(await screen.findByText('No quedan avisos sin propiedad. 🎉')).toBeInTheDocument()
  })

  it('con ?avisos=1 (el cartel de Inicio, la dirección vieja /avisos) llega con la hoja abierta', async () => {
    montar({ inicial: conSinPropiedad(), abrirAvisos: true, url: 'avisos=1' })
    const hoja = await screen.findByRole('dialog')
    expect(await within(hoja).findByText('Departamento 2 Ambientes en Martínez')).toBeInTheDocument()
  })

  it('el asesor con ?avisos=1 NO ve la hoja (no puede conectar)', async () => {
    montar({ rol: 'asesor', inicial: conSinPropiedad(), abrirAvisos: true, url: 'avisos=1' })
    await screen.findAllByText('Martina Gómez')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el asesor no ve el aviso de "Conectar avisos"', async () => {
    montar({ rol: 'asesor', inicial: conSinPropiedad() })
    await screen.findAllByText('Martina Gómez')
    expect(screen.queryByRole('button', { name: 'Conectar avisos' })).not.toBeInTheDocument()
  })
})

describe('/consultas — estadísticas', () => {
  it('la pestaña muestra el recorrido y las tablas, sin pedir nada', async () => {
    montar({ inicial: periodo([
      c({ id: 'a', estado: { tipo: 'con_visita', visitaId: 'v', scheduled_at: '2026-10-30T20:00:00Z' } }),
      c({ id: 'b', telefono: '+5491158234521' }),
    ]) })
    await userEvent.click(await screen.findByRole('tab', { name: 'Estadísticas' }))
    expect(screen.getByRole('region', { name: 'De la consulta a la visita' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Por portal' })).toBeInTheDocument()
    expect(screen.getByText('Personas que consultaron')).toBeInTheDocument()
    // Base chica: la conversión dice "orientativo".
    expect(within(screen.getByRole('region', { name: 'Resumen' })).getAllByText('orientativo').length).toBeGreaterThan(0)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('sin consultas: "Sin datos", nunca 0', async () => {
    montar({ inicial: periodo([]) })
    await userEvent.click(await screen.findByRole('tab', { name: 'Estadísticas' }))
    expect(within(screen.getByRole('region', { name: 'Resumen' })).getAllByText('Sin datos').length).toBeGreaterThan(3)
  })

  it('tocar una propiedad vuelve a la Bandeja filtrada por ella', async () => {
    montar()
    await userEvent.click(await screen.findByRole('tab', { name: 'Estadísticas' }))
    const porPropiedad = screen.getByRole('region', { name: 'Por propiedad' })
    await userEvent.click(within(porPropiedad).getByRole('button', { name: /Entre Ríos 2333/ }))
    expect(window.location.search).toContain(`propiedad=${PROP}`)
    expect(screen.getByRole('tab', { name: 'Bandeja' })).toHaveAttribute('aria-selected', 'true')
  })
})
