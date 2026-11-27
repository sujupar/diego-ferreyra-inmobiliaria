// @vitest-environment happy-dom
// Pendientes (crm-tareas-y-campanita). Hereda las garantías de las pruebas de la página
// vieja: un fallo no es "al día", la fila no sale si el servidor no confirmó, el cartel de
// visitas muestra el total real. Las reglas de grupo y día de Argentina viven en
// lib/tareas/agenda.test.ts y lib/supabase/agenda-tareas.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import TasksPage from '@/app/(dashboard)/tasks/page'
import { Pendientes, tituloDe } from './Pendientes'

const toastes = vi.hoisted(() => ({ toast: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(toastes.toast, { error: toastes.error }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))
vi.mock('@/components/inbox/UnidentifiedBanner', () => ({ UnidentifiedBanner: () => null }))

const t = (id: string, titulo: string, o: Record<string, unknown> = {}) => ({
  id, title: titulo, tipo: 'llamada', due_date: '2026-11-24', due_time: '10:30', todoElDia: false,
  vencimiento: { texto: 'Vencida hace 30 min', estado: 'vencida' }, enlace: '/contacts/c1',
  contacto: { id: 'c1', nombre: 'Marcela' }, asignado: { id: 'u2', nombre: 'Tomás' }, ...o,
})
function agenda(o: Record<string, unknown> = {}) {
  return {
    grupos: { vencidas: [t('a', 'Llamar a Marcela')], hoy: [], proximas: [t('b', 'Visita', { tipo: 'visita', vencimiento: { texto: 'Mañana 9:00', estado: 'proxima' } })] },
    sinFecha: { total: 30, quedan: 5, items: Array.from({ length: 25 }, (_, i) => t(`s${i}`, `Sin fecha ${i}`, { due_date: null, due_time: null, vencimiento: { texto: 'Sin fecha', estado: 'sinfecha' } })) },
    cantidades: { vencidas: 1, hoy: 0, proximas: 1, sin_fecha: 30 },
    porTipo: { llamada: 31, visita: 1 },
    resumen: '1 vencida · 1 próxima · 30 sin fecha',
    de: 'mias',
    personas: [{ id: 'u2', nombre: 'Tomás' }],
    ...o,
  }
}

type Ruta = (url: string, init?: RequestInit) => { status?: number; body: unknown }
const pedidos: { url: string; init?: RequestInit }[] = []
function red(ruta: Ruta) {
  pedidos.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    pedidos.push({ url, init })
    const r = ruta(url, init)
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }))
}
afterEach(() => vi.unstubAllGlobals())
const agendaPedidos = () => pedidos.filter((p) => p.url.startsWith('/api/tasks/agenda'))

describe('Pendientes', () => {
  it('títulos según de quién', () => {
    expect(tituloDe('mias', null)).toBe('Mis pendientes')
    expect(tituloDe('todos', null)).toBe('Pendientes del equipo')
    expect(tituloDe('u2', [{ id: 'u2', nombre: 'Tomás' }])).toBe('Pendientes de Tomás')
  })

  it('resumen exacto, grupos con su número y "Sin fecha" plegado con la nota', async () => {
    red(() => ({ body: agenda() }))
    render(<Pendientes />)
    expect(await screen.findByText('1 vencida · 1 próxima · 30 sin fecha')).toBeInTheDocument()
    expect(screen.getByText(/Vencidas · 1/)).toBeInTheDocument()
    expect(screen.getByText(/Próximas · 1/)).toBeInTheDocument()
    expect(screen.queryByText(/Hoy · /)).toBeNull()
    expect(screen.getByText('Sin fecha · 30')).toBeInTheDocument()
    expect(screen.getByText(/Nunca tuvieron fecha, así que no avisan en la campanita/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mostrar 25 más · quedan 5' })).toBeInTheDocument()
  })

  it('"Mostrar 25 más" pide desde la 25 y suma sin repetir', async () => {
    red((url) => ({ body: url.includes('sin_fecha_desde=25') ? agenda({ sinFecha: { total: 30, quedan: 0, items: Array.from({ length: 5 }, (_, i) => t(`m${i}`, `Más ${i}`, { due_date: null })) } }) : agenda() }))
    render(<Pendientes />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar 25 más · quedan 5' }))
    await screen.findByText('Más 4')
    expect(screen.queryByRole('button', { name: /Mostrar 25 más/ })).toBeNull()
  })

  it('filtros: tipo y "De quién" piden al servidor; un tipo sin tareas no se ofrece', async () => {
    red(() => ({ body: agenda() }))
    render(<Pendientes />)
    const compu = await screen.findByRole('group', { name: 'Tipo' })
    expect(within(compu).queryByRole('button', { name: /Mensaje/ })).toBeNull()
    fireEvent.click(within(compu).getByRole('button', { name: /Visita/ }))
    await waitFor(() => expect(agendaPedidos().at(-1)!.url).toContain('tipo=visita'))
    fireEvent.click(within(screen.getByRole('group', { name: 'De quién' })).getByRole('button', { name: 'Todo el equipo' }))
    await waitFor(() => expect(agendaPedidos().at(-1)!.url).toContain('de=todos'))
  })

  it('el asesor no tiene "De quién"', async () => {
    red(() => ({ body: agenda({ personas: null }) }))
    render(<Pendientes />)
    await screen.findByRole('group', { name: 'Tipo' })
    expect(screen.queryByRole('group', { name: 'De quién' })).toBeNull()
    expect(screen.queryByLabelText('Ver las tareas de')).toBeNull()
  })

  it('un fallo al listar NO es "Estás al día": dice el error y "Reintentar" vuelve a pedir', async () => {
    let falla = true
    red(() => (falla ? { status: 500, body: { error: 'x' } } : { body: agenda() }))
    render(<Pendientes />)
    expect(await screen.findByText('No se pudieron traer las tareas')).toBeInTheDocument()
    expect(screen.queryByText('Estás al día')).toBeNull()
    falla = false
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }))
    expect(await screen.findByText('Llamar a Marcela')).toBeInTheDocument()
  })

  it('un vacío de verdad dice "Estás al día"', async () => {
    red(() => ({ body: agenda({ grupos: { vencidas: [], hoy: [], proximas: [] }, sinFecha: { total: 0, quedan: 0, items: [] }, cantidades: { vencidas: 0, hoy: 0, proximas: 0, sin_fecha: 0 }, porTipo: {}, resumen: 'Nada pendiente' }) }))
    render(<Pendientes />)
    expect(await screen.findByText('Estás al día')).toBeInTheDocument()
  })

  it('completar: con 500 la tarea sigue y se avisa; con 200 ofrece "Deshacer"', async () => {
    let status = 500
    red((url) => (url === '/api/tasks/a' ? { status, body: status === 200 ? { success: true } : { error: 'No se pudo guardar el cambio. Probá de nuevo.' } } : { body: agenda() }))
    render(<Pendientes />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Completar: Llamar a Marcela' }))
    await waitFor(() => expect(toastes.error).toHaveBeenCalledWith('No se pudo guardar el cambio. Probá de nuevo.'))
    expect(screen.getByRole('checkbox', { name: 'Completar: Llamar a Marcela' })).toHaveAttribute('aria-checked', 'false')
    status = 200
    fireEvent.click(screen.getByRole('checkbox', { name: 'Completar: Llamar a Marcela' }))
    await waitFor(() => expect(toastes.toast).toHaveBeenCalledWith('Tarea completada', expect.objectContaining({ action: expect.objectContaining({ label: 'Deshacer' }) })))
  })

  it('en el celular "Posponer" es un ícono de 44 px con nombre', async () => {
    red(() => ({ body: agenda() }))
    render(<Pendientes />)
    const b = await screen.findByRole('button', { name: 'Posponer: Llamar a Marcela' })
    expect(b.className).toContain('size-11')
    expect(screen.getByRole('button', { name: 'Poner fecha: Sin fecha 0' })).toBeInTheDocument()
  })
})

describe('/tasks', () => {
  it('el cartel de visitas atrasadas muestra el total real, no el largo del lote', async () => {
    red((url) => {
      if (url === '/api/auth/me') return { body: { id: 'u1', role: 'asesor' } }
      if (url.startsWith('/api/visits')) return { body: { data: Array.from({ length: 50 }, (_, i) => ({ id: `v${i}`, direccion: `Calle ${i}`, client_name: 'X', scheduled_at: '2026-11-20T13:00:00Z' })), total: 73 } }
      return { body: agenda() }
    })
    render(<TasksPage />)
    expect(await screen.findByText('Visitas pendientes de marcar (73)')).toBeInTheDocument()
  })
})
