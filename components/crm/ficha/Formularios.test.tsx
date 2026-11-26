// @vitest-environment happy-dom
// Cuadro "Nota | Registrar llamada" y sus formularios (tarea 9.4).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FichaContacto } from './FichaContacto'
import { FormLlamada } from './FormLlamada'
import { FormNota } from './FormNota'
import { CONTACTO, actividadDePrueba, fichaDePrueba, tareaDePrueba } from './datos-prueba'
import { pedidosA, simularRed } from './red-prueba'
import type { BloqueCadencia } from '@/lib/supabase/cadencia'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id'), { error: vi.fn(() => 'e'), dismiss: vi.fn() }) }))

const BASE = `/api/contacts/${CONTACTO}`
const POST = `POST ${BASE}/activities`
const reloj10 = () => new Date('2026-11-25T13:00:00Z') // 10:00 AR
const reloj17 = () => new Date('2026-11-25T20:00:00Z') // 17:00 AR

const cadencia = (c: Partial<BloqueCadencia> = {}): BloqueCadencia => ({
  aplica: true,
  tareaCreada: { id: 't-2', title: 'Llamada 2 a [TEST] Marcela Ibáñez', due_date: '2026-11-26', due_time: '09:00:00', channel: 'call' },
  motivoSinTarea: null,
  tareasCerradas: [],
  ofrecer: null,
  dealId: 'd-1',
  ...c,
})
const respuestaLlamada = (id = 'a-9') => ({
  status: 201,
  body: {
    actividad: actividadDePrueba({ id, kind: 'call', call_outcome: 'no_atendio', body: null, intento: 1, titulo: 'Llamada 1 · No atendió' }),
    cadencia: cadencia(),
    pendiente: false,
  },
})
const cuerpos = (red: ReturnType<typeof simularRed>) =>
  pedidosA(red, '/activities', 'POST').map(([, i]) => JSON.parse(String((i as RequestInit).body)))

let scroll: ReturnType<typeof vi.fn>
beforeEach(() => {
  scroll = vi.fn()
  Element.prototype.scrollIntoView = scroll as unknown as Element['scrollIntoView']
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const u = () => userEvent.setup()

describe('FormLlamada', () => {
  it('"No atendió" guarda con un toque y un segundo toque seguido no manda otra', async () => {
    let soltar: (() => void) | null = null
    const red = simularRed({ [POST]: () => new Promise((ok) => (soltar = () => ok(respuestaLlamada()))) })
    const onGuardado = vi.fn()
    render(<FormLlamada contactoId={CONTACTO} onGuardado={onGuardado} reloj={reloj10} />)
    const b = screen.getByRole('button', { name: /No atendió/ })
    const usr = u()
    await usr.click(b)
    await usr.click(b)
    expect(pedidosA(red, '/activities', 'POST')).toHaveLength(1)
    expect(cuerpos(red)[0]).toMatchObject({ kind: 'call', call_outcome: 'no_atendio' })
    soltar!()
    await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1))
    expect(onGuardado.mock.calls[0][1]).toBe('call')
  })

  it('un reintento tras un error manda el MISMO client_token; el guardado siguiente, uno distinto', async () => {
    let n = 0
    const red = simularRed({ [POST]: () => (++n === 1 ? { status: 500, body: { error: 'No se pudo guardar. Probá de nuevo.' } } : respuestaLlamada(`a-${n}`)) })
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj10} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /No atendió/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar. Probá de nuevo.')
    await usr.click(screen.getByRole('button', { name: /No atendió/ }))
    await waitFor(() => expect(pedidosA(red, '/activities', 'POST')).toHaveLength(2))
    await usr.click(screen.getByRole('button', { name: /No atendió/ }))
    await waitFor(() => expect(pedidosA(red, '/activities', 'POST')).toHaveLength(3))
    const [a, b, c] = cuerpos(red).map((x) => x.client_token)
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })

  it('"volver a llamar" sin fecha: "Elegí día y hora para volver a llamar", campos en rojo y no se manda nada', async () => {
    const red = simularRed({})
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj10} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /volver a llamar/ }))
    await usr.click(screen.getByRole('button', { name: 'Guardar llamada' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí día y hora para volver a llamar')
    expect(screen.getByLabelText('Día')).toHaveAttribute('aria-invalid', 'true')
    expect(red).not.toHaveBeenCalled()
  })

  it('al tocar un atajo los campos pierden el rojo y el mensaje se va, sin tocar "Guardar llamada"', async () => {
    simularRed({})
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj10} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /volver a llamar/ }))
    await usr.click(screen.getByRole('button', { name: 'Guardar llamada' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await usr.click(screen.getByRole('button', { name: 'Mañana 10:00' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Día')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText('Día')).toHaveValue('2026-11-26')
    expect(screen.getByLabelText('Hora')).toHaveValue('10:00')
  })

  it('al completar día y hora a mano el rojo también se va', async () => {
    simularRed({})
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj10} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /volver a llamar/ }))
    await usr.click(screen.getByRole('button', { name: 'Guardar llamada' }))
    await usr.type(screen.getByLabelText('Día'), '2026-11-27')
    expect(screen.getByLabelText('Día')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await usr.type(screen.getByLabelText('Hora'), '11:00')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Hora')).toHaveAttribute('aria-invalid', 'false')
  })

  it('atajo "Hoy 16:00" a las 17:00: "Tiene que ser más adelante que ahora"', async () => {
    const red = simularRed({})
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj17} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /volver a llamar/ }))
    await usr.click(screen.getByRole('button', { name: 'Hoy 16:00' }))
    await usr.click(screen.getByRole('button', { name: 'Guardar llamada' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Tiene que ser más adelante que ahora')
    expect(red).not.toHaveBeenCalled()
  })

  it('"volver a llamar" válido manda volver_el con día y hora', async () => {
    const red = simularRed({ [POST]: respuestaLlamada() })
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj10} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /volver a llamar/ }))
    await usr.click(screen.getByRole('button', { name: 'Mañana 16:00' }))
    await usr.click(screen.getByRole('button', { name: 'Guardar llamada' }))
    await waitFor(() => expect(cuerpos(red)).toHaveLength(1))
    expect(cuerpos(red)[0]).toMatchObject({ kind: 'call', call_outcome: 'volver_a_llamar', volver_el: { fecha: '2026-11-26', hora: '16:00' } })
  })

  it('"¿Fue hace un rato?": con "Hace 30 min" lleva hace_minutos 30; con "Recién", no lo lleva', async () => {
    const red = simularRed({ [POST]: respuestaLlamada() })
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj10} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /Corregir la hora/ }))
    await usr.click(screen.getByRole('button', { name: 'Hace 30 min' }))
    await usr.click(screen.getByRole('button', { name: /No atendió/ }))
    await waitFor(() => expect(cuerpos(red)).toHaveLength(1))
    expect(cuerpos(red)[0].hace_minutos).toBe(30)
    await usr.click(screen.getByRole('button', { name: /Corregir la hora/ }))
    await usr.click(screen.getByRole('button', { name: 'Recién' }))
    await usr.click(screen.getByRole('button', { name: /No atendió/ }))
    await waitFor(() => expect(cuerpos(red)).toHaveLength(2))
    expect('hace_minutos' in cuerpos(red)[1]).toBe(false)
  })

  it('"Marcar WhatsApp enviado" manda kind whatsapp_sent con su token, el comentario y la hora; sin resultado ni volver_el', async () => {
    const red = simularRed({
      [POST]: {
        status: 201,
        body: { actividad: actividadDePrueba({ kind: 'whatsapp_sent', titulo: 'WhatsApp enviado' }), cadencia: cadencia({ tareaCreada: null, motivoSinTarea: 'secuencia_terminada' }), pendiente: false },
      },
    })
    const onGuardado = vi.fn()
    render(<FormLlamada contactoId={CONTACTO} onGuardado={onGuardado} reloj={reloj10} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /volver a llamar/ }))
    await usr.click(screen.getByRole('button', { name: 'Mañana 10:00' }))
    await usr.type(screen.getByLabelText(/Comentario/), 'le mandé el link')
    await usr.click(screen.getByRole('button', { name: /Corregir la hora/ }))
    await usr.click(screen.getByRole('button', { name: 'Hace 30 min' }))
    await usr.click(screen.getByRole('button', { name: 'Marcar WhatsApp enviado' }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    const c = cuerpos(red)[0]
    expect(c).toMatchObject({ kind: 'whatsapp_sent', body: 'le mandé el link', hace_minutos: 30 })
    expect(typeof c.client_token).toBe('string')
    expect(c.call_outcome).toBeUndefined()
    expect(c.volver_el).toBeUndefined()
    expect(onGuardado.mock.calls[0][1]).toBe('whatsapp_sent')
    // El formulario queda limpio.
    expect(screen.getByLabelText(/Comentario/)).toHaveValue('')
  })

  it('un error del servidor conserva el resultado y el comentario', async () => {
    simularRed({ [POST]: { status: 500, body: { error: 'No se pudo guardar. Probá de nuevo.' } } })
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj10} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /no le interesa/ }))
    await usr.type(screen.getByLabelText(/Comentario/), 'vende en 2027')
    await usr.click(screen.getByRole('button', { name: 'Guardar llamada' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar')
    expect(screen.getByRole('button', { name: /no le interesa/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/Comentario/)).toHaveValue('vende en 2027')
  })

  it('al elegir "volver a llamar" pide que "Guardar llamada" quede a la vista', async () => {
    simularRed({})
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj10} />)
    await u().click(screen.getByRole('button', { name: /volver a llamar/ }))
    await waitFor(() => expect(scroll.mock.contexts).toContain(screen.getByRole('button', { name: 'Guardar llamada' })))
  })

  it('al abrir "Corregir la hora" con un resultado elegido pide lo mismo', async () => {
    simularRed({})
    render(<FormLlamada contactoId={CONTACTO} onGuardado={() => {}} reloj={reloj10} />)
    const usr = u()
    await usr.click(screen.getByRole('button', { name: /no le interesa/ }))
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    scroll.mockClear()
    await usr.click(screen.getByRole('button', { name: /Corregir la hora/ }))
    await waitFor(() => expect(scroll.mock.contexts).toContain(screen.getByRole('button', { name: 'Guardar llamada' })))
  })
})

describe('FormNota', () => {
  it('vacía: "Escribí algo para guardar la nota" y no se manda nada', async () => {
    const red = simularRed({})
    render(<FormNota contactoId={CONTACTO} onGuardada={() => {}} />)
    const usr = u()
    await usr.type(screen.getByRole('textbox', { name: 'Nota' }), '   ')
    await usr.click(screen.getByRole('button', { name: 'Guardar nota' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribí algo para guardar la nota')
    expect(red).not.toHaveBeenCalled()
  })
})

describe('Composer dentro de la ficha', () => {
  function red(extra: Parameters<typeof simularRed>[0] = {}) {
    return simularRed({
      [`${BASE}/ficha`]: { body: fichaDePrueba() },
      [`${BASE}/activities`]: { body: { actividades: [actividadDePrueba()], hay_mas: false } },
      [`${BASE}/tasks`]: { body: { tareas: [tareaDePrueba()], total: 1 } },
      ...extra,
    })
  }
  const ficha = () => render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj10} />)
  const composer = () => document.getElementById('ficha-composer') as HTMLElement

  it('tras guardar una llamada vuelve a "Nota", el foco queda en el aviso y la ficha pide de nuevo tareas y persona', async () => {
    const r = red({ [POST]: respuestaLlamada() })
    ficha()
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    await usr.click(within(composer()).getByRole('tab', { name: /Registrar llamada/ }))
    await usr.click(within(composer()).getByRole('button', { name: /No atendió/ }))
    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('Llamada 1 · No atendió')
    expect(aviso).toHaveTextContent('Se agendó Llamada 2 para mañana 9:00.')
    await waitFor(() => expect(document.activeElement).toBe(aviso))
    expect(within(composer()).getByRole('tab', { name: /Nota/ })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => {
      expect(pedidosA(r, '/tasks')).toHaveLength(2)
      expect(pedidosA(r, '/ficha')).toHaveLength(2)
    })
  })

  it('tras guardar un WhatsApp la ficha también pide de nuevo tareas y persona', async () => {
    const r = red({
      [POST]: {
        status: 201,
        body: { actividad: actividadDePrueba({ id: 'w-1', kind: 'whatsapp_sent', titulo: 'WhatsApp enviado' }), cadencia: cadencia({ tareaCreada: null, motivoSinTarea: 'secuencia_terminada' }), pendiente: false },
      },
    })
    ficha()
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    const usr = u()
    await usr.click(within(composer()).getByRole('tab', { name: /Registrar llamada/ }))
    await usr.click(within(composer()).getByRole('button', { name: 'Marcar WhatsApp enviado' }))
    expect(await screen.findByRole('status')).toHaveTextContent('WhatsApp marcado como enviado')
    await waitFor(() => {
      expect(pedidosA(r, '/tasks')).toHaveLength(2)
      expect(pedidosA(r, '/ficha')).toHaveLength(2)
    })
  })

  it('tras guardar una nota, que no tiene aviso, el foco queda en el registro nuevo', async () => {
    const nueva = actividadDePrueba({ id: 'n-2', body: 'Llamar después de las 10', occurred_at: '2026-11-25T13:00:00Z' })
    let guardada = false
    red({
      [`${BASE}/activities`]: () => ({ body: { actividades: guardada ? [nueva, actividadDePrueba()] : [actividadDePrueba()], hay_mas: false } }),
      [POST]: () => ((guardada = true), { status: 201, body: { actividad: nueva, cadencia: null, pendiente: false } }),
    })
    ficha()
    await screen.findByText('Prefiere que la llamen a la tarde')
    const usr = u()
    await usr.type(within(composer()).getByRole('textbox', { name: 'Nota' }), 'Llamar después de las 10')
    await usr.click(within(composer()).getByRole('button', { name: 'Guardar nota' }))
    const nuevo = await waitFor(() => {
      const li = document.querySelector('[data-actividad="n-2"]') as HTMLElement
      expect(li).not.toBeNull()
      return li
    })
    await waitFor(() => expect(document.activeElement).toBe(nuevo))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
