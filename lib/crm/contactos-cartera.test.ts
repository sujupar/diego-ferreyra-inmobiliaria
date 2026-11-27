// crm-cartera-por-rol, tarea 3.8: la lista de Contactos (design.md D5 y D6).
import { describe, it, expect } from 'vitest'
import { armarFilasContactos, contactoVisible, procesoDeContacto, type ContactoLeido } from './contactos-cartera'
import { puedeVerContacto, type VinculosContacto } from '@/lib/auth/contact-access'
import type { PerfilCartera, ProcesoLeido, TareaLeida } from './cartera'
import type { ContactoRegistrado } from './ultimo-contacto'

const AHORA = new Date('2026-12-02T13:40:00Z')
const PERFILES = new Map<string, PerfilCartera>([
  ['coord-1', { nombre: 'Paula Pandolfo', role: 'coordinador', activo: true }],
  ['coord-2', { nombre: 'Julian Coordinador', role: 'coordinador', activo: true }],
  ['asesor-1', { nombre: 'Tomás Agüero', role: 'asesor', activo: true }],
  ['asesor-2', { nombre: 'Florencia Ledesma', role: 'asesor', activo: true }],
])
const COORD = { id: 'coord-1', role: 'coordinador' }
const ASESOR = { id: 'asesor-1', role: 'asesor' }
const DUENO = { id: 'dueno-1', role: 'dueno' }

let n = 0
function proceso(p: Partial<ProcesoLeido> & { contact_id: string }): ProcesoLeido {
  n += 1
  return {
    id: `d-${n}`,
    stage: 'followup',
    scheduled_date: null,
    scheduled_time: null,
    origin: 'referido',
    assigned_to: null,
    created_at: '2026-11-01T12:00:00Z',
    property_type: null,
    property_type_other: null,
    rooms: null,
    neighborhood: 'Palermo',
    property_address: 'Gorriti 4000',
    tags: null,
    captured_at: null,
    lost_at: null,
    stage_changed_at: null,
    contacto: null,
    ...p,
  }
}
function contacto(c: Partial<ContactoLeido> & { id: string }): ContactoLeido {
  return {
    full_name: `Persona ${c.id}`,
    phone: '11 5555-0148',
    email: null,
    origin: 'referido',
    assigned_to: null,
    created_by: null,
    created_at: '2026-10-01T12:00:00Z',
    ...c,
  }
}
function tarea(t: Partial<TareaLeida>): TareaLeida {
  n += 1
  return {
    id: `t-${n}`,
    type: 'follow_up',
    title: 'Llamar a X',
    assigned_to: 'asesor-1',
    deal_id: null,
    contact_id: null,
    due_date: '2026-12-03',
    due_time: '09:00',
    all_day: false,
    channel: 'call',
    created_at: '2026-12-01T12:00:00Z',
    source_activity_id: null,
    status: 'pending',
    ...t,
  }
}

describe('procesoDeContacto', () => {
  const p = (id: string, stage: string, created_at: string, assigned_to: string | null = null) => ({
    id, stage, created_at, scheduled_date: null, assigned_to,
  })
  it('sin procesos → null', () => {
    expect(procesoDeContacto([], DUENO)).toBeNull()
  })
  it('solo cerrados → el cerrado más reciente', () => {
    expect(procesoDeContacto([p('a', 'lost', '2026-01-01'), p('b', 'captured', '2026-05-01')], DUENO)?.id).toBe('b')
  })
  it('un abierto y un cerrado más nuevo → el abierto', () => {
    expect(procesoDeContacto([p('ab', 'followup', '2026-01-01'), p('ce', 'lost', '2026-05-01')], DUENO)?.id).toBe('ab')
  })
  it('Comprador cuenta como abierto', () => {
    expect(procesoDeContacto([p('comp', 'comprador', '2026-01-01'), p('ce', 'lost', '2026-05-01')], DUENO)?.id).toBe('comp')
  })
  it('dos abiertos → el más reciente', () => {
    expect(procesoDeContacto([p('viejo', 'request', '2026-01-01'), p('nuevo', 'followup', '2026-05-01')], COORD)?.id).toBe('nuevo')
  })
  it('asesor con uno suyo y otro más nuevo de otro asesor → el suyo', () => {
    expect(procesoDeContacto([p('mio', 'followup', '2026-01-01', 'asesor-1'), p('ajeno', 'followup', '2026-05-01', 'asesor-2')], ASESOR)?.id).toBe('mio')
  })
  it('asesor sin ningún proceso suyo → null', () => {
    expect(procesoDeContacto([p('ajeno', 'followup', '2026-05-01', 'asesor-2'), p('nadie', 'request', '2026-06-01')], ASESOR)).toBeNull()
  })
})

describe('contactoVisible es puedeVerContacto', () => {
  const casos: [string, VinculosContacto][] = [
    ['asignado', { assigned_to: 'asesor-1', created_by: null, asesoresDeProcesos: [], asesoresDeTasaciones: [] }],
    ['creador', { assigned_to: null, created_by: 'asesor-1', asesoresDeProcesos: [], asesoresDeTasaciones: [] }],
    ['proceso', { assigned_to: null, created_by: null, asesoresDeProcesos: ['asesor-1'], asesoresDeTasaciones: [] }],
    ['tasación', { assigned_to: null, created_by: null, asesoresDeProcesos: [], asesoresDeTasaciones: ['asesor-1'] }],
    ['ajeno', { assigned_to: 'asesor-2', created_by: null, asesoresDeProcesos: ['asesor-2'], asesoresDeTasaciones: [] }],
  ]
  const usuarios = [ASESOR, COORD, DUENO, { id: 'x', role: 'abogado' }, { id: 'x', role: 'inventado' }, { id: 'admin', role: 'admin' }]
  for (const [nombre, v] of casos) {
    for (const u of usuarios) {
      it(`${u.role} · ${nombre}`, () => {
        expect(contactoVisible(u, v)).toBe(puedeVerContacto(u, v))
      })
    }
  }
  it('el asesor ve al asignado y no al ajeno (control directo)', () => {
    expect(contactoVisible(ASESOR, casos[0][1])).toBe(true)
    expect(contactoVisible(ASESOR, casos[4][1])).toBe(false)
  })
})

describe('armarFilasContactos', () => {
  const armar = (e: {
    usuario: { id: string; role: string }
    contactos: ContactoLeido[]
    procesos?: ProcesoLeido[]
    tasaciones?: { contact_id: string; assigned_to: string | null; user_id: string | null }[]
    tareas?: TareaLeida[] | 'error'
    tareasCerradas?: TareaLeida[]
    ultimos?: Map<string, ContactoRegistrado> | 'error'
  }) =>
    armarFilasContactos({
      usuario: e.usuario,
      contactos: e.contactos,
      procesos: e.procesos ?? [],
      tasaciones: e.tasaciones ?? [],
      tareas: e.tareas ?? [],
      tareasCerradas: e.tareasCerradas ?? [],
      ultimos: e.ultimos ?? new Map(),
      perfiles: PERFILES,
      ahora: AHORA,
    })

  it('con proceso abierto: la fila lleva su proceso, la propiedad y el teléfono', () => {
    const [f] = armar({
      usuario: COORD,
      contactos: [contacto({ id: 'c1', full_name: 'Ana Pinto' })],
      procesos: [proceso({ contact_id: 'c1', assigned_to: 'asesor-1' })],
    })
    expect(f).toMatchObject({
      id: 'c1',
      contactoId: 'c1',
      nombre: 'Ana Pinto',
      telefono: '11 5555-0148',
      proceso: { etapa: 'seguimiento' },
      conProcesoAbierto: true,
      propiedad: 'Palermo',
      direccion: 'Gorriti 4000',
      asesor: { id: 'asesor-1', nombre: 'Tomás Agüero', activo: true },
      registradoEn: '2026-10-01T12:00:00Z',
      creadoEn: '2026-10-01T12:00:00Z',
    })
  })
  it('sin ningún proceso: "Sin proceso" (proceso null) y sin proceso abierto', () => {
    const [f] = armar({ usuario: COORD, contactos: [contacto({ id: 'c1' })] })
    expect(f.proceso).toBeNull()
    expect(f.conProcesoAbierto).toBe(false)
  })
  it('solo con un proceso cerrado: sin proceso abierto, con su cierre', () => {
    const [f] = armar({
      usuario: COORD,
      contactos: [contacto({ id: 'c1' })],
      procesos: [proceso({ contact_id: 'c1', stage: 'lost', lost_at: '2026-11-20T12:00:00Z' })],
    })
    expect(f).toMatchObject({ conProcesoAbierto: false, proceso: { etapa: 'descartado' }, cerradoEn: '2026-11-20T12:00:00Z' })
  })
  it('las tareas ligadas solo al contacto cuentan para el próximo paso', () => {
    const [f] = armar({
      usuario: COORD,
      contactos: [contacto({ id: 'c1' })],
      tareas: [tarea({ contact_id: 'c1', title: 'Llamar a Persona c1', assigned_to: 'coord-1' })],
      ultimos: new Map([['c1', { at: '2026-11-30T12:00:00Z', que: 'llamada', resultado: 'no_atendio' }]]),
    })
    expect(f.proximo).toMatchObject({ titulo: 'Llamar' })
  })
  it('las tareas del proceso que se muestra cuentan; las de otro proceso, no', () => {
    const mio = proceso({ contact_id: 'c1', assigned_to: 'asesor-1' })
    const otro = proceso({ contact_id: 'c1', stage: 'lost', assigned_to: 'asesor-1' })
    const [f] = armar({
      usuario: COORD,
      contactos: [contacto({ id: 'c1' })],
      procesos: [mio, otro],
      tareas: [tarea({ deal_id: otro.id, title: 'Del otro', due_date: '2026-12-02', due_time: '08:00' }), tarea({ deal_id: mio.id, title: 'Del suyo' })],
    })
    expect(f.proximo).toMatchObject({ titulo: 'Del suyo' })
  })
  it('el asesor: solo sus contactos, y con solo sus tareas', () => {
    const filas = armar({
      usuario: ASESOR,
      contactos: [contacto({ id: 'mio', assigned_to: 'asesor-1' }), contacto({ id: 'ajeno', assigned_to: 'asesor-2' })],
      tareas: [
        tarea({ contact_id: 'mio', title: 'De la coordinación', assigned_to: 'coord-1', due_date: '2026-12-02', due_time: '08:00' }),
        tarea({ contact_id: 'mio', title: 'Suya', assigned_to: 'asesor-1' }),
      ],
    })
    expect(filas.map((f) => f.id)).toEqual(['mio'])
    expect(filas[0].proximo).toMatchObject({ titulo: 'Suya', quien: null })
  })
  it('el asesor ve a una persona del embudo sin asesor en el contacto si tiene un proceso suyo', () => {
    const filas = armar({
      usuario: ASESOR,
      contactos: [contacto({ id: 'embudo', origin: 'embudo' })],
      procesos: [proceso({ contact_id: 'embudo', assigned_to: 'asesor-1' })],
    })
    expect(filas.map((f) => f.id)).toEqual(['embudo'])
  })
  it('el asesor ve a alguien por una tasación suya', () => {
    const filas = armar({ usuario: ASESOR, contactos: [contacto({ id: 't' })], tasaciones: [{ contact_id: 't', assigned_to: null, user_id: 'asesor-1' }] })
    expect(filas.map((f) => f.id)).toEqual(['t'])
    expect(filas[0].proceso).toBeNull()
  })
  it('contacto compartido: la fila del asesor no trae NADA del proceso más nuevo del otro asesor', () => {
    const suyo = proceso({ contact_id: 'c', assigned_to: 'asesor-1', created_at: '2026-01-01T12:00:00Z', property_address: 'Mi calle 1', neighborhood: 'Mío' })
    const ajeno = proceso({
      contact_id: 'c', assigned_to: 'asesor-2', stage: 'scheduled', scheduled_date: '2026-12-03', scheduled_time: '11:00',
      created_at: '2026-11-20T12:00:00Z', property_address: 'Calle Ajena 999', neighborhood: 'Ajeno',
    })
    const filas = armar({
      usuario: ASESOR,
      contactos: [contacto({ id: 'c' })],
      procesos: [suyo, ajeno],
      tareas: [tarea({ deal_id: ajeno.id, assigned_to: 'asesor-2', title: 'Tarea ajena' })],
    })
    const texto = JSON.stringify(filas)
    expect(filas[0].proceso?.id).toBe(suyo.id)
    expect(texto).not.toContain(ajeno.id)
    expect(texto).not.toContain('Calle Ajena 999')
    expect(texto).not.toContain('Ajeno')
    expect(texto).not.toContain('Florencia Ledesma')
    expect(texto).not.toContain('asesor-2')
    expect(texto).not.toContain('2026-12-03')
    expect(texto).not.toContain('Tarea ajena')
  })
  it('el asesor con un contacto visible pero sin proceso suyo: "Sin proceso"', () => {
    const [f] = armar({
      usuario: ASESOR,
      contactos: [contacto({ id: 'c', assigned_to: 'asesor-1' })],
      procesos: [proceso({ contact_id: 'c', assigned_to: 'asesor-2' })],
    })
    expect(f.proceso).toBeNull()
    expect(f.asesor).toBeNull()
    expect(JSON.stringify(f)).not.toContain('asesor-2')
  })
  it('el equipo: copias de la coordinación juntas y la completada anula', () => {
    const base = { contact_id: 'c1', type: 'update_contact', title: 'Contactar a X', channel: null, due_date: null, due_time: null }
    const [f] = armar({
      usuario: DUENO,
      contactos: [contacto({ id: 'c1' })],
      tareas: [tarea({ ...base, assigned_to: 'coord-2', created_at: '2026-10-01T12:00:00.300Z' })],
      tareasCerradas: [tarea({ ...base, assigned_to: 'coord-1', status: 'completed', created_at: '2026-10-01T12:00:00.100Z' })],
    })
    expect(f.proximo).toBeNull()
  })
  it('abogado o un rol inventado → ninguna fila', () => {
    expect(armar({ usuario: { id: 'x', role: 'abogado' }, contactos: [contacto({ id: 'c' })] })).toEqual([])
    expect(armar({ usuario: { id: 'x', role: 'viewer' }, contactos: [contacto({ id: 'c' })] })).toEqual([])
  })
  it('si las tareas fallaron → "error"; si el último contacto falló → "error"', () => {
    const [f] = armar({ usuario: COORD, contactos: [contacto({ id: 'c' })], tareas: 'error', ultimos: 'error' })
    expect(f.proximo).toBe('error')
    expect(f.ultimoContacto).toBe('error')
  })
  it('el último contacto es de la persona', () => {
    const ult: ContactoRegistrado = { at: '2026-11-30T12:00:00Z', que: 'visita', resultado: null }
    const [f] = armar({ usuario: COORD, contactos: [contacto({ id: 'c' })], ultimos: new Map([['c', ult]]) })
    expect(f.ultimoContacto).toEqual(ult)
  })
})
