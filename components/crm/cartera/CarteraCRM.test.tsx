// @vitest-environment happy-dom
// crm-cartera-por-rol, tarea 6.2: la pantalla del CRM con los datos del servidor. Grupos de
// cada vista con sus textos, filtros en la dirección (ráfaga, F5, "Limpiar filtros",
// valores inventados), "Cargar 25 más", el pie, los estados de error y el tope, "Colegas"
// y el número de cada cabecera de grupo.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CarteraCRM } from './CarteraCRM'
import { AHORA_PRUEBA, ar, datosPrueba, filaPrueba, FLORENCIA, PAULA, pasoPrueba, TOMAS } from './datos-prueba'
import type { DatosCartera } from '@/lib/supabase/cartera'
import type { FilaCartera } from '@/lib/crm/cartera'

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}))

function irA(busqueda: string) {
  window.history.replaceState(null, '', `/crm${busqueda ? `?${busqueda}` : ''}`)
}
const direccion = () => new URLSearchParams(window.location.search)

beforeEach(() => {
  irA('')
  vi.unstubAllGlobals()
})

function montar(datos: DatosCartera | null, o: { rol?: string; opciones?: { id: string; etiqueta: string }[] | null; aviso?: string | null } = {}) {
  return render(<CarteraCRM inicial={datos} rol={o.rol ?? 'dueno'} opcionesVerComo={o.opciones === undefined ? null : o.opciones} avisoInicial={o.aviso ?? null} />)
}

const grupos = () => screen.queryAllByRole('region').map((s) => s.getAttribute('aria-label'))

// ── Escenarios ───────────────────────────────────────────────────────────────────────────

function carteraCoordinacion(extra: FilaCartera[] = []): DatosCartera {
  return datosPrueba({
    vista: { tipo: 'coordinacion', persona: { id: PAULA.id, nombre: PAULA.nombre, rol: 'coordinador' }, mirando: false },
    opcionesVerComo: null,
    filas: [
      filaPrueba({ id: 'sin-1', nombre: 'Marcela Ibáñez', ultimoContacto: null, creadoEn: ar('2026-12-01', '18:00') }),
      filaPrueba({ id: 'venc-1', nombre: 'Silvina Arrieta', proximo: pasoPrueba('2026-12-02', '09:40') }),
      filaPrueba({
        id: 'tas-1',
        nombre: 'Ernesto Villalba',
        etapa: 'coordinada',
        asesor: { ...TOMAS, activo: true },
        tasacion: { fecha: '2026-12-03', hora: '11:00', instante: ar('2026-12-03', '11:00'), asesor: TOMAS.nombre, direccion: 'Bacacay 2450' },
        proximo: pasoPrueba('2026-12-03', '11:00', { clase: 'tasacion', titulo: 'Tasación' }),
      }),
      filaPrueba({ id: 'resto-1', nombre: 'Valeria Ruggiero', etapa: 'no_realizada', proximo: pasoPrueba('2026-12-04', '12:00', { titulo: 'Volver a coordinar' }) }),
      ...extra,
    ],
  })
}

function carteraAsesor(): DatosCartera {
  return datosPrueba({
    vista: { tipo: 'asesor', persona: { id: TOMAS.id, nombre: TOMAS.nombre, rol: 'asesor' }, mirando: false },
    asesores: null,
    opcionesVerComo: null,
    filas: [
      filaPrueba({
        id: 'hoy-1530',
        etapa: 'coordinada',
        tasacion: { fecha: '2026-12-02', hora: '15:30', instante: ar('2026-12-02', '15:30'), asesor: TOMAS.nombre, direccion: 'x' },
        proximo: pasoPrueba('2026-12-02', '15:30', { clase: 'tasacion', titulo: 'Tasación' }),
      }),
      filaPrueba({
        id: 'hoy-1230',
        etapa: 'coordinada',
        tasacion: { fecha: '2026-12-02', hora: '12:30', instante: ar('2026-12-02', '12:30'), asesor: TOMAS.nombre, direccion: 'y' },
        proximo: pasoPrueba('2026-12-02', '12:30', { clase: 'tasacion', titulo: 'Tasación' }),
      }),
      filaPrueba({ id: 'venc', nombre: 'Mirta Sosa', etapa: 'entregada', proximo: pasoPrueba('2026-12-01', '18:00', { titulo: 'Entregar la tasación' }) }),
      filaPrueba({ id: 'prox', etapa: 'seguimiento', proximo: pasoPrueba('2026-12-05', '10:00') }),
      filaPrueba({ id: 'nada', etapa: 'seguimiento', proximo: null }),
    ],
  })
}

function carteraDueno(n = 3): DatosCartera {
  return datosPrueba({
    filas: Array.from({ length: n }, (_, i) =>
      filaPrueba({ id: `p-${String(i).padStart(3, '0')}`, nombre: `Persona ${String(i).padStart(3, '0')}`, etapa: 'seguimiento', asesor: { ...TOMAS, activo: true }, proximo: pasoPrueba('2026-12-05', '10:00') }),
    ),
  })
}

// ── Grupos por vista ─────────────────────────────────────────────────────────────────────

describe('grupos de cada vista', () => {
  it('coordinación: título, texto y los cuatro grupos en orden, cada proceso una sola vez', () => {
    montar(carteraCoordinacion(), { rol: 'coordinador' })
    expect(screen.getByRole('heading', { level: 1, name: 'CRM' })).toBeInTheDocument()
    expect(screen.getByText('Solicitudes, coordinadas y no realizadas, ordenadas por lo que hay que hacer primero.')).toBeInTheDocument()
    expect(grupos()).toEqual(['Sin primer contacto', 'Llamada o mensaje vencido', 'Tasaciones de hoy y mañana', 'El resto de las solicitudes y coordinadas'])
    for (const t of [
      'Nadie las llamó todavía. Primero la que más espera.',
      'Tenían una tarea para antes de ahora.',
      'Para confirmar el horario con la persona y con el asesor.',
      'En el orden elegido arriba.',
    ])
      expect(screen.getByText(t)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Abrir la ficha de/ })).toHaveLength(4)
    expect(screen.queryByText('Lo que está trabado')).toBeNull()
    expect(screen.queryByText('Ver como')).toBeNull()
    // La coordinación sí filtra por asesor (el asesor no: ver el test de su vista).
    const asesor = screen.getAllByLabelText('Asesor')[0]
    expect(within(asesor).getByRole('option', { name: 'Todos los asesores' })).toBeInTheDocument()
    expect(within(asesor).getByRole('option', { name: 'Sin asesor' })).toBeInTheDocument()
  })

  it('asesor: sus cuatro grupos con los textos, las tasaciones de hoy por hora, sin filtro Asesor', () => {
    montar(carteraAsesor(), { rol: 'asesor' })
    expect(screen.getByText('Tus procesos, ordenados por el próximo paso.')).toBeInTheDocument()
    expect(grupos()).toEqual(['Tasaciones de hoy', 'Tareas vencidas', 'Con próximo paso', 'Sin nada pendiente'])
    for (const t of ['Las que tenés hoy, por hora.', 'Tenían que estar hechas antes de ahora.', 'En el orden elegido arriba.', 'No tienen ninguna tarea ni visita. Poneles un próximo paso o cerrá el proceso.'])
      expect(screen.getByText(t)).toBeInTheDocument()
    const hoy = screen.getByRole('region', { name: 'Tasaciones de hoy' })
    expect(within(hoy).getAllByRole('link').map((a) => a.getAttribute('data-fila'))).toEqual(['hoy-1230', 'hoy-1530'])
    expect(screen.getByRole('region', { name: 'Tareas vencidas' })).toHaveTextContent('Vencida hace 1 día')
    expect(screen.queryByLabelText('Asesor')).toBeNull()
    expect(screen.getByText('Nada agendado')).toBeInTheDocument()
  })

  it('dueño: "Todos los procesos" con "Ordenar por" y "Seleccionar", y "Lo que está trabado"', () => {
    montar(carteraDueno(), { opciones: [] })
    expect(screen.getByText('El embudo completo, lo que está trabado y la lista de todos los procesos.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Lo que está trabado' })).toBeInTheDocument()
    const lista = screen.getByRole('region', { name: 'Todos los procesos' })
    expect(within(lista).getByLabelText('Ordenar por')).toBeInTheDocument()
    expect(within(lista).getByRole('button', { name: 'Seleccionar' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ver como')).toBeInTheDocument()
    expect(screen.queryByText(/Deals/)).toBeNull()
  })

  it('el número de cada cabecera: alerta, neutro o ninguno', () => {
    const { unmount } = montar(carteraCoordinacion(), { rol: 'coordinador' })
    const burbuja = (g: string) => screen.getByRole('region', { name: g }).querySelector('h2 [data-burbuja]')?.getAttribute('data-burbuja') ?? null
    expect(burbuja('Sin primer contacto')).toBe('alerta')
    expect(burbuja('Llamada o mensaje vencido')).toBe('alerta')
    expect(burbuja('Tasaciones de hoy y mañana')).toBe('neutra')
    expect(burbuja('El resto de las solicitudes y coordinadas')).toBeNull()
    unmount()
    const r2 = montar(carteraAsesor(), { rol: 'asesor' })
    expect(burbuja('Tasaciones de hoy')).toBe('neutra')
    expect(burbuja('Tareas vencidas')).toBe('alerta')
    expect(burbuja('Con próximo paso')).toBe('neutra')
    expect(burbuja('Sin nada pendiente')).toBeNull()
    r2.unmount()
    montar(carteraDueno(), { opciones: [] })
    expect(burbuja('Todos los procesos')).toBeNull()
  })

  it('"Nada urgente" cuando la coordinación no tiene sin primer contacto ni vencidas', () => {
    const d = carteraCoordinacion()
    montar({ ...d, filas: d.filas.filter((f) => f.id === 'tas-1' || f.id === 'resto-1') }, { rol: 'coordinador' })
    expect(screen.getByText('Nada urgente')).toBeInTheDocument()
    expect(screen.getByText('No hay solicitudes sin primer contacto ni llamadas vencidas. Abajo sigue el resto de la cartera.')).toBeInTheDocument()
  })

  it('"Nada urgente" no se afirma con un filtro puesto, aunque sea solo la búsqueda (H3)', () => {
    irA('q=Ernesto')
    const d = carteraCoordinacion()
    montar({ ...d, filas: d.filas.filter((f) => f.id === 'tas-1' || f.id === 'resto-1') }, { rol: 'coordinador' })
    expect(screen.queryByText('Nada urgente')).toBeNull()
  })

  it('asesor sin procesos: "Abiertos 0" y "Todavía no tenés procesos"', () => {
    montar({ ...carteraAsesor(), filas: [] }, { rol: 'asesor' })
    expect(screen.getByRole('button', { name: 'Abiertos 0' })).toBeInTheDocument()
    expect(screen.getByText('Todavía no tenés procesos')).toBeInTheDocument()
    expect(screen.getByText('Cuando te asignen una tasación, aparece acá con su próximo paso.')).toBeInTheDocument()
  })
})

// ── Filtros en la dirección ──────────────────────────────────────────────────────────────

describe('filtros en la dirección', () => {
  it('ráfaga: dos filtros seguidos sin esperar quedan los dos', async () => {
    montar(carteraCoordinacion(), { rol: 'coordinador' })
    await userEvent.click(screen.getByRole('button', { name: /^Coordinada/ }))
    await userEvent.selectOptions(screen.getAllByLabelText('Origen')[0], 'referido')
    expect(direccion().get('etapa')).toBe('coordinada')
    expect(direccion().get('origen')).toBe('referido')
    expect(screen.getByRole('button', { name: 'Sacar el filtro Etapa: Coordinada' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sacar el filtro Origen: Referido' })).toBeInTheDocument()
  })

  it('tocar una etapa filtra y la marca; tocarla de nuevo saca el filtro', async () => {
    montar(carteraCoordinacion(), { rol: 'coordinador' })
    const boton = screen.getByRole('button', { name: /^Coordinada/ })
    await userEvent.click(boton)
    expect(boton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('link', { name: /^Abrir la ficha de/ })).toHaveLength(1)
    await userEvent.click(boton)
    expect(screen.getAllByRole('link', { name: /^Abrir la ficha de/ })).toHaveLength(4)
    expect(direccion().get('etapa')).toBeNull()
  })

  it('F5: con filtros en la dirección, la lista, las fichas y el buscador ya los reflejan', () => {
    irA('etapa=no_realizada&q=valeria')
    montar(carteraCoordinacion(), { rol: 'coordinador' })
    expect(screen.getAllByRole('link', { name: /^Abrir la ficha de/ }).map((a) => a.getAttribute('data-fila'))).toEqual(['resto-1'])
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('valeria')
    expect(screen.getByRole('button', { name: 'Sacar el filtro Busca: «valeria»' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^No realizada/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('"Limpiar filtros" saca todo, también la búsqueda, y deja el segmento', async () => {
    irA('seg=abiertos&etapa=coordinada&origen=referido&q=thames')
    montar(carteraCoordinacion(), { rol: 'coordinador' })
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0])
    expect(direccion().get('etapa')).toBeNull()
    expect(direccion().get('origen')).toBeNull()
    expect(direccion().get('q')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Filtros puestos' })).toBeNull()
  })

  it('valores inventados en la dirección: la lista carga sin ese filtro y lo avisa', () => {
    irA('etapa=inventada&asesor=00000000-0000-4000-8000-000000000999&orden=raro')
    montar(carteraCoordinacion(), { rol: 'coordinador' })
    expect(screen.getByText('No se aplicó Etapa: ese valor no es válido.')).toBeInTheDocument()
    expect(screen.getByText('No se aplicó Asesor: ese valor no es válido.')).toBeInTheDocument()
    expect(screen.getByText('No se aplicó Ordenar por: ese valor no es válido.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Abrir la ficha de/ })).toHaveLength(4)
  })

  it('un asesor con el "Ver como" del dueño en la dirección no ve ningún aviso', () => {
    irA(`ver=${FLORENCIA.id}`)
    montar(carteraAsesor(), { rol: 'asesor' })
    expect(screen.queryByText(/No se aplicó/)).toBeNull()
    expect(screen.queryByText(/Estás viendo el CRM como/)).toBeNull()
  })

  it('pasar a cerrados: la lista "Cerrados" con su texto y "Todos los cerrados" en Etapa', async () => {
    montar(
      datosPrueba({
        filas: [
          filaPrueba({ etapa: 'seguimiento' }),
          filaPrueba({ etapa: 'descartado', cerradoEn: ar('2026-11-27', '10:00') }),
          filaPrueba({ etapa: 'captada', cerradoEn: ar('2026-11-30', '10:00') }),
        ],
      }),
      { opciones: [] },
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cerrados 2' }))
    expect(screen.getByRole('region', { name: 'Cerrados' })).toBeInTheDocument()
    expect(screen.getByText('Los más recientes primero. Para volver a abrir uno, entrá a su ficha.')).toBeInTheDocument()
    expect(within(screen.getAllByLabelText('Etapa')[0]).getByRole('option', { name: 'Todos los cerrados' })).toBeInTheDocument()
    expect(screen.getByText('Descartado hace 5 días')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Lo que está trabado' })).toBeNull()
  })
})

// ── Listas largas ────────────────────────────────────────────────────────────────────────

describe('listas largas', () => {
  it('"Cargar 25 más" suma 25 sin repetir y el pie lo dice', async () => {
    montar(carteraDueno(60), { opciones: [] })
    expect(screen.getAllByRole('link', { name: /^Abrir la ficha de/ })).toHaveLength(25)
    expect(screen.getByText('Mostrando 25 de 60 procesos abiertos')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cargar 25 más' }))
    const ids = screen.getAllByRole('link', { name: /^Abrir la ficha de/ }).map((a) => a.getAttribute('data-fila'))
    expect(ids).toHaveLength(50)
    expect(new Set(ids).size).toBe(50)
    expect(screen.getByText('Mostrando 50 de 60 procesos abiertos')).toBeInTheDocument()
  })

  it('el tope de lectura se avisa y el pie no da el total como completo', () => {
    montar({ ...carteraDueno(3), truncado: true }, { opciones: [] })
    expect(screen.getByText('Se muestran los 3.000 más recientes: hay más procesos de los que esta pantalla puede traer.')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 3 de los 3 procesos abiertos que se pudieron traer')).toBeInTheDocument()
  })

  it('filtros que no encuentran nada', async () => {
    irA('q=nadiesellamaasi')
    montar(carteraCoordinacion(), { rol: 'coordinador' })
    expect(screen.getByText('Ningún proceso coincide con estos filtros')).toBeInTheDocument()
    expect(screen.getByText('Probá sacar algún filtro o buscar de otra forma.')).toBeInTheDocument()
  })
})

// ── Estados de error ─────────────────────────────────────────────────────────────────────

describe('errores', () => {
  it('falla la lista: sin ningún número, con los filtros puestos; "Reintentar" la trae con los mismos filtros', async () => {
    irA('origen=embudo')
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/api/crm/cartera')
      return new Response(JSON.stringify(carteraCoordinacion()), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    montar(null, { rol: 'coordinador' })
    expect(screen.getByText('No se pudo cargar la lista de procesos')).toBeInTheDocument()
    expect(screen.getByText('Los filtros siguen ahí. El resto de la plataforma funciona.')).toBeInTheDocument()
    expect(screen.getByText('No se pudo contar por etapa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abiertos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sacar el filtro Origen: Embudo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'El resto de las solicitudes y coordinadas' })).toBeInTheDocument())
    expect(direccion().get('origen')).toBe('embudo')
  })

  it('dueño mirando a alguien con la primera carga fallida: "Reintentar" conserva a la persona y el selector la ofrece (B2, H2)', async () => {
    irA(`ver=${FLORENCIA.id}`)
    const mirando = datosPrueba({
      vista: { tipo: 'asesor', persona: { id: FLORENCIA.id, nombre: FLORENCIA.nombre, rol: 'asesor' }, mirando: true },
      opcionesVerComo: null,
      asesores: null,
      filas: [filaPrueba({ id: 'f-1', nombre: 'Lucía Prado', etapa: 'seguimiento', proximo: pasoPrueba('2026-12-05', '10:00') })],
    })
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`/api/crm/cartera?ver_como=${FLORENCIA.id}`)
      return new Response(JSON.stringify(mirando), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    montar(null, { rol: 'dueno', opciones: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByText('Lucía Prado')).toBeInTheDocument())
    expect(direccion().get('ver')).toBe(FLORENCIA.id)
    expect(screen.getByLabelText('Ver como')).toHaveValue(FLORENCIA.id)
    // Cambiar otro filtro no saca a la persona de la dirección.
    await userEvent.click(screen.getByRole('button', { name: /^Cerrados/ }))
    expect(direccion().get('ver')).toBe(FLORENCIA.id)
  })

  it('tras quedar con una sola persona, volver a "Mi vista" trae la lista completa del selector (A3-2)', async () => {
    irA(`ver=${FLORENCIA.id}`)
    const mirando = datosPrueba({
      vista: { tipo: 'asesor', persona: { id: FLORENCIA.id, nombre: FLORENCIA.nombre, rol: 'asesor' }, mirando: true },
      opcionesVerComo: null,
      asesores: null,
      filas: [filaPrueba({ id: 'f-1', nombre: 'Lucía Prado', etapa: 'seguimiento', proximo: pasoPrueba('2026-12-05', '10:00') })],
    })
    const todas = [
      { id: TOMAS.id, etiqueta: `${TOMAS.nombre} · asesor` },
      { id: FLORENCIA.id, etiqueta: `${FLORENCIA.nombre} · asesor` },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new Response(JSON.stringify(url.includes('ver_como') ? mirando : { ...carteraDueno(), opcionesVerComo: todas }), { status: 200 }),
      ),
    )
    montar(null, { rol: 'dueno', opciones: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByText('Lucía Prado')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Ver como'), '')
    await waitFor(() => expect(screen.getByText('Persona 000')).toBeInTheDocument())
    const opciones = within(screen.getByLabelText('Ver como')).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toContain(`${TOMAS.nombre} · asesor`)
  })

  it('falla solo el último contacto: aviso, "No se pudo cargar" y sin "Sin primer contacto"', () => {
    const d = carteraCoordinacion()
    montar({ ...d, fuentes: { ultimoContacto: 'error', tareas: 'ok' }, filas: d.filas.map((f) => ({ ...f, ultimoContacto: 'error' as const })) }, { rol: 'coordinador' })
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar el último contacto de cada persona.')
    expect(grupos()).not.toContain('Sin primer contacto')
    expect(screen.getAllByText('No se pudo cargar').length).toBeGreaterThan(0)
    expect(screen.queryByText('Nada urgente')).toBeNull()
  })

  it('fallan solo las tareas: aviso y sin los grupos que dependen de ellas', () => {
    const d = carteraCoordinacion()
    montar(
      { ...d, fuentes: { ultimoContacto: 'ok', tareas: 'error' }, filas: d.filas.map((f) => (f.id === 'tas-1' ? f : { ...f, proximo: 'error' as const })) },
      { rol: 'coordinador' },
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar las tareas.')
    expect(grupos()).not.toContain('Llamada o mensaje vencido')
    expect(grupos()).toContain('Tasaciones de hoy y mañana')
  })
})

// ── Colegas ──────────────────────────────────────────────────────────────────────────────

describe('Colegas', () => {
  it('cerrados de la coordinación: ocultos hasta "Mostrar (3)", después "Ocultar (3)"', async () => {
    irA('seg=cerrados')
    const colegas = [1, 2, 3].map(() => filaPrueba({ etapa: 'descartado', colega: true, cerradoEn: ar('2026-11-27', '10:00') }))
    montar(carteraCoordinacion([...colegas, filaPrueba({ etapa: 'descartado', cerradoEn: ar('2026-11-28', '10:00') })]), { rol: 'coordinador' })
    expect(screen.getAllByRole('link', { name: /^Abrir la ficha de/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cerrados 1' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar (3)' }))
    expect(screen.getAllByRole('link', { name: /^Abrir la ficha de/ })).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Ocultar (3)' })).toBeInTheDocument()
  })

  it('sin colegas no aparece el rótulo, en ninguna vista', () => {
    const { unmount } = montar(carteraCoordinacion(), { rol: 'coordinador' })
    expect(screen.queryByText('Colegas')).toBeNull()
    unmount()
    const r = montar(carteraAsesor(), { rol: 'asesor' })
    expect(screen.queryByText('Colegas')).toBeNull()
    r.unmount()
    montar(carteraDueno(), { opciones: [] })
    expect(screen.queryByText('Colegas')).toBeNull()
  })

  it('en la vista del asesor y del dueño también', () => {
    const d = carteraAsesor()
    const { unmount } = montar({ ...d, filas: [...d.filas, filaPrueba({ etapa: 'seguimiento', colega: true })] }, { rol: 'asesor' })
    expect(screen.getByRole('button', { name: 'Mostrar (1)' })).toBeInTheDocument()
    unmount()
    const e = carteraDueno()
    montar({ ...e, filas: [...e.filas, filaPrueba({ etapa: 'solicitud', colega: true }), filaPrueba({ etapa: 'solicitud', colega: true })] }, { opciones: [] })
    expect(screen.getByRole('button', { name: 'Mostrar (2)' })).toBeInTheDocument()
  })
})

describe('la vuelta desde la ficha', () => {
  it('cada fila lleva la dirección actual (con los filtros) para el "‹ Volver"', async () => {
    irA('etapa=solicitud')
    montar(carteraCoordinacion(), { rol: 'coordinador' })
    const enlace = screen.getAllByRole('link', { name: /^Abrir la ficha de/ })[0]
    expect(decodeURIComponent(enlace.getAttribute('href') ?? '')).toContain('volver=/crm?etapa=solicitud')
  })
})

describe('el reloj de la pantalla es el del servidor', () => {
  it('los tiempos relativos se cuentan desde que se armaron los datos', () => {
    act(() => {
      montar(carteraCoordinacion(), { rol: 'coordinador' })
    })
    expect(new Date(carteraCoordinacion().generadoEn).getTime()).toBe(AHORA_PRUEBA.getTime())
    expect(screen.getByRole('region', { name: 'Llamada o mensaje vencido' })).toHaveTextContent('Vencida hace 1 h')
  })
})
