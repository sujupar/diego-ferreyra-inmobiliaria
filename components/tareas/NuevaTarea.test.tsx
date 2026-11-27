// @vitest-environment happy-dom
// "Nueva tarea" (crm-tareas-y-campanita): el formulario único de la maqueta.
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog'
import { ayudaDeAviso, NuevaTarea } from './NuevaTarea'

const toastes = vi.hoisted(() => ({ toast: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(toastes.toast, { error: toastes.error }) }))

// Martes 24/11 a las 22:00 de Argentina (ya es miércoles en UTC).
const RELOJ = () => new Date('2026-11-25T01:00:00Z')
const pedidos: { url: string; cuerpo: unknown }[] = []

function red(rol = 'asesor') {
  pedidos.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/me') return new Response(JSON.stringify({ id: 'u1', role: rol, full_name: 'Paula' }))
      if (url === '/api/users/assignable') return new Response(JSON.stringify({ data: [{ id: 'u2', full_name: 'Tomás' }] }))
      pedidos.push({ url, cuerpo: JSON.parse(String(init?.body ?? '{}')) })
      return new Response(JSON.stringify({ success: true, id: 't-1' }))
    }),
  )
}
afterEach(() => vi.unstubAllGlobals())

function dibujar(extra: Partial<Parameters<typeof NuevaTarea>[0]> = {}) {
  const onAbierta = vi.fn()
  render(<NuevaTarea abierta onAbierta={onAbierta} reloj={RELOJ} {...extra} />)
  return { onAbierta }
}

describe('NuevaTarea', () => {
  it('fecha y hora son controles nativos, con etiqueta y de 44 px en táctil', () => {
    red()
    dibujar()
    const dia = screen.getByLabelText('Día')
    const hora = screen.getByLabelText('Hora (opcional)')
    expect(dia).toHaveAttribute('type', 'date')
    expect(hora).toHaveAttribute('type', 'time')
    expect(dia.className).toContain('h-11')
    expect(document.querySelector('[data-fila-todo-el-dia]')!.className).toContain('min-h-11')
  })

  it('arranca hoy (en Argentina) a la próxima hora en punto, tipo Otro', () => {
    red()
    dibujar()
    expect(screen.getByLabelText('Día')).toHaveValue('2026-11-24')
    expect(screen.getByLabelText('Hora (opcional)')).toHaveValue('23:00')
    expect(screen.getByRole('button', { name: 'Otro' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('crea con canal, día y hora; a las 22 de Argentina se puede agendar para hoy', async () => {
    red()
    const { onAbierta } = dibujar({ entidad: { kind: 'contact', id: 'c-1', label: 'Marcela' } })
    fireEvent.change(screen.getByLabelText('¿Qué hay que hacer?'), { target: { value: 'Pedirle la escritura' } })
    fireEvent.click(screen.getByRole('button', { name: 'Documentación' }))
    fireEvent.click(screen.getByRole('button', { name: '✓ Crear tarea' }))
    await waitFor(() => expect(onAbierta).toHaveBeenCalledWith(false))
    expect(pedidos[0]).toEqual({
      url: '/api/tasks',
      cuerpo: { type: 'follow_up', title: 'Pedirle la escritura', channel: 'document', due_date: '2026-11-24', all_day: false, due_time: '23:00', contact_id: 'c-1' },
    })
    expect(toastes.toast).toHaveBeenCalledWith('Tarea creada · queda en «Hoy»', expect.anything())
  })

  it('sin día: queda en «Sin fecha»', async () => {
    red()
    dibujar()
    fireEvent.change(screen.getByLabelText('¿Qué hay que hacer?'), { target: { value: 'Algo' } })
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '' } })
    expect(screen.getByText('Sin día queda en «Sin fecha» y no avisa en la campanita.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '✓ Crear tarea' }))
    await waitFor(() => expect(pedidos).toHaveLength(1))
    expect(pedidos[0].cuerpo).toMatchObject({ due_date: null, all_day: true, due_time: null })
  })

  it('título vacío y hora pasada: error y no se manda nada', async () => {
    red()
    dibujar()
    fireEvent.click(screen.getByRole('button', { name: '✓ Crear tarea' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribí qué hay que hacer.')
    fireEvent.change(screen.getByLabelText('¿Qué hay que hacer?'), { target: { value: 'Algo' } })
    fireEvent.change(screen.getByLabelText('Hora (opcional)'), { target: { value: '21:00' } })
    fireEvent.click(screen.getByRole('button', { name: '✓ Crear tarea' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí un día y una hora que todavía no hayan pasado.')
    expect(pedidos).toHaveLength(0)
  })

  it('el asesor se ve como "Vos"; la coordinación elige a quién', async () => {
    red('asesor')
    const { unmount } = render(<NuevaTarea abierta onAbierta={() => {}} reloj={RELOJ} />)
    await screen.findByText('Vos (Paula)')
    unmount()
    red('coordinador')
    render(<NuevaTarea abierta onAbierta={() => {}} reloj={RELOJ} />)
    await screen.findByRole('option', { name: 'Tomás' })
    expect(screen.getByRole('option', { name: 'Yo (Paula)' })).toBeInTheDocument()
  })

  it('ayuda del aviso', () => {
    expect(ayudaDeAviso('2026-11-26', '10:30', false)).toBe('Avisa en la campanita el jue 26 nov a las 10:30.')
    expect(ayudaDeAviso('2026-11-26', '', true)).toBe('Avisa en la campanita el jue 26 nov desde las 9:00.')
  })
})

describe('AddTaskDialog (envoltorio con la firma de siempre)', () => {
  it('abre el mismo formulario desde su disparador', async () => {
    red()
    render(<AddTaskDialog />)
    fireEvent.click(screen.getByRole('button', { name: /Agregar tarea/ }))
    expect(await screen.findByLabelText('¿Qué hay que hacer?')).toBeInTheDocument()
  })
})
