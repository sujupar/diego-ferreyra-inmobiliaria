// @vitest-environment happy-dom
// La hoja del "+" en la vista de una columna (tarea 10.3).
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FichaContacto } from './FichaContacto'
import { CONTACTO, actividadDePrueba, fichaDePrueba, tareaDePrueba, lineaDePrueba } from './datos-prueba'
import { pedidosA, simularRed } from './red-prueba'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id'), { error: vi.fn(() => 'e'), dismiss: vi.fn() }) }))
afterEach(() => vi.unstubAllGlobals())

const BASE = `/api/contacts/${CONTACTO}`
const ahora = new Date('2026-11-25T13:00:00Z')
const llamada = actividadDePrueba({ id: 'a-9', kind: 'call', call_outcome: 'no_atendio', body: null, intento: 1, titulo: 'Llamada 1 · No atendió', occurred_at: '2026-11-25T13:00:00Z' })

function montar() {
  let guardada = false
  const red = simularRed({
    [`${BASE}/ficha`]: { body: fichaDePrueba() },
    [`${BASE}/activities`]: () => ({ body: { items: lineaDePrueba(guardada ? [llamada, actividadDePrueba()] : [actividadDePrueba()]), hay_mas: false } }),
    [`${BASE}/tasks`]: { body: { tareas: [tareaDePrueba()], total: 1 } },
    [`POST ${BASE}/activities`]: () => (
      (guardada = true),
      {
        status: 201,
        body: {
          actividad: llamada,
          cadencia: {
            aplica: true,
            tareaCreada: { id: 't-2', title: 'Llamada 2 a [TEST] Marcela Ibáñez', due_date: '2026-11-26', due_time: '09:00', channel: 'call' },
            motivoSinTarea: null,
            tareasCerradas: [],
            ofrecer: null,
            dealId: 'd-1',
          },
          pendiente: false,
        },
      }
    ),
  })
  render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={() => ahora} />)
  return red
}
const hoja = () => screen.getByRole('dialog')
const titulo = () => within(hoja()).getByRole('heading').textContent
const abrir = async (usr: ReturnType<typeof userEvent.setup>) => {
  await usr.click(await screen.findByRole('button', { name: 'Agregar nota o registrar llamada' }))
  return hoja()
}

describe('HojaAgregar', () => {
  it('abre en "Agregar"; entra a "Registrar llamada" con el foco en "No atendió"; "Volver" regresa al menú', async () => {
    montar()
    const usr = userEvent.setup()
    await abrir(usr)
    expect(titulo()).toBe('Agregar')
    await usr.click(within(hoja()).getByRole('button', { name: /Registrar llamada/ }))
    expect(titulo()).toBe('Registrar llamada')
    expect(document.activeElement).toHaveTextContent('No atendió')
    await usr.click(within(hoja()).getByRole('button', { name: 'Volver' }))
    expect(titulo()).toBe('Agregar')
    expect(document.activeElement).toHaveTextContent('Registrar llamada')
  })

  it('"Nota" deja el cursor en el campo dentro del mismo toque, y "Volver" no pierde lo escrito', async () => {
    montar()
    const usr = userEvent.setup()
    await abrir(usr)
    await usr.click(within(hoja()).getByRole('button', { name: /^Nota/ }))
    expect(titulo()).toBe('Nota')
    const campo = within(hoja()).getByRole('textbox', { name: 'Nota' })
    expect(document.activeElement).toBe(campo)
    await usr.type(campo, 'Algo para acordarse')
    await usr.click(within(hoja()).getByRole('button', { name: 'Volver' }))
    await usr.click(within(hoja()).getByRole('button', { name: /^Nota/ }))
    expect(within(hoja()).getByRole('textbox', { name: 'Nota' })).toHaveValue('Algo para acordarse')
  })

  it('cerrar estando en "Nota" y reabrir vuelve al menú', async () => {
    montar()
    const usr = userEvent.setup()
    await abrir(usr)
    await usr.click(within(hoja()).getByRole('button', { name: /^Nota/ }))
    await usr.click(within(hoja()).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await abrir(usr)
    expect(titulo()).toBe('Agregar')
  })

  it('"+" → "Registrar llamada" → "No atendió": tres toques; la hoja se cierra, Actividad, filtro Todo, registro primero y resaltado', async () => {
    const red = montar()
    const usr = userEvent.setup()
    // Partimos desde otra pestaña y otro filtro para ver que vuelven.
    await usr.click(await screen.findByRole('tab', { name: /Datos/ }))
    await usr.click(screen.getByRole('button', { name: 'Notas' }))
    await abrir(usr) // 1
    await usr.click(within(hoja()).getByRole('button', { name: /Registrar llamada/ })) // 2
    await usr.click(within(hoja()).getByRole('button', { name: /No atendió/ })) // 3
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(pedidosA(red, '/activities', 'POST')).toHaveLength(1)
    expect(screen.getByRole('tab', { name: /Actividad/ })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true'))
    const primero = await waitFor(() => {
      const li = document.querySelector('[data-actividad]') as HTMLElement
      expect(li).toHaveAttribute('data-actividad', 'a-9')
      return li
    })
    expect(primero).toHaveClass('ficha-resaltado')
  })

  it('"Ver en Tareas" del aviso cambia a la pestaña Tareas', async () => {
    montar()
    const usr = userEvent.setup()
    await abrir(usr)
    await usr.click(within(hoja()).getByRole('button', { name: /Registrar llamada/ }))
    await usr.click(within(hoja()).getByRole('button', { name: /No atendió/ }))
    const aviso = await screen.findByRole('status')
    await usr.click(within(aviso).getByRole('button', { name: 'Ver en Tareas' }))
    expect(screen.getByRole('tab', { name: /Tareas/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('ficha-p-tareas')).toHaveAttribute('data-activa', 'true')
  })

  it('en la hoja "Guardar llamada" va pegado al pie', async () => {
    montar()
    const usr = userEvent.setup()
    await abrir(usr)
    await usr.click(within(hoja()).getByRole('button', { name: /Registrar llamada/ }))
    await usr.click(within(hoja()).getByRole('button', { name: /volver a llamar/ }))
    expect(within(hoja()).getByRole('button', { name: 'Guardar llamada' })).toHaveClass('sticky', 'bottom-0')
  })
})
