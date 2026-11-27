// @vitest-environment happy-dom
// La ficha y sus tres pedidos por separado (tarea 9.2): cada bloque carga y falla solo,
// "Reintentar", el editor abierto desde `?edit=1` y la pantalla sin acceso.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FichaContacto } from './FichaContacto'
import { SinAcceso } from './Pantallas'
import { CONTACTO, actividadDePrueba, fichaDePrueba, tareaDePrueba, lineaDePrueba } from './datos-prueba'
import { simularRed, pedidosA } from './red-prueba'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))

const reloj = () => new Date('2026-11-25T13:00:00Z')
const BASE = `/api/contacts/${CONTACTO}`

function redNormal(extra: Parameters<typeof simularRed>[0] = {}) {
  return simularRed({
    [`${BASE}/ficha`]: { body: fichaDePrueba() },
    [`${BASE}/activities`]: { body: { items: lineaDePrueba([actividadDePrueba()]), hay_mas: false } },
    [`${BASE}/tasks`]: { body: { tareas: [tareaDePrueba()], total: 1 } },
    ...extra,
  })
}

const bloque = (nombre: string) => document.querySelector(`[data-bloque="${nombre}"]`) as HTMLElement

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FichaContacto: tres pedidos por separado', () => {
  it('con todo bien muestra persona, actividad y tareas', async () => {
    redNormal()
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    expect(await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })).toBeInTheDocument()
    expect(await screen.findByText('Prefiere que la llamen a la tarde')).toBeInTheDocument()
    expect(await within(bloque('tareas')).findByText('Llamada 2 a [TEST] Marcela Ibáñez')).toBeInTheDocument()
  })

  it('si cae la actividad dice "No se pudo cargar" con "Reintentar" y lo demás funciona; Reintentar la trae', async () => {
    let falla = true
    const red = redNormal({
      [`${BASE}/activities`]: () =>
        falla ? { status: 500, body: { error: 'boom' } } : { body: { items: lineaDePrueba([actividadDePrueba()]), hay_mas: false } },
    })
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    const act = await waitFor(() => {
      const b = bloque('actividad')
      expect(within(b).getByRole('alert')).toHaveTextContent('No se pudo cargar')
      return b
    })
    expect(screen.getByRole('heading', { name: '[TEST] Marcela Ibáñez' })).toBeInTheDocument()
    expect(within(bloque('tareas')).getByText('Llamada 2 a [TEST] Marcela Ibáñez')).toBeInTheDocument()
    falla = false
    await userEvent.setup().click(within(act).getByRole('button', { name: 'Reintentar' }))
    expect(await within(bloque('actividad')).findByText('Prefiere que la llamen a la tarde')).toBeInTheDocument()
    expect(pedidosA(red, '/activities').length).toBe(2)
  })

  it('una respuesta que no es JSON (504 de Netlify) también dice "No se pudo cargar", sin texto técnico', async () => {
    redNormal({ [`${BASE}/tasks`]: { status: 504, texto: '<HTML><body>Gateway Timeout</body></HTML>' } })
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    await waitFor(() => expect(within(bloque('tareas')).getByRole('alert')).toHaveTextContent('No se pudo cargar'))
    expect(document.body.textContent).not.toContain('Unexpected token')
    expect(document.body.textContent).not.toContain('Gateway')
  })

  it('mientras un pedido no responde, su bloque muestra "Cargando…" y los otros funcionan', async () => {
    let soltar: (() => void) | null = null
    redNormal({
      [`${BASE}/tasks`]: () =>
        new Promise((ok) => {
          soltar = () => ok({ body: { tareas: [tareaDePrueba()], total: 1 } })
        }),
    })
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    expect(await screen.findByText('Prefiere que la llamen a la tarde')).toBeInTheDocument()
    const t = bloque('tareas')
    expect(within(t).getByText('Cargando…')).toBeInTheDocument()
    expect(t.querySelector('[aria-busy="true"]')).not.toBeNull()
    // Sin número inventado mientras carga.
    expect(within(t).queryByText(/· \d/)).toBeNull()
    soltar!()
    expect(await within(bloque('tareas')).findByText('Llamada 2 a [TEST] Marcela Ibáñez')).toBeInTheDocument()
  })

  it('si cae la persona, cabecera y Datos dicen "No se pudo cargar" sin nombre inventado; actividad y tareas se ven', async () => {
    redNormal({ [`${BASE}/ficha`]: { status: 500, body: { error: 'x' } } })
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    await waitFor(() => {
      const cab = document.querySelector('.ficha-cab') as HTMLElement
      expect(within(cab).getByRole('alert')).toHaveTextContent('No se pudo cargar')
    })
    const datos = document.getElementById('ficha-p-datos') as HTMLElement
    expect(within(datos).getByRole('alert')).toHaveTextContent('No se pudo cargar')
    expect(within(datos).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(await screen.findByText('Prefiere que la llamen a la tarde')).toBeInTheDocument()
    expect(await within(bloque('tareas')).findByText('Llamada 2 a [TEST] Marcela Ibáñez')).toBeInTheDocument()
  })

  it('un 404 de la persona muestra "No encontramos este contacto"', async () => {
    redNormal({ [`${BASE}/ficha`]: { status: 404, body: { error: 'No encontramos este contacto' } } })
    render(<FichaContacto contactoId={CONTACTO} rol="asesor" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    expect(await screen.findByRole('heading', { name: 'No encontramos este contacto' })).toBeInTheDocument()
    expect(screen.queryByText('[TEST] Marcela Ibáñez')).toBeNull()
  })
})

describe('FichaContacto: editor desde ?edit=1', () => {
  it('abrirEditor verdadero arranca con el editor de contacto abierto', async () => {
    redNormal({ [`${BASE}`]: { body: { contact: { id: CONTACTO, full_name: '[TEST] Marcela Ibáñez' } } } })
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor reloj={reloj} />)
    expect(await screen.findByRole('dialog')).toHaveTextContent('Editar Contacto')
  })
  it('abrirEditor falso no lo abre', async () => {
    redNormal()
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('SinAcceso', () => {
  it('dice "No tenés permiso para ver contactos" sin ningún dato', () => {
    render(<SinAcceso />)
    expect(screen.getByRole('heading')).toHaveTextContent('No tenés permiso para ver contactos')
    expect(document.body.textContent).not.toContain('@')
  })
})

describe('FichaContacto: "Registrar" del Inicio (crm-inicio)', () => {
  it('con abrirLlamada arranca con "Registrar llamada" abierto y el foco en "No atendió"', async () => {
    redNormal()
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} abrirLlamada reloj={reloj} />)
    await waitFor(() => expect(document.activeElement?.textContent ?? '').toContain('No atendió'))
  })
  it('sin abrirLlamada no se abre nada', async () => {
    redNormal()
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    await screen.findByText('Línea de tiempo')
    expect(document.activeElement?.textContent ?? '').not.toContain('No atendió')
  })
})
