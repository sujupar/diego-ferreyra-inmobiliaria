/**
 * Lectura de la cartera del CRM (tarea 4.1, design.md D4 y D6) contra una base simulada que
 * aplica de verdad los filtros pedidos (`cartera.simulada.ts`). Las reglas de qué dice cada
 * fila están en `lib/crm/cartera*.test.ts`; acá: qué se lee, en qué orden, con qué
 * columnas y alcance, cómo se pagina, el plazo único y qué pasa cuando falla cada fuente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { baseSimulada, type OpcionesBaseSimulada } from './cartera.simulada'

const m = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.cliente }))

import { cargarCartera, leerOpcionesVerComo, PLAZO_LECTURA_MS, TOPE_FILAS } from './cartera'

const AHORA = new Date('2026-11-27T15:00:00.000Z') // viernes 12:00 de Argentina
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const DUENO = uuid(1)
const COORD_1 = uuid(2)
const COORD_2 = uuid(3)
const ASESOR_A = uuid(4)
const ASESOR_B = uuid(5)
const ABOGADO = uuid(6)
const INACTIVO = uuid(7)

const perfiles = [
  { id: DUENO, full_name: 'Diego Dueño', role: 'dueno', is_active: true },
  { id: COORD_1, full_name: 'Paula Coord', role: 'coordinador', is_active: true },
  { id: COORD_2, full_name: 'Julian Coord', role: 'coordinador', is_active: true },
  { id: ASESOR_A, full_name: 'Ana Asesora', role: 'asesor', is_active: true },
  { id: ASESOR_B, full_name: 'Bruno Asesor', role: 'asesor', is_active: true },
  { id: ABOGADO, full_name: 'Luis Abogado', role: 'abogado', is_active: true },
  { id: INACTIVO, full_name: 'Ido Baja', role: 'asesor', is_active: false },
]

let n = 100
function contacto(nombre: string) {
  const id = uuid(++n)
  return { id, full_name: nombre, phone: '1150000000', email: null, created_at: '2026-11-20T10:00:00.000Z' }
}
function proceso(p: Record<string, unknown> & { contact_id: string | null }) {
  return {
    id: uuid(++n), stage: 'request', scheduled_date: null, scheduled_time: null, origin: 'embudo', assigned_to: null,
    created_at: '2026-11-26T14:00:00.000Z', property_type: null, property_type_other: null, rooms: null,
    neighborhood: 'Palermo', property_address: 'Calle 1', tags: null, captured_at: null, lost_at: null,
    stage_changed_at: '2026-11-26T14:00:00.000Z', ...p,
  }
}
function tarea(t: Record<string, unknown> & { deal_id: string | null; assigned_to: string }) {
  return {
    id: uuid(++n), type: 'follow_up', title: 'Llamar', contact_id: null, due_date: '2026-11-27', due_time: null,
    all_day: true, channel: 'call', created_at: '2026-11-26T15:00:00.000Z', source_activity_id: null, status: 'pending', ...t,
  }
}

type Tablas = Record<string, Record<string, unknown>[]>
let base: ReturnType<typeof baseSimulada>
function usar(tablas: Tablas, opciones: OpcionesBaseSimulada & { ultimos?: Record<string, unknown>[] } = {}) {
  base = baseSimulada(
    { profiles: perfiles, contacts: [], deals: [], tasks: [], ...tablas },
    {
      ...opciones,
      rpcs: {
        crm_ultimos_contactos: (args) => {
          const ids = Array.isArray(args.p_contactos) ? args.p_contactos : []
          return (opciones.ultimos ?? []).filter((u) => ids.includes(u.contacto_id))
        },
      },
    },
  )
  m.cliente = base.cliente
}
const de = (tabla: string) => base.consultas.filter((c) => c.tabla === tabla)
const indice = (pred: (c: (typeof base.consultas)[number]) => boolean) => base.consultas.findIndex(pred)

async function cargar(quien: { id: string; role: string }, verComo: string | null = null) {
  const r = await cargarCartera({ quien, verComo }, AHORA)
  if (!r.ok) throw new Error(`esperaba ok, vino ${r.motivo}`)
  return r.datos
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave'
  n = 100
})
afterEach(() => vi.useRealTimers())

describe('cargarCartera — qué lee y con qué columnas', () => {
  it('columnas explícitas: nunca *, y las tareas piden source_activity_id y created_at', async () => {
    const c = contacto('Sofía')
    const p = proceso({ contact_id: c.id })
    usar({ contacts: [c], deals: [p], tasks: [tarea({ deal_id: p.id, assigned_to: COORD_1 })] })
    await cargar({ id: DUENO, role: 'dueno' })
    for (const q of base.consultas.filter((q) => !q.tabla.startsWith('rpc:'))) expect(q.select).not.toContain('*')
    expect(de('deals')[0].select).toContain('contacto:contact_id(id, full_name, phone, email, created_at)')
    expect(de('tasks')[0].select).toMatch(/source_activity_id/)
    expect(de('tasks')[0].select).toMatch(/created_at/)
    expect(de('profiles')[0].select).toBe('id, full_name, role, is_active')
  })

  it('dos tandas: procesos, tareas y perfiles antes que la RPC y la lectura de completadas', async () => {
    const c = contacto('Sofía')
    const p = proceso({ contact_id: c.id })
    usar({
      contacts: [c], deals: [p],
      tasks: [tarea({ deal_id: p.id, assigned_to: COORD_1 }), tarea({ deal_id: p.id, assigned_to: COORD_2 })],
    })
    await cargar({ id: DUENO, role: 'dueno' })
    const rpc = indice((q) => q.tabla === 'rpc:crm_ultimos_contactos')
    const cerradas = indice((q) => q.tabla === 'tasks' && q.filtros.some((f) => f.startsWith('in:status=')))
    expect(rpc).toBeGreaterThan(indice((q) => q.tabla === 'deals'))
    expect(rpc).toBeGreaterThan(indice((q) => q.tabla === 'tasks'))
    expect(rpc).toBeGreaterThan(indice((q) => q.tabla === 'profiles'))
    expect(cerradas).toBeGreaterThan(indice((q) => q.tabla === 'deals'))
    expect(cerradas).toBeGreaterThan(-1)
  })

  it('todas las lecturas van con la señal del plazo compartido', async () => {
    const c = contacto('Sofía')
    usar({ contacts: [c], deals: [proceso({ contact_id: c.id })] })
    await cargar({ id: DUENO, role: 'dueno' })
    expect(base.consultas.length).toBeGreaterThan(0)
    for (const q of base.consultas) expect(q.conSenal).toBe(true)
  })

  it('orden fijo: procesos por created_at desc, id; tareas por id; la RPC por contacto_id', async () => {
    const c = contacto('Sofía')
    usar({ contacts: [c], deals: [proceso({ contact_id: c.id })] })
    await cargar({ id: DUENO, role: 'dueno' })
    expect(de('deals')[0].orden).toEqual(['created_at desc', 'id'])
    expect(de('tasks')[0].orden).toEqual(['id'])
    expect(de('rpc:crm_ultimos_contactos')[0].orden).toEqual(['contacto_id'])
  })
})

describe('cargarCartera — alcance por vista', () => {
  it('coordinación: en la base, solo las cuatro etapas; y procesoEnVista vuelve a filtrar (descartado CON asesor y clase gratuita afuera)', async () => {
    const c1 = contacto('Solicitud')
    const c2 = contacto('Descartado con asesor')
    const c3 = contacto('Clase')
    const ok = proceso({ contact_id: c1.id })
    const lostConAsesor = proceso({ contact_id: c2.id, stage: 'lost', assigned_to: ASESOR_A })
    const clase = proceso({ contact_id: c3.id, origin: 'clase_gratuita' })
    usar({ contacts: [c1, c2, c3], deals: [ok, lostConAsesor, clase] })
    const d = await cargar({ id: COORD_1, role: 'coordinador' })
    expect(de('deals')[0].filtros).toContain('in:stage=request|scheduled|not_visited|lost')
    expect(d.filas.map((f) => f.id)).toEqual([ok.id])
    // La RPC no se pide por personas que no salen en la vista.
    expect(de('rpc:crm_ultimos_contactos')[0].args).toEqual({ p_contactos: [c1.id] })
    const json = JSON.stringify(d)
    expect(json).not.toContain(c2.id)
    expect(json).not.toContain(c3.id)
  })

  it('asesor: procesos y tareas filtrados por él en la base', async () => {
    const ca = contacto('De Ana')
    const cb = contacto('De Bruno')
    const pa = proceso({ contact_id: ca.id, assigned_to: ASESOR_A, stage: 'followup' })
    const pb = proceso({ contact_id: cb.id, assigned_to: ASESOR_B, stage: 'followup' })
    usar({
      contacts: [ca, cb], deals: [pa, pb],
      tasks: [tarea({ deal_id: pa.id, assigned_to: ASESOR_A }), tarea({ deal_id: pb.id, assigned_to: ASESOR_B, title: 'Tarea de Bruno' })],
    })
    const d = await cargar({ id: ASESOR_A, role: 'asesor' })
    expect(de('deals')[0].filtros).toContain(`eq:assigned_to=${ASESOR_A}`)
    expect(de('tasks')[0].filtros).toContain(`eq:assigned_to=${ASESOR_A}`)
    expect(d.filas.map((f) => f.id)).toEqual([pa.id])
    expect(d.vista).toEqual({ tipo: 'asesor', persona: { id: ASESOR_A, nombre: 'Ana Asesora', rol: 'asesor' }, mirando: false })
    expect(d.asesores).toBeNull()
    expect(d.opcionesVerComo).toBeNull()
  })

  it('dueño: todo, con la columna de asesores y las opciones de "Ver como" (activos, coordinación y asesores, por nombre)', async () => {
    const ca = contacto('Uno')
    const cb = contacto('Dos')
    usar({
      contacts: [ca, cb],
      deals: [proceso({ contact_id: ca.id, assigned_to: ASESOR_B, stage: 'followup' }), proceso({ contact_id: cb.id, assigned_to: ASESOR_A, stage: 'followup' })],
    })
    const d = await cargar({ id: DUENO, role: 'dueno' })
    expect(de('deals')[0].filtros).toEqual([])
    expect(d.filas).toHaveLength(2)
    expect(d.vista).toEqual({ tipo: 'dueno', persona: null, mirando: false })
    expect(d.asesores?.map((a) => a.nombre)).toEqual(['Ana Asesora', 'Bruno Asesor'])
    expect(d.opcionesVerComo).toEqual([
      { id: ASESOR_A, etiqueta: 'Ana Asesora · asesor' },
      { id: ASESOR_B, etiqueta: 'Bruno Asesor · asesor' },
      { id: COORD_2, etiqueta: 'Julian Coord · coordinación' },
      { id: COORD_1, etiqueta: 'Paula Coord · coordinación' },
    ])
  })
})

describe('cargarCartera — "Ver como"', () => {
  it('lee primero el perfil pedido (un eq) y arma la vista de esa persona', async () => {
    const ca = contacto('De Ana')
    const pa = proceso({ contact_id: ca.id, assigned_to: ASESOR_A, stage: 'followup' })
    usar({ contacts: [ca], deals: [pa, proceso({ contact_id: null, assigned_to: ASESOR_B, stage: 'followup' })] })
    const d = await cargar({ id: DUENO, role: 'dueno' }, ASESOR_A)
    const previa = indice((q) => q.tabla === 'profiles' && q.filtros.includes(`eq:id=${ASESOR_A}`))
    expect(previa).toBe(0)
    expect(d.vista).toEqual({ tipo: 'asesor', persona: { id: ASESOR_A, nombre: 'Ana Asesora', rol: 'asesor' }, mirando: true })
    expect(d.filas.map((f) => f.id)).toEqual([pa.id])
    // La vista de otra persona es lo que ESA persona ve: sin el selector.
    expect(d.opcionesVerComo).toBeNull()
  })

  it('a la coordinación: la vista de la coordinadora elegida con SUS tareas', async () => {
    const c = contacto('Sol')
    const p = proceso({ contact_id: c.id })
    usar({
      contacts: [c], deals: [p],
      tasks: [tarea({ deal_id: p.id, assigned_to: COORD_1, title: 'La de Paula' }), tarea({ deal_id: p.id, assigned_to: COORD_2, title: 'La de Julian', due_date: '2026-11-26' })],
    })
    const d = await cargar({ id: DUENO, role: 'dueno' }, COORD_1)
    expect(d.vista.tipo).toBe('coordinacion')
    expect(de('tasks')[0].filtros).toContain(`eq:assigned_to=${COORD_1}`)
    expect(JSON.stringify(d)).not.toContain('La de Julian')
  })

  it('pedido por un asesor o un coordinador → ver_como_prohibido, sin leer nada', async () => {
    usar({})
    for (const quien of [{ id: ASESOR_A, role: 'asesor' }, { id: COORD_1, role: 'coordinador' }]) {
      const r = await cargarCartera({ quien, verComo: ASESOR_B }, AHORA)
      expect(r).toEqual({ ok: false, motivo: 'ver_como_prohibido' })
    }
    expect(base.consultas).toEqual([])
  })

  it('a un abogado, un inactivo, un inexistente o un id que no es uuid → persona_invalida, sin leer procesos', async () => {
    usar({})
    for (const verComo of [ABOGADO, INACTIVO, uuid(999), 'no-es-uuid']) {
      const r = await cargarCartera({ quien: { id: DUENO, role: 'dueno' }, verComo }, AHORA)
      expect(r).toEqual({ ok: false, motivo: 'persona_invalida' })
    }
    expect(de('deals')).toEqual([])
  })

  it('un rol sin vista → sin_vista, sin leer nada', async () => {
    usar({})
    for (const role of ['abogado', 'agent', 'viewer']) {
      expect(await cargarCartera({ quien: { id: ABOGADO, role }, verComo: null }, AHORA)).toEqual({ ok: false, motivo: 'sin_vista' })
    }
    expect(base.consultas).toEqual([])
  })
})

describe('cargarCartera — copias de la coordinación (lectura (d))', () => {
  it('una hermana completada creada unos segundos ANTES que la copia pendiente se lee (corte = más vieja − 60 s) y la anula', async () => {
    const c = contacto('Sofía')
    const p = proceso({ contact_id: c.id })
    usar({
      contacts: [c], deals: [p],
      tasks: [
        tarea({ deal_id: p.id, assigned_to: COORD_2, title: 'Coordinar', type: 'update_contact', created_at: '2026-11-26T15:00:05.000Z' }),
        tarea({ deal_id: p.id, assigned_to: COORD_1, title: 'Coordinar', type: 'update_contact', created_at: '2026-11-26T15:00:00.000Z', status: 'completed' }),
      ],
    })
    let medido: { cerradasDesde: string | null; cerradasLeidas: number | null } | null = null
    const r = await cargarCartera({ quien: { id: DUENO, role: 'dueno' }, verComo: null }, AHORA, { alMedir: (x) => { medido = x } })
    if (!r.ok) throw new Error('esperaba ok')
    const d = de('tasks').find((q) => q.filtros.some((f) => f.startsWith('in:status=')))
    expect(d?.filtros).toContain('gte:created_at=2026-11-26T14:59:05.000Z')
    expect(d?.filtros).toContain('is:source_activity_id=null')
    expect(d?.select).toMatch(/source_activity_id/)
    expect(d?.select).toMatch(/created_at/)
    expect(d?.orden).toEqual(['id'])
    expect(r.datos.filas[0].proximo).toBeNull()
    expect(medido).toMatchObject({ cerradasDesde: '2026-11-26T14:59:05.000Z', cerradasLeidas: 1 })
  })

  it('sin copias pendientes de coordinación, (d) no se pide', async () => {
    const c = contacto('Sofía')
    const p = proceso({ contact_id: c.id, assigned_to: ASESOR_A, stage: 'followup' })
    usar({ contacts: [c], deals: [p], tasks: [tarea({ deal_id: p.id, assigned_to: ASESOR_A })] })
    await cargar({ id: DUENO, role: 'dueno' })
    expect(de('tasks')).toHaveLength(1)
  })

  it('(d) pagina con el mismo tope y avisa truncado', async () => {
    const c = contacto('Sofía')
    const p = proceso({ contact_id: c.id })
    const cerradas = Array.from({ length: TOPE_FILAS + 5 }, (_, i) =>
      tarea({ deal_id: p.id, assigned_to: COORD_1, title: `Vieja ${i}`, status: 'completed', created_at: '2026-11-26T15:30:00.000Z' }),
    )
    usar({ contacts: [c], deals: [p], tasks: [tarea({ deal_id: p.id, assigned_to: COORD_2, created_at: '2026-11-26T15:00:00.000Z' }), ...cerradas] })
    const d = await cargar({ id: DUENO, role: 'dueno' })
    const rangos = de('tasks').filter((x) => x.filtros.some((f) => f.startsWith('in:status='))).flatMap((x) => x.rangos)
    expect(rangos).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    expect(d.truncado).toBe(true)
  })

  it('si (d) falla, las tareas van con error (una copia ya hecha no se muestra como pendiente)', async () => {
    const c = contacto('Sofía')
    const p = proceso({ contact_id: c.id })
    usar(
      { contacts: [c], deals: [p], tasks: [tarea({ deal_id: p.id, assigned_to: COORD_2 })] },
      { fallarConsulta: (q) => q.tabla === 'tasks' && q.filtros.some((f) => f.startsWith('in:status=')) },
    )
    const d = await cargar({ id: DUENO, role: 'dueno' })
    expect(d.fuentes.tareas).toBe('error')
    expect(d.filas[0].proximo).toBe('error')
  })
})

describe('cargarCartera — paginación y tope', () => {
  it('procesos de a 1000 hasta 3000: pasado el tope quedan los más recientes y avisa truncado', async () => {
    const deals = Array.from({ length: TOPE_FILAS + 500 }, (_, i) =>
      proceso({ contact_id: null, created_at: new Date(Date.parse('2026-01-01T00:00:00.000Z') + i * 60_000).toISOString() }),
    )
    usar({ deals })
    const d = await cargar({ id: DUENO, role: 'dueno' })
    expect(de('deals').flatMap((q) => q.rangos)).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    expect(d.filas).toHaveLength(TOPE_FILAS)
    expect(d.truncado).toBe(true)
    const masViejo = deals[500].created_at
    expect(d.filas.every((f) => f.creadoEn >= masViejo)).toBe(true)
  })

  it('con menos de 1000, una sola página y sin truncado', async () => {
    usar({ deals: [proceso({ contact_id: null })] })
    const d = await cargar({ id: DUENO, role: 'dueno' })
    expect(de('deals').flatMap((q) => q.rangos)).toEqual([[0, 999]])
    expect(d.truncado).toBe(false)
  })
})

describe('cargarCartera — fallas', () => {
  it('falla la lectura de procesos → lanza', async () => {
    usar({}, { fallar: ['deals'] })
    await expect(cargarCartera({ quien: { id: DUENO, role: 'dueno' }, verComo: null }, AHORA)).rejects.toThrow(/deals/)
  })

  it('fallan las tareas → filas con proximo "error" y fuentes.tareas "error"', async () => {
    const c = contacto('Sofía')
    usar({ contacts: [c], deals: [proceso({ contact_id: c.id })] }, { fallar: ['tasks'] })
    const d = await cargar({ id: DUENO, role: 'dueno' })
    expect(d.fuentes).toEqual({ ultimoContacto: 'ok', tareas: 'error' })
    expect(d.filas[0].proximo).toBe('error')
  })

  it('falla la RPC → último contacto "error" y fuentes lo dice; el resto sale', async () => {
    const c = contacto('Sofía')
    usar({ contacts: [c], deals: [proceso({ contact_id: c.id })] }, { fallar: ['rpc:crm_ultimos_contactos'] })
    const d = await cargar({ id: DUENO, role: 'dueno' })
    expect(d.fuentes).toEqual({ ultimoContacto: 'error', tareas: 'ok' })
    expect(d.filas[0].ultimoContacto).toBe('error')
  })

  it('la RPC trae el último contacto de cada persona', async () => {
    const c = contacto('Sofía')
    usar(
      { contacts: [c], deals: [proceso({ contact_id: c.id })] },
      { ultimos: [{ contacto_id: c.id, actividad_at: '2026-11-27T13:00:00.000Z', actividad_tipo: 'call', actividad_resultado: 'no_atendio', visita_at: null }] },
    )
    const d = await cargar({ id: DUENO, role: 'dueno' })
    expect(d.filas[0].ultimoContacto).toEqual({ at: '2026-11-27T13:00:00.000Z', que: 'llamada', resultado: 'no_atendio' })
  })
})

describe('cargarCartera — un solo plazo de 15 s', () => {
  it('una lectura de procesos que no responde corta a los 15 s con error (no a los 32)', async () => {
    vi.useFakeTimers()
    usar({}, { colgar: ['deals'] })
    const p = cargarCartera({ quien: { id: DUENO, role: 'dueno' }, verComo: null }, AHORA)
    let estado = 'pendiente'
    p.then(() => { estado = 'ok' }, () => { estado = 'error' })
    await vi.advanceTimersByTimeAsync(PLAZO_LECTURA_MS - 100)
    expect(estado).toBe('pendiente')
    await vi.advanceTimersByTimeAsync(100)
    expect(estado).toBe('error')
    await expect(p).rejects.toThrow(/15 segundos/)
  })

  it('la RPC que no responde corta a los 15 s y la lista sale con el último contacto en error', async () => {
    vi.useFakeTimers()
    const c = contacto('Sofía')
    usar({ contacts: [c], deals: [proceso({ contact_id: c.id })] }, { colgar: ['rpc:crm_ultimos_contactos'] })
    const p = cargarCartera({ quien: { id: DUENO, role: 'dueno' }, verComo: null }, AHORA)
    await vi.advanceTimersByTimeAsync(PLAZO_LECTURA_MS)
    const r = await p
    if (!r.ok) throw new Error('esperaba ok')
    expect(r.datos.fuentes.ultimoContacto).toBe('error')
  })

  it('el plazo es PLAZO_LECTURA_MS = 15 s', () => {
    expect(PLAZO_LECTURA_MS).toBe(15_000)
    expect(TOPE_FILAS).toBe(3000)
  })
})

describe('leerOpcionesVerComo (6.3: la página abre ya mirando a otra persona)', () => {
  it('para el dueño: las mismas opciones que trae su vista propia', async () => {
    usar({})
    const propia = await cargar({ id: DUENO, role: 'dueno' })
    usar({})
    expect(await leerOpcionesVerComo({ role: 'dueno' })).toEqual(propia.opcionesVerComo)
    expect(de('profiles')).toHaveLength(1)
  })
  it('para cualquier otro rol: null sin leer nada', async () => {
    usar({})
    expect(await leerOpcionesVerComo({ role: 'asesor' })).toBeNull()
    expect(await leerOpcionesVerComo({ role: 'coordinador' })).toBeNull()
    expect(base.consultas).toHaveLength(0)
  })
})
