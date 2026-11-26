// @vitest-environment happy-dom
// Cabecera, Datos y lateral de la ficha (tarea 9.3).
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BloqueLista } from './BloqueLista'
import { FichaCabecera } from './FichaCabecera'
import { FichaContacto } from './FichaContacto'
import { FichaDatos } from './FichaDatos'
import { LateralTareas } from './LateralTareas'
import { CONTACTO, actividadDePrueba, fichaDePrueba, tareaDePrueba } from './datos-prueba'
import { pedidosA, simularRed } from './red-prueba'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))
// "+ Tarea" abre el formulario de tareas de hoy; acá basta con su `onCreated`.
vi.mock('@/components/tasks/AddTaskDialog', () => ({
  AddTaskDialog: ({ onCreated, trigger }: { onCreated?: (id: string) => void; trigger?: React.ReactNode }) => (
    <span>
      {trigger}
      <button type="button" onClick={() => onCreated?.('t-nueva')}>
        simular tarea creada
      </button>
    </span>
  ),
}))
const toastes = vi.hoisted(() => ({ toast: vi.fn(() => 'id'), error: vi.fn(() => 'id-e'), dismiss: vi.fn() }))
vi.mock('sonner', () => ({
  toast: Object.assign(toastes.toast, { error: toastes.error, dismiss: toastes.dismiss }),
}))

const reloj = () => new Date('2026-11-25T13:00:00Z')
const BASE = `/api/contacts/${CONTACTO}`

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  toastes.toast.mockClear()
  toastes.error.mockClear()
})

describe('Background', () => {
  const montar = (texto: string | null) => {
    const avisar = vi.fn()
    const onGuardado = vi.fn()
    const ficha = fichaDePrueba({ persona: { ...fichaDePrueba().persona, notes: texto } })
    render(
      <FichaDatos
        estado="ok"
        ficha={ficha}
        contactoId={CONTACTO}
        onReintentar={() => {}}
        onEditarContacto={() => {}}
        onBackgroundGuardado={onGuardado}
        avisar={avisar}
      />,
    )
    return { avisar, onGuardado }
  }

  it('"Guardar" manda { notes }, muestra el texto nuevo y avisa "Background guardado."', async () => {
    const red = simularRed({ [`PUT ${BASE}`]: { body: { success: true } } })
    const { avisar, onGuardado } = montar('Vende para mudarse')
    const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: 'Editar' }))
    const campo = screen.getByRole('textbox', { name: 'Background' })
    await u.clear(campo)
    await u.type(campo, 'Decide la hija')
    await u.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(avisar).toHaveBeenCalledWith('Background guardado.'))
    expect(JSON.parse(String(pedidosA(red, BASE, 'PUT')[0][1]?.body))).toEqual({ notes: 'Decide la hija' })
    expect(screen.getByText('Decide la hija')).toBeInTheDocument()
    expect(onGuardado).toHaveBeenCalledWith('Decide la hija')
  })

  it('"Cancelar" deja el texto anterior y no manda nada', async () => {
    const red = simularRed({})
    montar('Vende para mudarse')
    const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: 'Editar' }))
    await u.type(screen.getByRole('textbox', { name: 'Background' }), ' cambio')
    await u.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('Vende para mudarse')).toBeInTheDocument()
    expect(red).not.toHaveBeenCalled()
  })

  it('sin texto se ve solo "Agregar"', () => {
    montar(null)
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })
})

describe('Detalles', () => {
  const dibujar = (ficha = fichaDePrueba()) =>
    render(
      <FichaDatos
        estado="ok"
        ficha={ficha}
        contactoId={CONTACTO}
        onReintentar={() => {}}
        onEditarContacto={() => {}}
        onBackgroundGuardado={() => {}}
        avisar={() => {}}
      />,
    )
  const renglon = (et: string) => document.querySelector(`[data-dato="${et}"]`)

  it('sin proceso y sin asesor: "Asesor: Sin asignar todavía"; con asesor, su nombre', () => {
    const base = fichaDePrueba()
    const { unmount } = dibujar({
      ...base,
      procesoActivo: null,
      procesos: [],
      detalles: { ...base.detalles, etapa: null, campana: null, direccion: null, barrio: null, tipoPropiedad: null, ambientes: null },
    })
    expect(renglon('Asesor')).toHaveTextContent('Sin asignar todavía')
    expect(renglon('Etapa')).toBeNull()
    unmount()
    dibujar({ ...base, detalles: { ...base.detalles, asesor: { mostrar: true, id: 'u-9', nombre: 'Tomás Agüero' } } })
    expect(renglon('Asesor')).toHaveTextContent('Tomás Agüero')
  })

  it('proceso activo ajeno: se ve la Etapa, no propiedad ni campaña, y el Asesor no dice "Sin asignar todavía"', () => {
    const base = fichaDePrueba()
    dibujar({
      ...base,
      detalles: {
        ...base.detalles,
        origen: null,
        campana: null,
        direccion: null,
        barrio: null,
        tipoPropiedad: null,
        ambientes: null,
        asesor: { mostrar: false, id: null, nombre: null },
      },
    })
    expect(renglon('Etapa')).toHaveTextContent('Solicitud')
    expect(renglon('Dirección')).toBeNull()
    expect(renglon('Campaña')).toBeNull()
    expect(renglon('Asesor')).toBeNull()
    expect(document.body.textContent).not.toContain('Sin asignar todavía')
  })

  it('sin proceso abierto y el último cerrado ajeno: sin renglón Etapa, solo origen y asesor del contacto', () => {
    const base = fichaDePrueba()
    dibujar({
      ...base,
      procesoActivo: null,
      detalles: {
        etapa: null,
        origen: 'referido',
        campana: null,
        conjunto: null,
        anuncio: null,
        asesor: { mostrar: true, id: 'u-9', nombre: 'Tomás Agüero' },
        direccion: null,
        barrio: null,
        tipoPropiedad: null,
        ambientes: null,
        superficie: null,
      },
    })
    expect(renglon('Etapa')).toBeNull()
    expect(renglon('Origen')).toHaveTextContent('Referido')
    expect(renglon('Asesor')).toHaveTextContent('Tomás Agüero')
    expect(document.querySelectorAll('[data-dato]')).toHaveLength(4) // Teléfono, Email, Origen, Asesor
  })

  it('Detalles no dibuja renglones vacíos', () => {
    dibujar()
    expect(renglon('Conjunto')).toBeNull()
    expect(renglon('Superficie')).toBeNull()
    expect(renglon('Barrio')).toHaveTextContent('Caballito')
  })

  it('"Tarjeta Contacto en celular": teléfono y email, con la clase que la oculta con columnas', () => {
    dibujar()
    const tarjeta = screen.getByRole('heading', { name: 'Contacto' }).closest('section') as HTMLElement
    expect(tarjeta).toHaveClass('ficha-solo-pestanas')
    expect(within(tarjeta).getByText('11 5555-0142')).toBeInTheDocument()
    expect(within(tarjeta).getByText('marcela@ejemplo.com')).toBeInTheDocument()
  })
})

describe('Cabecera', () => {
  it('"Email en la cabecera en escritorio": lleva la clase que lo oculta en la vista de una columna', () => {
    render(<FichaCabecera estado="ok" ficha={fichaDePrueba()} onReintentar={() => {}} pestanas={null} />)
    expect(screen.getByText('marcela@ejemplo.com').closest('p')).toHaveClass('ficha-solo-columnas')
    expect(screen.getByRole('link', { name: /Llamar a/ })).toHaveAttribute('href', 'tel:+5491155550142')
    expect(screen.getByText('Sin contacto todavía').closest('[data-nivel]')).toHaveAttribute('data-nivel', 'alerta')
  })
  it('sin teléfono no hay "Llamar"', () => {
    const base = fichaDePrueba()
    render(<FichaCabecera estado="ok" ficha={{ ...base, persona: { ...base.persona, phone: null } }} onReintentar={() => {}} pestanas={null} />)
    expect(screen.queryByRole('link', { name: /Llamar/ })).toBeNull()
  })
})

describe('Procesos: "Coordinar tasación" fijo', () => {
  it('con puede_convertir, un enlace a /pipeline/new?deal=<id> al lado del enlace del proceso, no adentro', () => {
    render(<BloqueLista ficha={fichaDePrueba()} ahora={reloj()} onDeshacerPerdido={async () => true} />)
    const boton = screen.getByRole('link', { name: 'Coordinar tasación' })
    expect(boton).toHaveAttribute('href', '/pipeline/new?deal=d-1')
    const proceso = screen.getByRole('link', { name: /Tasación · Av. Pedro Goyena/ })
    expect(proceso).toHaveAttribute('href', '/pipeline/d-1')
    expect(proceso.contains(boton)).toBe(false)
  })
  it('sin puede_convertir no está; con dos solicitudes hay dos, cada una con su id', () => {
    const base = fichaDePrueba()
    const p = base.procesos[0]
    const { unmount } = render(
      <BloqueLista ficha={{ ...base, procesos: [{ ...p, puede_convertir: false }] }} ahora={reloj()} onDeshacerPerdido={async () => true} />,
    )
    expect(screen.queryByRole('link', { name: 'Coordinar tasación' })).toBeNull()
    unmount()
    render(
      <BloqueLista
        ficha={{ ...base, procesos: [p, { ...p, id: 'd-2', direccion: 'Bacacay 2450' }] }}
        ahora={reloj()}
        onDeshacerPerdido={async () => true}
      />,
    )
    expect(screen.getAllByRole('link', { name: 'Coordinar tasación' }).map((a) => a.getAttribute('href'))).toEqual([
      '/pipeline/new?deal=d-1',
      '/pipeline/new?deal=d-2',
    ])
  })
  it('sin ítems en Archivos el bloque no aparece; con una tasación abre /appraisals/<id>', () => {
    const base = fichaDePrueba()
    const { unmount } = render(<BloqueLista ficha={base} ahora={reloj()} onDeshacerPerdido={async () => true} />)
    expect(screen.queryByRole('heading', { name: 'Archivos' })).toBeNull()
    unmount()
    render(
      <BloqueLista
        ficha={{ ...base, archivos: { tasaciones: [{ id: 'ap-1', titulo: 'Bacacay 2450', ubicacion: null, creado: '2026-03-01T12:00:00Z' }], propiedades: [] } }}
        ahora={reloj()}
        onDeshacerPerdido={async () => true}
      />,
    )
    expect(screen.getByRole('link', { name: /Bacacay 2450/ })).toHaveAttribute('href', '/appraisals/ap-1')
  })
})

describe('Procesos: "Deshacer" fijo del perdido', () => {
  const descartado = (hasta: string | null) => {
    const base = fichaDePrueba()
    return { ...base, procesos: [{ ...base.procesos[0], etapa: 'descartado', etiquetaEtapa: 'Descartado', puede_convertir: false, deshacer_hasta: hasta }] }
  }

  it('con deshacer_hasta dentro de 5 minutos se ve; con null o ya pasado, no', () => {
    const en5 = new Date(Date.now() + 5 * 60_000).toISOString()
    const { unmount } = render(<BloqueLista ficha={descartado(en5)} ahora={reloj()} onDeshacerPerdido={async () => true} />)
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeInTheDocument()
    unmount()
    const { unmount: u2 } = render(<BloqueLista ficha={descartado(null)} ahora={reloj()} onDeshacerPerdido={async () => true} />)
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
    u2()
    render(<BloqueLista ficha={descartado(new Date(Date.now() - 1000).toISOString())} ahora={reloj()} onDeshacerPerdido={async () => true} />)
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
  })

  it('al llegar la hora desaparece sin recargar (reloj simulado, sin clics)', () => {
    vi.useFakeTimers({ now: new Date('2026-11-25T13:00:00Z') })
    render(<BloqueLista ficha={descartado('2026-11-25T13:05:00Z')} ahora={reloj()} onDeshacerPerdido={async () => true} />)
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(5 * 60_000 + 100)
    })
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
  })

  it('al tocarlo llama a undo-lost y la ficha se vuelve a pedir; ante un 409 lo dice y el botón se va', async () => {
    const en5 = new Date(Date.now() + 5 * 60_000).toISOString()
    let primera = true
    const red = simularRed({
      [`${BASE}/ficha`]: () => ({ body: descartado(en5) }),
      [`${BASE}/activities`]: { body: { actividades: [], hay_mas: false } },
      [`${BASE}/tasks`]: { body: { tareas: [], total: 0 } },
      'POST /api/deals/d-1/undo-lost': () =>
        primera
          ? ((primera = false), { body: { ok: true, stage: 'request' } })
          : { status: 409, body: { error: 'Ya no se puede deshacer: pasaron más de 10 minutos o el proceso cambió de etapa.' } },
    })
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(pedidosA(red, '/ficha').length).toBe(2))
    expect(pedidosA(red, '/undo-lost', 'POST')).toHaveLength(1)
    // Segunda vez: el servidor ya no deja (409).
    await u.click(await screen.findByRole('button', { name: 'Deshacer' }))
    await waitFor(() =>
      expect(toastes.error).toHaveBeenCalledWith('Ya no se puede deshacer: pasaron más de 10 minutos o el proceso cambió de etapa.', undefined),
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull())
  })
})

describe('Tareas', () => {
  const lateral = (tareas = [tareaDePrueba()], extra: Partial<Parameters<typeof LateralTareas>[0]> = {}) =>
    render(
      <LateralTareas
        contactoId={CONTACTO}
        nombre="[TEST] Marcela"
        estado="ok"
        tareas={tareas}
        ahora={reloj()}
        onReintentar={() => {}}
        onCreada={() => {}}
        onCompletada={() => {}}
        avisar={() => {}}
        {...extra}
      />,
    )

  it('sin tareas: solo la cabecera con "+ Tarea", sin número', () => {
    lateral([])
    expect(screen.getByRole('heading', { name: 'Tareas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tarea' })).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('una vencida dice "Vencida hace 2 días"; a las 22:00 de Argentina, la de mañana 9:00 no está vencida', () => {
    render(
      <LateralTareas
        contactoId={CONTACTO}
        nombre={null}
        estado="ok"
        tareas={[
          tareaDePrueba({ id: 'a', title: 'Mañana', due_date: '2026-11-26', due_time: '09:00:00' }),
          tareaDePrueba({ id: 'b', title: 'Anteayer', due_date: '2026-11-23', due_time: null }),
        ]}
        ahora={new Date('2026-11-26T01:00:00Z')}
        onReintentar={() => {}}
        onCreada={() => {}}
        onCompletada={() => {}}
        avisar={() => {}}
      />,
    )
    const fila = (t: string) => screen.getByText(t).closest('li') as HTMLElement
    expect(within(fila('Anteayer')).getByText('Vencida hace 2 días')).toBeInTheDocument()
    expect(within(fila('Mañana')).queryByText(/Vencida/)).toBeNull()
    expect(within(fila('Mañana')).getByText('Mañana 9:00')).toBeInTheDocument()
  })

  it('en la ficha: crear con "+ Tarea" la trae sin recargar y sube el número; completar la saca y lo baja', async () => {
    let tareas = [tareaDePrueba()]
    const red = simularRed({
      [`${BASE}/ficha`]: { body: fichaDePrueba() },
      [`${BASE}/activities`]: { body: { actividades: [actividadDePrueba()], hay_mas: false } },
      [`${BASE}/tasks`]: () => ({ body: { tareas, total: tareas.length } }),
      'PUT /api/tasks/t-1': () => {
        tareas = tareas.filter((t) => t.id !== 't-1')
        return { body: { success: true } }
      },
    })
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={reloj} />)
    const u = userEvent.setup()
    const titulo = () => screen.getByRole('heading', { name: /^Tareas/ })
    await waitFor(() => expect(titulo()).toHaveTextContent('Tareas · 1'))
    tareas = [...tareas, tareaDePrueba({ id: 't-nueva', title: 'Visitar', channel: 'visit', source_activity_id: null })]
    await u.click(screen.getByRole('button', { name: 'simular tarea creada' }))
    await waitFor(() => expect(titulo()).toHaveTextContent('Tareas · 2'))
    expect(screen.getByText('Visitar')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Tareas/ })).toHaveTextContent('2')
    await u.click(screen.getByRole('checkbox', { name: 'Completar: Llamada 2 a [TEST] Marcela Ibáñez' }))
    await waitFor(() => expect(screen.queryByText('Llamada 2 a [TEST] Marcela Ibáñez')).toBeNull())
    expect(titulo()).toHaveTextContent('Tareas · 1')
    expect(JSON.parse(String(pedidosA(red, '/api/tasks/t-1', 'PUT')[0][1]?.body))).toEqual({ action: 'complete' })
  })
})
