// @vitest-environment happy-dom
// Toasts con "Deshacer", marcar perdido y deshacerlo (tarea 9.7). Se espía `sonner`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ExternalToast } from 'sonner'
import type { BloqueCadencia } from '@/lib/supabase/cadencia'
import { FichaContacto } from './FichaContacto'
import { CONTACTO, actividadDePrueba, fichaDePrueba, tareaDePrueba } from './datos-prueba'
import { pedidosA, simularRed } from './red-prueba'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))
const s = vi.hoisted(() => {
  let n = 0
  const toast = vi.fn<(texto: string, opciones?: unknown) => string>(() => `t${++n}`)
  const error = vi.fn<(texto: string, opciones?: unknown) => string>(() => `e${++n}`)
  const dismiss = vi.fn()
  return { toast, error, dismiss, reiniciar: () => (n = 0) }
})
vi.mock('sonner', () => ({ toast: Object.assign(s.toast, { error: s.error, dismiss: s.dismiss }) }))

const BASE = `/api/contacts/${CONTACTO}`
const ahora = new Date('2026-11-25T13:00:00Z')
const u = () => userEvent.setup()

beforeEach(() => {
  s.toast.mockClear()
  s.error.mockClear()
  s.dismiss.mockClear()
  s.reiniciar()
})
afterEach(() => vi.unstubAllGlobals())

const cad = (c: Partial<BloqueCadencia> = {}): BloqueCadencia => ({
  aplica: true,
  tareaCreada: null,
  motivoSinTarea: 'no_corresponde',
  tareasCerradas: [],
  ofrecer: null,
  dealId: 'd-1',
  ...c,
})
const llamada = (resultado: 'no_atendio' | 'no_interesa' = 'no_atendio', id = 'a-9') =>
  actividadDePrueba({ id, kind: 'call', call_outcome: resultado, body: null, intento: 1, titulo: `Llamada 1 · ${resultado}` })

function montar(extra: Parameters<typeof simularRed>[0] = {}, ficha = fichaDePrueba()) {
  const red = simularRed({
    [`${BASE}/ficha`]: { body: ficha },
    [`${BASE}/activities`]: { body: { actividades: [actividadDePrueba()], hay_mas: false } },
    [`${BASE}/tasks`]: { body: { tareas: [tareaDePrueba()], total: 1 } },
    ...extra,
  })
  const vista = render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={() => ahora} />)
  return { red, vista }
}
const composer = () => document.getElementById('ficha-composer') as HTMLElement
const ultimoToast = () => s.toast.mock.calls[s.toast.mock.calls.length - 1] as [string, ExternalToast]
const accion = (o: ExternalToast) => o.action as { label: string; onClick: () => void }

async function guardarNoInteresa(usr: ReturnType<typeof u>) {
  await usr.click(within(composer()).getByRole('tab', { name: /Registrar llamada/ }))
  await usr.click(within(composer()).getByRole('button', { name: /no le interesa/ }))
  await usr.click(within(composer()).getByRole('button', { name: 'Guardar llamada' }))
  return screen.findByRole('status')
}

describe('un solo toast de la ficha a la vez', () => {
  it('nota y enseguida llamada: se cierra el de la nota antes de mostrar el de la llamada; el de Deshacer dura 6 s y su botón mide 44 px en táctil', async () => {
    montar({
      [`POST ${BASE}/activities`]: (_u, init) => {
        const b = JSON.parse(String(init?.body))
        return b.kind === 'note'
          ? { status: 201, body: { actividad: actividadDePrueba({ id: 'n-1' }), cadencia: null, pendiente: false } }
          : { status: 201, body: { actividad: llamada(), cadencia: cad(), pendiente: false } }
      },
    })
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    await usr.type(within(composer()).getByRole('textbox', { name: 'Nota' }), 'Algo')
    await usr.click(within(composer()).getByRole('button', { name: 'Guardar nota' }))
    await waitFor(() => expect(s.toast).toHaveBeenCalledWith('Nota guardada.', expect.anything()))
    const idNota = s.toast.mock.results[0].value
    const [, opNota] = ultimoToast()
    expect(opNota.duration).toBe(6000)
    expect(opNota.classNames?.actionButton).toContain('min-h-11')
    await usr.click(within(composer()).getByRole('tab', { name: /Registrar llamada/ }))
    await usr.click(within(composer()).getByRole('button', { name: /No atendió/ }))
    await waitFor(() => expect(s.toast).toHaveBeenCalledTimes(2))
    const ordenDismiss = s.dismiss.mock.invocationCallOrder[s.dismiss.mock.calls.findIndex(([id]) => id === idNota)]
    expect(ordenDismiss).toBeLessThan(s.toast.mock.invocationCallOrder[1])
    expect(s.toast.mock.calls[1][0]).toBe('Llamada 1 guardada.')
  })

  const guardarNota = async () => {
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    await usr.type(within(composer()).getByRole('textbox', { name: 'Nota' }), 'Algo')
    await usr.click(within(composer()).getByRole('button', { name: 'Guardar nota' }))
    await waitFor(() => expect(s.toast).toHaveBeenCalledTimes(1))
    return { usr, id: s.toast.mock.results[0].value }
  }
  const notaGuardada = { [`POST ${BASE}/activities`]: { status: 201, body: { actividad: actividadDePrueba({ id: 'n-1' }), cadencia: null, pendiente: false } } }

  it('al abrir la hoja "+" se cierra el toast a la vista', async () => {
    montar(notaGuardada)
    const { usr, id } = await guardarNota()
    await usr.click(screen.getByRole('button', { name: 'Agregar nota o registrar llamada' }))
    expect(s.dismiss).toHaveBeenCalledWith(id)
  })

  it('al salir de la ficha (desmontarla) se cierra el toast a la vista', async () => {
    const { vista } = montar(notaGuardada)
    const { id } = await guardarNota()
    s.dismiss.mockClear()
    vista.unmount()
    expect(s.dismiss).toHaveBeenCalledWith(id)
  })
})

describe('Deshacer de una llamada', () => {
  it('desde el toast: anula, la ficha vuelve a pedir tareas y persona, y dice "Listo, se deshizo."', async () => {
    const { red } = montar({
      [`POST ${BASE}/activities`]: { status: 201, body: { actividad: llamada(), cadencia: cad({ motivoSinTarea: null, tareaCreada: { id: 't', title: 'Llamada 2 a [TEST] Marcela Ibáñez', due_date: '2026-11-26', due_time: '09:00', channel: 'call' } }), pendiente: false } },
      [`PATCH ${BASE}/activities/a-9`]: { body: { ok: true, tareas: { descartadas: 1, reabiertas: 1 } } },
    })
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    await usr.click(within(composer()).getByRole('tab', { name: /Registrar llamada/ }))
    await usr.click(within(composer()).getByRole('button', { name: /No atendió/ }))
    await waitFor(() => expect(s.toast).toHaveBeenCalledWith('Llamada 1 guardada. Se agendó Llamada 2 para mañana 9:00.', expect.anything()))
    const tareasAntes = pedidosA(red, '/tasks').length
    const fichaAntes = pedidosA(red, '/ficha').length
    await act(async () => accion(ultimoToast()[1]).onClick())
    await waitFor(() => expect(s.toast).toHaveBeenLastCalledWith('Listo, se deshizo.', undefined))
    expect(JSON.parse(String(pedidosA(red, '/activities/a-9', 'PATCH')[0][1]?.body))).toEqual({ accion: 'anular' })
    expect(pedidosA(red, '/tasks').length).toBeGreaterThan(tareasAntes)
    expect(pedidosA(red, '/ficha').length).toBeGreaterThan(fichaAntes)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('si anular responde 500, ofrece reintentar', async () => {
    montar({
      [`POST ${BASE}/activities`]: { status: 201, body: { actividad: llamada(), cadencia: cad(), pendiente: false } },
      [`PATCH ${BASE}/activities/a-9`]: { status: 500, body: { error: 'Se anuló, pero no se pudieron deshacer sus tareas. Probá de nuevo.' } },
    })
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    await usr.click(within(composer()).getByRole('tab', { name: /Registrar llamada/ }))
    await usr.click(within(composer()).getByRole('button', { name: /No atendió/ }))
    await waitFor(() => expect(s.toast).toHaveBeenCalled())
    await act(async () => accion(ultimoToast()[1]).onClick())
    await waitFor(() => expect(s.error).toHaveBeenCalled())
    const [texto, op] = s.error.mock.calls[0] as [string, ExternalToast]
    expect(texto).toContain('Probá de nuevo')
    expect(accion(op).label).toBe('Reintentar')
  })
})

describe('Marcar proceso como perdido', () => {
  const ficha = fichaDePrueba()
  it('desde el aviso: toast con su descripción y Deshacer; la ficha se vuelve a pedir y las tareas no se tocan', async () => {
    const { red } = montar({
      [`POST ${BASE}/activities`]: { status: 201, body: { actividad: llamada('no_interesa'), cadencia: cad({ ofrecer: 'cerrar_proceso' }), pendiente: false } },
      'POST /api/deals/d-1/advance': { body: { success: true } },
      'POST /api/deals/d-1/undo-lost': { body: { ok: true, stage: 'request' } },
    })
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    const aviso = await guardarNoInteresa(usr)
    const fichaAntes = pedidosA(red, '/ficha').length
    await usr.click(within(aviso).getByRole('button', { name: 'Marcar proceso como perdido' }))
    await waitFor(() => expect(s.toast).toHaveBeenCalledWith('Proceso marcado como perdido.', expect.anything()))
    const [, op] = ultimoToast()
    expect(op.description).toBe('Se puede deshacer durante 10 minutos desde «Procesos» (en el celular, pestaña Tareas).')
    expect(op.duration).toBe(6000)
    expect(JSON.parse(String(pedidosA(red, '/advance', 'POST')[0][1]?.body))).toEqual({ stage: 'lost' })
    await waitFor(() => expect(pedidosA(red, '/ficha').length).toBeGreaterThan(fichaAntes))
    // "Las tareas no se cierran solas": la Llamada 2 sigue, con el mismo número, y no se llamó a ninguna ruta de tareas.
    expect(within(document.querySelector('[data-bloque="tareas"]') as HTMLElement).getByText('Llamada 2 a [TEST] Marcela Ibáñez')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Tareas/ })).toHaveTextContent('Tareas · 1')
    expect(red.mock.calls.some(([url]) => String(url).startsWith('/api/tasks'))).toBe(false)
    // Deshacer desde el toast: undo-lost y la ficha se vuelve a pedir.
    const fichaAntesDeshacer = pedidosA(red, '/ficha').length
    await act(async () => accion(op).onClick())
    await waitFor(() => expect(pedidosA(red, '/undo-lost', 'POST')).toHaveLength(1))
    await waitFor(() => expect(pedidosA(red, '/ficha').length).toBeGreaterThan(fichaAntesDeshacer))
  })

  it('un proceso en Coordinada con día y hora suma " Se quitó la tasación agendada."', async () => {
    montar(
      {
        [`POST ${BASE}/activities`]: { status: 201, body: { actividad: llamada('no_interesa'), cadencia: cad({ ofrecer: 'cerrar_proceso' }), pendiente: false } },
        'POST /api/deals/d-1/advance': { body: { success: true } },
      },
      { ...ficha, tasacionesAgendadas: [{ dealId: 'd-1', fecha: '2026-11-27', hora: '10:00:00', direccion: 'Bacacay 2450', asesor: null }] },
    )
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    const aviso = await guardarNoInteresa(usr)
    await usr.click(within(aviso).getByRole('button', { name: 'Marcar proceso como perdido' }))
    await waitFor(() => expect(s.toast).toHaveBeenCalledWith('Proceso marcado como perdido. Se quitó la tasación agendada.', expect.anything()))
  })

  it.each([409, 500])('si el servidor responde %i, lo dice y el aviso queda como estaba', async (status) => {
    montar({
      [`POST ${BASE}/activities`]: { status: 201, body: { actividad: llamada('no_interesa'), cadencia: cad({ ofrecer: 'cerrar_proceso' }), pendiente: false } },
      'POST /api/deals/d-1/advance': { status, body: { error: 'Error del servidor' } },
    })
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    const aviso = await guardarNoInteresa(usr)
    await usr.click(within(aviso).getByRole('button', { name: 'Marcar proceso como perdido' }))
    await waitFor(() => expect(s.error).toHaveBeenCalled())
    expect(String(s.error.mock.calls[0][0])).toContain('No se pudo marcar el proceso como perdido')
    expect(screen.getByRole('status')).toHaveTextContent('El proceso sigue abierto.')
    expect(within(screen.getByRole('status')).getByRole('button', { name: 'Dejarlo abierto' })).toBeInTheDocument()
  })

  it('"Dejarlo abierto" cierra el aviso sin llamar a nada', async () => {
    const { red } = montar({
      [`POST ${BASE}/activities`]: { status: 201, body: { actividad: llamada('no_interesa'), cadencia: cad({ ofrecer: 'cerrar_proceso' }), pendiente: false } },
    })
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    const aviso = await guardarNoInteresa(usr)
    await usr.click(within(aviso).getByRole('button', { name: 'Dejarlo abierto' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(pedidosA(red, '/advance', 'POST')).toHaveLength(0)
  })
})
