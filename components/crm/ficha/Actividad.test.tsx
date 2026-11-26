// @vitest-environment happy-dom
// La actividad: filtros, vacíos, "Ver más", el renglón y el menú "⋯" (tarea 9.5).
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Actividad } from './Actividad'
import { ItemActividad } from './ItemActividad'
import { CONTACTO, actividadDePrueba, fichaDePrueba, tareaDePrueba } from './datos-prueba'
import { pedidosA, simularRed } from './red-prueba'
import { FichaContacto } from './FichaContacto'
import type { BloqueActividad, FiltroActividad } from './use-ficha'
import type { ActividadDeFicha } from '@/lib/crm/tipos'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id'), { error: vi.fn(() => 'e'), dismiss: vi.fn() }) }))

const ahora = new Date('2026-11-25T13:00:00Z')
const BASE = `/api/contacts/${CONTACTO}`
const u = () => userEvent.setup()
afterEach(() => vi.unstubAllGlobals())

const bloque = (c: Partial<BloqueActividad> = {}): BloqueActividad => ({
  estado: 'ok',
  items: [],
  hayMas: false,
  filtro: 'todo',
  cargandoMas: false,
  errorMas: null,
  ...c,
})

function dibujarActividad(b: BloqueActividad, extra: Partial<Parameters<typeof Actividad>[0]> = {}) {
  const props = {
    onFiltrar: vi.fn(),
    onReintentar: vi.fn(),
    onVerMas: vi.fn(),
    onEditada: vi.fn(),
    onAnular: vi.fn(async () => true),
    onAbrirLlamada: vi.fn(),
    onAbrirNota: vi.fn(),
    ...extra,
  }
  render(<Actividad bloque={b} contactoId={CONTACTO} ahora={ahora} nuevoId={null} {...props} />)
  return props
}

describe('Actividad: vacíos por filtro', () => {
  it('Llamadas: texto y "Registrar llamada" que abre el formulario', async () => {
    const p = dibujarActividad(bloque({ filtro: 'llamadas' }))
    expect(screen.getByText('Todavía no hay llamadas')).toBeInTheDocument()
    expect(screen.getByText('Cuando registres una, aparece acá con su resultado.')).toBeInTheDocument()
    await u().click(screen.getByRole('button', { name: 'Registrar llamada' }))
    expect(p.onAbrirLlamada).toHaveBeenCalled()
  })
  it('Notas: "Todavía no hay notas" y "Escribir una nota"', async () => {
    const p = dibujarActividad(bloque({ filtro: 'notas' }))
    expect(screen.getByText('Todavía no hay notas')).toBeInTheDocument()
    await u().click(screen.getByRole('button', { name: 'Escribir una nota' }))
    expect(p.onAbrirNota).toHaveBeenCalled()
  })
  it.each<FiltroActividad>(['actividad', 'todo'])('%s: "Sin actividad todavía", sin lista vacía', (filtro) => {
    dibujarActividad(bloque({ filtro }))
    expect(screen.getByText('Sin actividad todavía')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })
  it('tocar un filtro lo pide', async () => {
    const p = dibujarActividad(bloque())
    await u().click(screen.getByRole('button', { name: 'Llamadas' }))
    expect(p.onFiltrar).toHaveBeenCalledWith('llamadas')
  })
  it('"Ver más" aparece con hay_mas y lo pide', async () => {
    const p = dibujarActividad(bloque({ items: [actividadDePrueba()], hayMas: true }))
    await u().click(screen.getByRole('button', { name: 'Ver más' }))
    expect(p.onVerMas).toHaveBeenCalled()
  })
})

describe('Actividad en la ficha: filtro y "Ver más" van al servidor', () => {
  it('el filtro viaja como ?filtro= y "Ver más" pide con ?antes= la fecha del último', async () => {
    const red = simularRed({
      [`${BASE}/ficha`]: { body: fichaDePrueba() },
      [`${BASE}/activities`]: (url) =>
        url.includes('antes=')
          ? { body: { actividades: [actividadDePrueba({ id: 'viejo', body: 'Registro viejo', occurred_at: '2026-10-01T13:00:00Z' })], hay_mas: false } }
          : { body: { actividades: [actividadDePrueba()], hay_mas: true } },
      [`${BASE}/tasks`]: { body: { tareas: [tareaDePrueba()], total: 1 } },
    })
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={() => ahora} />)
    const usr = u()
    await usr.click(await screen.findByRole('button', { name: 'Ver más' }))
    expect(await screen.findByText('Registro viejo')).toBeInTheDocument()
    expect(screen.getByText('Prefiere que la llamen a la tarde')).toBeInTheDocument()
    const conAntes = pedidosA(red, '/activities').find(([url]) => String(url).includes('antes='))
    expect(String(conAntes?.[0])).toContain(`antes=${encodeURIComponent('2026-11-24T13:15:00Z')}`)
    await usr.click(screen.getByRole('button', { name: 'Notas' }))
    await waitFor(() => expect(pedidosA(red, '/activities').some(([url]) => String(url).includes('filtro=notas'))).toBe(true))
  })
})

function item(a: ActividadDeFicha, extra: Partial<Parameters<typeof ItemActividad>[0]> = {}) {
  const props = { onEditada: vi.fn(), onAnular: vi.fn(async () => true), ...extra }
  render(
    <ul>
      <ItemActividad actividad={a} ahora={ahora} contactoId={CONTACTO} {...props} />
    </ul>,
  )
  return props
}

describe('ItemActividad: el renglón', () => {
  it('una llamada se lee "Llamada 1 ·" + "No atendió" con ícono, autor y "ayer"', () => {
    item(actividadDePrueba({ kind: 'call', call_outcome: 'no_atendio', body: null, intento: 1, titulo: 'Llamada 1 · No atendió' }))
    const li = screen.getByRole('listitem')
    expect(li).toHaveTextContent('Llamada 1 ·')
    expect(within(li).getByText('No atendió')).toHaveAttribute('data-resultado', 'no_atendio')
    expect(li).toHaveTextContent('Paula')
    expect(within(li).getByRole('button', { name: /ayer/ })).toBeInTheDocument()
  })
  it('un título largo no lleva la clase que corta con "…" y puede ocupar dos renglones', () => {
    item(actividadDePrueba({ kind: 'call', call_outcome: 'volver_a_llamar', body: null, intento: 3, titulo: 'Llamada 3 · Volver a llamar' }))
    const t = document.querySelector('[data-titulo]') as HTMLElement
    expect(t.className).not.toContain('truncate')
    expect(t.className).toContain('flex-wrap')
    expect(t.innerHTML).not.toContain('truncate')
  })
  it('tocar cualquier parte del renglón muestra la fecha exacta y otro toque vuelve a la relativa', async () => {
    item(actividadDePrueba())
    const usr = u()
    await usr.click(screen.getByText('Prefiere que la llamen a la tarde'))
    expect(screen.getByText('mar 24 nov 2026, 10:15')).toBeInTheDocument()
    await usr.click(screen.getByText('Paula'))
    expect(screen.getByText('ayer')).toBeInTheDocument()
  })
  it('la tarea agendada sola se ve dentro del registro', () => {
    item(
      actividadDePrueba({
        kind: 'call',
        call_outcome: 'no_atendio',
        body: null,
        intento: 1,
        tarea_creada: { id: 't', title: 'Llamada 2 a María', due_date: '2026-11-26', due_time: '09:00:00' },
      }),
    )
    expect(screen.getByText(/Tarea creada sola · Llamada 2 a María, mañana 9:00/)).toBeInTheDocument()
  })
})

describe('ItemActividad: menú "⋯" según quién mira', () => {
  const abrirMenu = async () => {
    await u().click(screen.getByRole('button', { name: 'Más acciones' }))
    return screen.findByRole('menu')
  }
  it('el autor de una nota ve Editar y Borrar', async () => {
    item(actividadDePrueba())
    const m = await abrirMenu()
    expect(within(m).getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument()
    expect(within(m).getByRole('menuitem', { name: 'Borrar' })).toBeInTheDocument()
  })
  it('una coordinadora en una nota ajena ve solo Borrar', async () => {
    item(actividadDePrueba({ puede_editar: false, puede_anular: true }))
    const m = await abrirMenu()
    expect(within(m).queryByRole('menuitem', { name: 'Editar' })).toBeNull()
    expect(within(m).getByRole('menuitem', { name: 'Borrar' })).toBeInTheDocument()
  })
  it('en una llamada se ofrece Anular, nunca Editar', async () => {
    item(actividadDePrueba({ kind: 'call', call_outcome: 'agendo', puede_editar: false, puede_anular: true }))
    const m = await abrirMenu()
    expect(within(m).getByRole('menuitem', { name: 'Anular' })).toBeInTheDocument()
    expect(within(m).queryByRole('menuitem', { name: 'Editar' })).toBeNull()
  })
  it('sin permisos (la nota automática para el asesor) no hay menú', () => {
    item(actividadDePrueba({ automatic: true, puede_editar: false, puede_anular: false }))
    expect(screen.queryByRole('button', { name: 'Más acciones' })).toBeNull()
  })
})

describe('ItemActividad: editar en el lugar', () => {
  const editar = async () => {
    const usr = u()
    await usr.click(screen.getByRole('button', { name: 'Más acciones' }))
    await usr.click(await screen.findByRole('menuitem', { name: 'Editar' }))
    return { usr, campo: screen.getByRole('textbox', { name: 'Editar la nota' }) }
  }

  it('abre el campo con la nota cargada; al guardar muestra el texto nuevo y "editada"', async () => {
    simularRed({
      [`PATCH ${BASE}/activities/a-1`]: { body: { actividad: actividadDePrueba({ body: 'Mejor a la mañana', editada: true, updated_at: '2026-11-25T12:00:00Z' }) } },
    })
    let actual = actividadDePrueba()
    const { rerender } = render(
      <ul>
        <ItemActividad actividad={actual} ahora={ahora} contactoId={CONTACTO} onEditada={(a) => (actual = a)} onAnular={async () => true} />
      </ul>,
    )
    const { usr, campo } = await editar()
    expect(campo).toHaveValue('Prefiere que la llamen a la tarde')
    await usr.clear(campo)
    await usr.type(campo, 'Mejor a la mañana')
    await usr.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(actual.body).toBe('Mejor a la mañana'))
    rerender(
      <ul>
        <ItemActividad actividad={actual} ahora={ahora} contactoId={CONTACTO} onEditada={() => {}} onAnular={async () => true} />
      </ul>,
    )
    expect(screen.getByText('Mejor a la mañana')).toBeInTheDocument()
    expect(screen.getByText('editada')).toBeInTheDocument()
  })

  it('vaciarla muestra "Escribí algo para guardar la nota" y conserva el campo', async () => {
    const red = simularRed({})
    item(actividadDePrueba())
    const { usr, campo } = await editar()
    await usr.clear(campo)
    await usr.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribí algo para guardar la nota')
    expect(screen.getByRole('textbox', { name: 'Editar la nota' })).toBeInTheDocument()
    expect(red).not.toHaveBeenCalled()
  })

  it('con 2.001 caracteres avisa el límite sin perder lo escrito', async () => {
    const red = simularRed({})
    item(actividadDePrueba())
    const { usr, campo } = await editar()
    await usr.clear(campo)
    await usr.click(campo)
    await usr.paste('x'.repeat(2001))
    await usr.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('2.000 caracteres')
    expect((screen.getByRole('textbox', { name: 'Editar la nota' }) as HTMLTextAreaElement).value).toHaveLength(2001)
    expect(red).not.toHaveBeenCalled()
  })

  it('"Cancelar" deja el texto anterior y no manda nada', async () => {
    const red = simularRed({})
    item(actividadDePrueba())
    const { usr, campo } = await editar()
    await usr.type(campo, ' cambio')
    await usr.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('Prefiere que la llamen a la tarde')).toBeInTheDocument()
    expect(red).not.toHaveBeenCalled()
  })
})

describe('ItemActividad: Borrar y Anular confirman', () => {
  it('cancelar la confirmación de "Borrar" no llama a nada', async () => {
    const p = item(actividadDePrueba())
    const usr = u()
    await usr.click(screen.getByRole('button', { name: 'Más acciones' }))
    await usr.click(await screen.findByRole('menuitem', { name: 'Borrar' }))
    const d = await screen.findByRole('dialog')
    expect(d).toHaveTextContent('¿Borrar esta nota?')
    await usr.click(within(d).getByRole('button', { name: 'Cancelar' }))
    expect(p.onAnular).not.toHaveBeenCalled()
  })
  it('cancelar la confirmación de "Anular" no llama a nada; confirmar sí', async () => {
    const p = item(actividadDePrueba({ kind: 'call', call_outcome: 'no_atendio', puede_editar: false }))
    const usr = u()
    await usr.click(screen.getByRole('button', { name: 'Más acciones' }))
    await usr.click(await screen.findByRole('menuitem', { name: 'Anular' }))
    await usr.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(p.onAnular).not.toHaveBeenCalled()
    await usr.click(screen.getByRole('button', { name: 'Más acciones' }))
    await usr.click(await screen.findByRole('menuitem', { name: 'Anular' }))
    await usr.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Anular' }))
    expect(p.onAnular).toHaveBeenCalledTimes(1)
  })
})
