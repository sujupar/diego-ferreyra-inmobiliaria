/**
 * Lectura de Contactos (tarea 4.2, design.md D6) contra la base simulada. Las reglas de la
 * fila están en `lib/crm/contactos-cartera.test.ts`; acá: qué se lee para cada rol, que de
 * `appraisals` se pidan SOLO tres columnas (una lectura ancha tumbó la base el 2026-10-10),
 * y que la salida del asesor no traiga nada de otro asesor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { baseSimulada, type OpcionesBaseSimulada } from './cartera.simulada'

const m = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.cliente }))

import { cargarContactos, COLS_TASACION_DE_CONTACTO, TOPE_FILAS } from './cartera'

const AHORA = new Date('2026-11-27T15:00:00.000Z')
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const DUENO = uuid(1)
const COORD_1 = uuid(2)
const COORD_2 = uuid(3)
const ASESOR_A = uuid(4)
const ASESOR_B = uuid(5)

const perfiles = [
  { id: DUENO, full_name: 'Diego Dueño', role: 'dueno', is_active: true },
  { id: COORD_1, full_name: 'Paula Coord', role: 'coordinador', is_active: true },
  { id: COORD_2, full_name: 'Julian Coord', role: 'coordinador', is_active: true },
  { id: ASESOR_A, full_name: 'Ana Asesora', role: 'asesor', is_active: true },
  { id: ASESOR_B, full_name: 'Bruno Asesor', role: 'asesor', is_active: true },
]

let n = 100
function contacto(nombre: string, c: Record<string, unknown> = {}) {
  return {
    id: uuid(++n), full_name: nombre, phone: '1150000000', email: null, origin: 'embudo', assigned_to: null, created_by: null,
    created_at: new Date(Date.parse('2026-11-20T10:00:00.000Z') + n * 1000).toISOString(), ...c,
  }
}
function proceso(p: Record<string, unknown> & { contact_id: string | null }) {
  return {
    id: uuid(++n), stage: 'followup', scheduled_date: null, scheduled_time: null, origin: 'embudo', assigned_to: null,
    created_at: '2026-11-26T14:00:00.000Z', property_type: null, property_type_other: null, rooms: null,
    neighborhood: 'Palermo', property_address: 'Calle 1', tags: null, captured_at: null, lost_at: null,
    stage_changed_at: '2026-11-26T14:00:00.000Z', ...p,
  }
}
function tarea(t: Record<string, unknown> & { assigned_to: string }) {
  return {
    id: uuid(++n), type: 'follow_up', title: 'Llamar', deal_id: null, contact_id: null, due_date: '2026-11-27', due_time: null,
    all_day: true, channel: 'call', created_at: '2026-11-26T15:00:00.000Z', source_activity_id: null, status: 'pending', ...t,
  }
}
function tasacion(t: Record<string, unknown>) {
  // Fila "ancha" a propósito: si el servicio pidiera '*', la salida traería property_images.
  return { id: uuid(++n), contact_id: null, assigned_to: null, user_id: null, property_images: ['data:image/png;base64,AAAA'], ...t }
}

let base: ReturnType<typeof baseSimulada>
function usar(tablas: Record<string, Record<string, unknown>[]>, opciones: OpcionesBaseSimulada = {}) {
  base = baseSimulada({ profiles: perfiles, contacts: [], deals: [], tasks: [], appraisals: [], ...tablas }, {
    ...opciones,
    rpcs: { crm_ultimos_contactos: () => [] },
  })
  m.cliente = base.cliente
}
const de = (tabla: string) => base.consultas.filter((c) => c.tabla === tabla)

async function cargar(usuario: { id: string; role: string }) {
  const r = await cargarContactos(usuario, AHORA)
  if (!r) throw new Error('esperaba datos')
  return r
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave'
  n = 100
})

describe('cargarContactos — equipo', () => {
  it('coordinación, admin y dueño reciben a todos los contactos y no leen appraisals', async () => {
    const c1 = contacto('Uno')
    const c2 = contacto('Dos', { assigned_to: ASESOR_B })
    usar({ contacts: [c1, c2] })
    for (const role of ['coordinador', 'admin', 'dueno']) {
      const d = await cargar({ id: COORD_1, role })
      expect(d.filas.map((f) => f.id).sort()).toEqual([c1.id, c2.id].sort())
      expect(d.asesores).not.toBeNull()
    }
    expect(de('appraisals')).toEqual([])
  })

  it('contactos de a 1000 con orden fijo, hasta el tope, con truncado', async () => {
    const contactos = Array.from({ length: TOPE_FILAS + 10 }, (_, i) => contacto(`P${i}`))
    usar({ contacts: contactos })
    const d = await cargar({ id: COORD_1, role: 'coordinador' })
    expect(de('contacts').flatMap((q) => q.rangos)).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    expect(de('contacts')[0].orden).toEqual(['created_at desc', 'id'])
    expect(d.filas).toHaveLength(TOPE_FILAS)
    expect(d.truncado).toBe(true)
  })

  it('las tareas piden source_activity_id y created_at, y todas las lecturas llevan la señal del plazo', async () => {
    const c = contacto('Uno')
    usar({ contacts: [c], tasks: [tarea({ contact_id: c.id, assigned_to: COORD_1 })] })
    await cargar({ id: COORD_1, role: 'coordinador' })
    expect(de('tasks')[0].select).toMatch(/source_activity_id/)
    expect(de('tasks')[0].select).toMatch(/created_at/)
    for (const q of base.consultas) expect(q.conSenal).toBe(true)
  })

  it('una copia de coordinación pendiente cuya hermana se completó (creada unos segundos antes) no aparece como próximo paso', async () => {
    const c = contacto('Sofía')
    const p = proceso({ contact_id: c.id, stage: 'request' })
    usar({
      contacts: [c], deals: [p],
      tasks: [
        tarea({ deal_id: p.id, assigned_to: COORD_2, title: 'Coordinar', type: 'update_contact', created_at: '2026-11-26T15:00:05.000Z' }),
        tarea({ deal_id: p.id, assigned_to: COORD_1, title: 'Coordinar', type: 'update_contact', created_at: '2026-11-26T15:00:00.000Z', status: 'completed' }),
      ],
    })
    const d = await cargar({ id: DUENO, role: 'dueno' })
    const cerradas = de('tasks').find((q) => q.filtros.some((f) => f.startsWith('in:status=')))
    expect(cerradas?.filtros).toContain('gte:created_at=2026-11-26T14:59:05.000Z')
    expect(d.filas[0].proximo).toBeNull()
  })

  it('falla de tareas → próximo paso en error; falla de la RPC → último contacto en error; falla de contactos → lanza', async () => {
    const c = contacto('Uno')
    usar({ contacts: [c] }, { fallar: ['tasks'] })
    expect((await cargar({ id: COORD_1, role: 'coordinador' })).fuentes).toEqual({ ultimoContacto: 'ok', tareas: 'error' })
    usar({ contacts: [c] }, { fallar: ['rpc:crm_ultimos_contactos'] })
    expect((await cargar({ id: COORD_1, role: 'coordinador' })).fuentes).toEqual({ ultimoContacto: 'error', tareas: 'ok' })
    usar({ contacts: [c] }, { fallar: ['contacts'] })
    await expect(cargarContactos({ id: COORD_1, role: 'coordinador' }, AHORA)).rejects.toThrow(/contacts/)
  })

  it('un rol sin alcance (abogado, agent) → null, sin leer nada', async () => {
    usar({})
    expect(await cargarContactos({ id: uuid(9), role: 'abogado' }, AHORA)).toBeNull()
    expect(await cargarContactos({ id: uuid(9), role: 'agent' }, AHORA)).toBeNull()
    expect(base.consultas).toEqual([])
  })
})

describe('cargarContactos — asesor', () => {
  it('de appraisals pide SOLO contact_id, assigned_to, user_id, filtrado por él y con contact_id no nulo', async () => {
    usar({ contacts: [contacto('Uno')] })
    await cargar({ id: ASESOR_A, role: 'asesor' })
    const q = de('appraisals')
    expect(q.length).toBeGreaterThan(0)
    for (const x of q) {
      expect(x.select).toBe('contact_id, assigned_to, user_id')
      expect(x.filtros).toContain(`or:assigned_to.eq.${ASESOR_A},user_id.eq.${ASESOR_A}`)
      expect(x.filtros).toContain('not:contact_id.is=null')
    }
    expect(COLS_TASACION_DE_CONTACTO).toBe('contact_id, assigned_to, user_id')
  })

  it('ve solo sus contactos (asignado, creado, proceso, tasación) y ningún otro', async () => {
    const asignado = contacto('Asignado', { assigned_to: ASESOR_A })
    const creado = contacto('Creado', { created_by: ASESOR_A })
    const porProceso = contacto('Por proceso')
    const porTasacion = contacto('Por tasación')
    const ajeno = contacto('Ajeno', { assigned_to: ASESOR_B })
    usar({
      contacts: [asignado, creado, porProceso, porTasacion, ajeno],
      deals: [proceso({ contact_id: porProceso.id, assigned_to: ASESOR_A }), proceso({ contact_id: ajeno.id, assigned_to: ASESOR_B })],
      appraisals: [tasacion({ contact_id: porTasacion.id, assigned_to: ASESOR_A }), tasacion({ contact_id: ajeno.id, assigned_to: ASESOR_B })],
    })
    const d = await cargar({ id: ASESOR_A, role: 'asesor' })
    expect(d.filas.map((f) => f.nombre).sort()).toEqual(['Asignado', 'Creado', 'Por proceso', 'Por tasación'])
    expect(JSON.stringify(d)).not.toContain(ajeno.id)
    expect(JSON.stringify(d)).not.toContain('property_images')
    expect(d.asesores).toBeNull()
    // La RPC solo se pide por los contactos que el asesor ve.
    expect(de('rpc:crm_ultimos_contactos')[0].args?.p_contactos).not.toContain(ajeno.id)
  })

  it('contacto compartido: el proceso más nuevo es de otro asesor → la fila trae solo el suyo, sin nada del otro', async () => {
    const c = contacto('Compartida')
    const suyo = proceso({ contact_id: c.id, assigned_to: ASESOR_A, created_at: '2026-10-01T10:00:00.000Z', property_address: 'Suya 100', neighborhood: 'Caballito' })
    const delOtro = proceso({
      contact_id: c.id, assigned_to: ASESOR_B, stage: 'scheduled', scheduled_date: '2026-12-03', scheduled_time: '17:45:00',
      created_at: '2026-11-25T10:00:00.000Z', property_address: 'Ajena 999', neighborhood: 'Belgrano',
    })
    usar({
      contacts: [c], deals: [suyo, delOtro],
      tasks: [tarea({ deal_id: delOtro.id, assigned_to: ASESOR_B, title: 'Tarea secreta de Bruno' }), tarea({ deal_id: suyo.id, assigned_to: ASESOR_A, title: 'La de Ana' })],
    })
    const d = await cargar({ id: ASESOR_A, role: 'asesor' })
    expect(d.filas).toHaveLength(1)
    expect(d.filas[0].proceso?.id).toBe(suyo.id)
    const json = JSON.stringify(d)
    for (const ajeno of [delOtro.id, 'Ajena 999', 'Belgrano', '2026-12-03', '17:45', 'Bruno Asesor', ASESOR_B, 'Tarea secreta de Bruno']) {
      expect(json).not.toContain(ajeno)
    }
    // Procesos y tareas se piden ya filtrados por él en la base.
    expect(de('deals')[0].filtros).toContain(`eq:assigned_to=${ASESOR_A}`)
    expect(de('tasks')[0].filtros).toContain(`eq:assigned_to=${ASESOR_A}`)
  })

  it('el próximo paso del asesor cuenta solo sus tareas (también las ligadas solo al contacto)', async () => {
    const c = contacto('Mía', { assigned_to: ASESOR_A })
    usar({
      contacts: [c],
      tasks: [
        tarea({ contact_id: c.id, assigned_to: ASESOR_A, title: 'Llamar a Mía', due_date: '2026-11-28' }),
        tarea({ contact_id: c.id, assigned_to: COORD_1, title: 'De la coordinación', due_date: '2026-11-25' }),
      ],
    })
    const d = await cargar({ id: ASESOR_A, role: 'asesor' })
    const proximo = d.filas[0].proximo
    expect(proximo && proximo !== 'error' ? proximo.vence.due_date : null).toBe('2026-11-28')
    expect(JSON.stringify(d)).not.toContain('De la coordinación')
  })
})
