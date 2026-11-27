// @vitest-environment happy-dom
// Inicio por rol (crm-inicio, D5). Las reglas de cada bloque viven en lib/crm/inicio.test.ts
// y la lectura en lib/supabase/inicio.test.ts: acá, lo que ve cada rol, el orden de lectura,
// "Registrar", solo lectura, bloques vacíos y un bloque que falla sin tapar a los demás.
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Inicio } from './Inicio'

const toastes = vi.hoisted(() => ({ toast: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(toastes.toast, { error: toastes.error }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))
vi.mock('@/components/inbox/UnidentifiedBanner', () => ({ UnidentifiedBanner: () => <div data-testid="cartel-avisos" /> }))

const persona = (o: Record<string, unknown> = {}) => ({ procesoId: 'd1', contactoId: 'c1', nombre: 'Marcela Ibáñez', telefono: '1155550142', propiedad: 'Depto · Yatay 540', ...o })
const llamar = (o: Record<string, unknown> = {}) => ({
  ...persona(o), llamada: 'Llamada 1', registrado: 'Se registró hoy 10:12', estado: { texto: 'Espera hace 28 min', tipo: 'espera' }, anterior: null, ...o,
})
const tarea = (id: string, titulo: string, o: Record<string, unknown> = {}) => ({
  id, deal_id: 'd9', title: titulo, tipo: 'mensaje', due_date: '2026-12-02', due_time: '11:00', todoElDia: false,
  vencimiento: { texto: 'Hoy 11:00', estado: 'hoy' }, enlace: '/contacts/c9', contacto: { id: 'c9', nombre: 'Rubén' },
  asignado: { id: 'u1', nombre: 'Paula' }, ...o,
})
const ok = <T,>(datos: T) => ({ ok: true, datos })
const numeros = ok({ solicitudes: 3, llamadas: 7, agendadas: 2, hasta: '10:40' })

function respuesta(rol: string, bloques: Record<string, unknown>, saludo = 'Hola, Paula') {
  return { rol, saludo, fecha: 'Miércoles 2 de diciembre · 10:40', bloques }
}

const pedidos: { url: string; init?: RequestInit }[] = []
function red(cuerpo: () => unknown, otras: (url: string) => unknown = () => ({ success: true })) {
  pedidos.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    pedidos.push({ url, init })
    const body = url === '/api/inicio' ? cuerpo() : otras(url)
    return new Response(JSON.stringify(body), { status: 200 })
  }))
}
afterEach(() => {
  vi.unstubAllGlobals()
  toastes.toast.mockReset()
})

const bloques = (c: HTMLElement) => [...c.querySelectorAll('[data-bloque]')].map((x) => x.getAttribute('data-bloque'))

describe('Inicio', () => {
  it('coordinación: cola, sin respuesta, sin próximo paso; después tareas, tasaciones y números (en ese orden del DOM)', async () => {
    red(() => respuesta('coordinacion', {
      paraLlamar: ok([llamar()]),
      sinRespuesta: ok([{ ...persona({ procesoId: 'g', contactoId: 'cg', nombre: 'Gustavo' }), linea: 'WhatsApp enviado hace 2 días · 2 llamadas sin atender', registrado: 'Se registró 26 nov' }]),
      sinProximo: ok([{ ...persona({ procesoId: 's', contactoId: 'cs', nombre: 'Sofía' }), linea: 'Sin tarea pendiente · último contacto hace 4 días · 1 llamada', registrado: 'Se registró 27 nov' }]),
      tareas: ok({ hoy: [tarea('t1', 'Mandar fotos a Rubén')], manana: [] }),
      tasaciones: ok([{ procesoId: 'x', contactoId: 'cx', nombre: 'Laura', dia: 'Mañana', hora: '10:00', direccion: 'Gaona 1200', asesor: 'Tomás' }]),
      numeros,
    }))
    const { container } = render(<Inicio rolUsuario="coordinador" />)
    expect(await screen.findByRole('heading', { name: 'Hola, Paula' })).toBeInTheDocument()
    expect(bloques(container)).toEqual(['para-llamar', 'sin-respuesta', 'sin-proximo', 'tareas', 'tasaciones', 'numeros'])
    expect(container.querySelector('[style*="order"]')).toBeNull()
    expect(screen.getByTestId('cartel-avisos')).toBeInTheDocument()

    const cola = container.querySelector('[data-bloque="para-llamar"]') as HTMLElement
    expect(within(cola).getByRole('link', { name: 'Llamar a Marcela Ibáñez al 11 5555-0142' })).toHaveAttribute('href', 'tel:+5491155550142')
    expect(within(cola).getByRole('link', { name: 'Registrar la llamada a Marcela Ibáñez' })).toHaveAttribute('href', '/contacts/c1?registrar=1')
    expect(within(cola).getByText('Espera hace 28 min')).toBeInTheDocument()
    expect(screen.getByText('Sin tarea pendiente · último contacto hace 4 días · 1 llamada')).toBeInTheDocument()
    expect(screen.getByText('Hoy, hasta las 10:40')).toBeInTheDocument()
  })

  it('coordinación: "Tareas de hoy", "Sin respuesta", "Sin próximo paso" y "Tasaciones" vacíos no se muestran; la cola vacía sí, con su texto', async () => {
    red(() => respuesta('coordinacion', {
      paraLlamar: ok([]), sinRespuesta: ok([]), sinProximo: ok([]), tareas: ok({ hoy: [], manana: [] }), tasaciones: ok([]), numeros,
    }))
    const { container } = render(<Inicio rolUsuario="coordinador" />)
    expect(await screen.findByText('Nadie para llamar ahora')).toBeInTheDocument()
    expect(bloques(container)).toEqual(['para-llamar', 'numeros'])
  })

  it('un bloque que falla muestra "Reintentar" sin tapar a los demás, y reintentar vuelve a pedir', async () => {
    red(() => respuesta('coordinacion', { paraLlamar: { ok: false }, sinRespuesta: ok([]), sinProximo: ok([]), tareas: ok({ hoy: [], manana: [] }), tasaciones: ok([]), numeros }))
    render(<Inicio rolUsuario="coordinador" />)
    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument()
    expect(screen.getByText('Hoy, hasta las 10:40')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }))
    await waitFor(() => expect(pedidos.filter((p) => p.url === '/api/inicio')).toHaveLength(2))
  })

  it('dueño: todo de solo lectura (sin llamar, registrar ni tildar) y con sus dos bloques propios', async () => {
    red(() => respuesta('dueno', {
      leadsSinContacto: ok([{ ...persona(), espera: 'Espera hace 28 min · la llama la coordinación', registrado: 'Se registró hoy 10:12' }]),
      tiempoMedio: ok({ n: 4, sinLlamar: 1, reloj: '2 h', habiles: '1 h 30 min', pocos: true }),
      paraLlamar: ok([llamar()]), sinRespuesta: ok([]), sinProximo: ok([]),
      tareas: ok({ hoy: [tarea('t1', 'Mandar fotos a Rubén')], manana: [] }), tasaciones: ok([]), numeros,
    }, 'Inicio · vista del dueño'))
    const { container } = render(<Inicio rolUsuario="dueno" />)
    expect(await screen.findByRole('heading', { name: 'Inicio · vista del dueño' })).toBeInTheDocument()
    expect(bloques(container)).toEqual(['leads-sin-contacto', 'para-llamar', 'tiempo-medio', 'tareas', 'numeros'])
    expect(screen.queryByRole('link', { name: /^Llamar a/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Registrar/ })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getAllByText('Solo lectura').length).toBeGreaterThan(0)
    expect(screen.getByText(/Pocos casos\./)).toBeInTheDocument()
    expect(screen.getByText(/Otro 1 todavía sin llamar no entra en el promedio/)).toBeInTheDocument()
  })

  it('asesor: tareas, procesos y visitas; sin cartel de avisos; "Todo al día" si no hay tareas', async () => {
    red(() => respuesta('asesor', {
      tareas: ok({ hoy: [], manana: [] }),
      procesos: ok([{ ...persona(), etapa: 'Visita realizada', texto: 'Entregar la tasación: la visita fue hace 4 días.' }]),
      visitas: ok([{ id: 'visita:v1', hora: '15:00', cliente: 'Compradores', direccion: 'Av. Rivadavia 5240', enlace: '/visits/v1' }]),
    }, 'Hola, Tomás'))
    const { container } = render(<Inicio rolUsuario="asesor" />)
    expect(await screen.findByText('Todo al día')).toBeInTheDocument()
    expect(bloques(container)).toEqual(['tareas', 'procesos', 'visitas'])
    expect(screen.queryByTestId('cartel-avisos')).toBeNull()
    expect(screen.getByText('Entregar la tasación: la visita fue hace 4 días.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Visita con Compradores · Av. Rivadavia 5240/ })).toHaveAttribute('href', '/visits/v1')
  })

  it('tildar una tarea la completa en el servidor y ofrece "Deshacer"', async () => {
    red(() => respuesta('asesor', { tareas: ok({ hoy: [tarea('t1', 'Llamar a Rubén')], manana: [] }), procesos: ok([]), visitas: ok([]) }))
    render(<Inicio rolUsuario="asesor" />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Completar: Llamar a Rubén' }))
    await waitFor(() => expect(toastes.toast).toHaveBeenCalledWith('Tarea completada', expect.anything()))
    const pedido = pedidos.find((p) => p.url === '/api/tasks/t1')!
    expect(JSON.parse(String(pedido.init!.body))).toEqual({ action: 'complete' })
    await toastes.toast.mock.calls[0][1].action.onClick()
    expect(pedidos.filter((p) => p.url === '/api/tasks/t1').map((p) => JSON.parse(String(p.init!.body)).action)).toEqual(['complete', 'reopen'])
  })

  it('si el Inicio entero no carga, dice que falló y se puede reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 504 })))
    render(<Inicio rolUsuario="coordinador" />)
    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument()
  })
})
