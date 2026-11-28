// crm-cartera-por-rol, tarea 3.5: armarFilasCartera, proximoPaso y las tres reglas de
// "trabado" (design.md D3 y D5). Fechas: 2026-12-02 es miércoles; 13:40 UTC = 10:40 AR.
import { describe, it, expect } from 'vitest'
import {
  SIN_MOVIMIENTO_DIAS,
  agrupar,
  armarFilasCartera,
  colapsarCopiasDeCoordinacion,
  proximoPaso,
  quitarNombreDelTitulo,
  sinAsesor,
  sinMovimiento,
  sinPrimerContacto,
  type FilaCartera,
  type PerfilCartera,
  type ProcesoLeido,
  type TareaLeida,
} from './cartera'
import type { Vista } from './cartera-vista'
import type { ContactoRegistrado } from './ultimo-contacto'

const AHORA = new Date('2026-12-02T13:40:00Z')
const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`).toISOString()

const PERFILES = new Map<string, PerfilCartera>([
  ['coord-1', { nombre: 'Paula Pandolfo', role: 'coordinador', activo: true }],
  ['coord-2', { nombre: 'Julian Coordinador', role: 'coordinador', activo: true }],
  ['asesor-1', { nombre: 'Tomás Agüero', role: 'asesor', activo: true }],
  ['asesor-2', { nombre: 'Florencia Ledesma', role: 'asesor', activo: true }],
  ['asesor-baja', { nombre: 'Martín Ruiz', role: 'asesor', activo: false }],
  ['dueno-1', { nombre: 'Diego Ferreyra', role: 'dueno', activo: true }],
])
const COORD: Vista = { tipo: 'coordinacion', personaId: 'coord-1' }
const ASESOR: Vista = { tipo: 'asesor', personaId: 'asesor-1' }
const DUENO: Vista = { tipo: 'dueno' }

let n = 0
function proceso(p: Partial<ProcesoLeido> = {}): ProcesoLeido {
  n += 1
  const id = p.id ?? `d-${n}`
  return {
    id,
    stage: 'request',
    scheduled_date: null,
    scheduled_time: null,
    origin: 'embudo',
    assigned_to: null,
    created_at: ar('2026-12-01', '10:00'),
    property_type: null,
    property_type_other: null,
    rooms: null,
    neighborhood: 'Villa Crespo',
    property_address: 'Thames 640',
    tags: null,
    captured_at: null,
    lost_at: null,
    stage_changed_at: null,
    contact_id: `c-${id}`,
    contacto: { id: `c-${id}`, full_name: 'Sofía Lanús', phone: '11 5555-0148', email: null, created_at: ar('2026-12-01', '10:00') },
    ...p,
  }
}
function tarea(t: Partial<TareaLeida> & { deal_id: string | null }): TareaLeida {
  n += 1
  return {
    id: t.id ?? `t-${n}`,
    type: 'follow_up',
    title: 'Llamada 2 a Sofía Lanús',
    assigned_to: 'coord-1',
    contact_id: null,
    due_date: '2026-12-03',
    due_time: '09:00',
    all_day: false,
    channel: 'call',
    created_at: ar('2026-12-01', '10:00'),
    source_activity_id: null,
    status: 'pending',
    ...t,
  }
}
const llamada = (at: string, resultado: ContactoRegistrado['resultado'] = 'no_atendio'): ContactoRegistrado => ({
  at,
  que: 'llamada',
  resultado,
})

function armar(e: {
  vista?: Vista
  procesos: ProcesoLeido[]
  tareas?: TareaLeida[] | 'error'
  tareasCerradas?: TareaLeida[]
  ultimos?: Map<string, ContactoRegistrado> | 'error'
  ahora?: Date
}): FilaCartera[] {
  return armarFilasCartera({
    vista: e.vista ?? DUENO,
    procesos: e.procesos,
    tareas: e.tareas ?? [],
    tareasCerradas: e.tareasCerradas ?? [],
    ultimos: e.ultimos ?? new Map(),
    perfiles: PERFILES,
    ahora: e.ahora ?? AHORA,
  })
}
const una = (filas: FilaCartera[]) => {
  expect(filas).toHaveLength(1)
  return filas[0]
}
const paso = (f: FilaCartera) => {
  if (f.proximo === null || f.proximo === 'error') throw new Error(`sin próximo paso: ${String(f.proximo)}`)
  return f.proximo
}

describe('armarFilasCartera — la fila', () => {
  it('arma nombre, teléfono, propiedad, dirección, etapa y origen', () => {
    const f = una(
      armar({
        procesos: [proceso({ id: 'd-sofia', property_type: 'ph', rooms: 4, neighborhood: 'Colegiales', property_address: 'Conesa 1250' })],
      }),
    )
    expect(f).toMatchObject({
      id: 'd-sofia',
      contactoId: 'c-d-sofia',
      nombre: 'Sofía Lanús',
      telefono: '11 5555-0148',
      propiedad: 'PH 4 amb · Colegiales',
      direccion: 'Conesa 1250',
      etapa: 'solicitud',
      abierto: true,
      origen: 'embudo',
      colega: false,
    })
  })
  it('sin tipo ni ambientes, la propiedad es solo el barrio', () => {
    expect(una(armar({ procesos: [proceso()] })).propiedad).toBe('Villa Crespo')
  })
  it('departamento se abrevia "Depto" y "otro" usa el texto cargado', () => {
    const [a, b] = armar({
      procesos: [
        proceso({ property_type: 'departamento', rooms: 2, neighborhood: 'Saavedra' }),
        proceso({ property_type: 'otro', property_type_other: 'Local', neighborhood: null }),
      ],
    })
    expect(a.propiedad).toBe('Depto 2 amb · Saavedra')
    expect(b.propiedad).toBe('Local')
  })
  it('proceso sin contacto: "Sin nombre" y sin contactoId (la fila abre el proceso)', () => {
    const f = una(armar({ procesos: [proceso({ contact_id: null, contacto: null })] }))
    expect(f.nombre).toBe('Sin nombre')
    expect(f.contactoId).toBeNull()
    expect(f.ultimoContacto).toBeNull()
  })
  it('marca a los colegas', () => {
    expect(una(armar({ procesos: [proceso({ stage: 'lost', tags: ['colega'] })] })).colega).toBe(true)
  })
  it('un cerrado trae su fecha de cierre (captada, descartado, o el cambio de etapa si falta)', () => {
    const [cap, des, sin] = armar({
      procesos: [
        proceso({ stage: 'captured', captured_at: '2026-11-20T12:00:00Z', assigned_to: 'asesor-1' }),
        proceso({ stage: 'lost', lost_at: '2026-11-27T12:00:00Z' }),
        proceso({ stage: 'lost', stage_changed_at: '2026-11-15T12:00:00Z' }),
      ],
    })
    expect(cap.cerradoEn).toBe('2026-11-20T12:00:00Z')
    expect(des.cerradoEn).toBe('2026-11-27T12:00:00Z')
    expect(sin.cerradoEn).toBe('2026-11-15T12:00:00Z')
    expect(cap.abierto).toBe(false)
  })
  it('el asesor dado de baja viaja con activo=false y su nombre', () => {
    const f = una(armar({ procesos: [proceso({ stage: 'followup', assigned_to: 'asesor-baja' })] }))
    expect(f.asesor).toEqual({ id: 'asesor-baja', nombre: 'Martín Ruiz', activo: false })
    expect(sinAsesor(f)).toBe(true)
  })
  it('sin asesor → asesor null', () => {
    expect(una(armar({ procesos: [proceso()] })).asesor).toBeNull()
  })
  it('anteriorAlRegistro según el día de creación del proceso', () => {
    const [viejo, nuevo] = armar({ procesos: [proceso({ created_at: '2025-09-12T13:00:00Z' }), proceso()] })
    expect(viejo.anteriorAlRegistro).toBe(true)
    expect(nuevo.anteriorAlRegistro).toBe(false)
  })
  it('un proceso fuera de la vista no llega a ninguna fila', () => {
    const filas = armar({ vista: ASESOR, procesos: [proceso({ assigned_to: 'asesor-2', stage: 'followup' })] })
    expect(filas).toEqual([])
  })
  it('la coordinación no recibe clases gratuitas ni procesos avanzados', () => {
    const filas = armar({
      vista: COORD,
      procesos: [
        proceso({ stage: 'clase_gratuita', origin: 'clase_gratuita' }),
        proceso({ stage: 'visited', assigned_to: 'asesor-1' }),
        proceso({ id: 'd-sol' }),
      ],
    })
    expect(filas.map((f) => f.id)).toEqual(['d-sol'])
  })
})

describe('armarFilasCartera — último contacto', () => {
  it('es el de la persona (cualquier proceso): viene del mapa por contacto', () => {
    const ult = llamada('2026-12-02T12:40:00Z')
    const [a, b] = armar({
      procesos: [proceso({ id: 'x1', contact_id: 'c-1', contacto: { id: 'c-1', full_name: 'A', phone: null, email: null, created_at: AHORA.toISOString() } }),
        proceso({ id: 'x2', stage: 'lost', contact_id: 'c-1', contacto: { id: 'c-1', full_name: 'A', phone: null, email: null, created_at: AHORA.toISOString() } })],
      ultimos: new Map([['c-1', ult]]),
    })
    expect(a.ultimoContacto).toEqual(ult)
    expect(b.ultimoContacto).toEqual(ult)
  })
  it('sin ninguno → null', () => {
    expect(una(armar({ procesos: [proceso()] })).ultimoContacto).toBeNull()
  })
  it('si la fuente falló → "error" en todas las filas', () => {
    const filas = armar({ procesos: [proceso(), proceso({ stage: 'lost' })], ultimos: 'error' })
    expect(filas.map((f) => f.ultimoContacto)).toEqual(['error', 'error'])
  })
})

describe('armarFilasCartera — de quién son las tareas que cuentan', () => {
  const d = () => proceso({ id: 'd-x', stage: 'followup', assigned_to: 'asesor-1' })
  const tareas = () => [
    tarea({ deal_id: 'd-x', title: 'Llamar a Sofía Lanús', assigned_to: 'coord-1', due_date: '2026-12-02', due_time: '17:00' }),
    tarea({ deal_id: 'd-x', title: 'Entregar la tasación a Sofía Lanús', assigned_to: 'asesor-1', due_date: '2026-12-03', due_time: '09:00' }),
  ]
  it('la coordinación cuenta solo la suya', () => {
    // Con una llamada ya registrada (si no, sería "Primera llamada").
    const f = una(armar({ vista: COORD, procesos: [proceso({ id: 'd-x' })], tareas: tareas(), ultimos: new Map([['c-d-x', llamada('2026-12-01T15:00:00Z')]]) }))
    expect(paso(f).titulo).toBe('Llamar')
    expect(paso(f).quien).toBeNull()
  })
  it('el asesor cuenta solo la suya', () => {
    const f = una(armar({ vista: ASESOR, procesos: [d()], tareas: tareas() }))
    expect(paso(f).titulo).toBe('Entregar la tasación')
    expect(paso(f).quien).toBeNull()
  })
  it('el dueño cuenta la de cualquiera, con "· nombre" de quien la tiene', () => {
    const f = una(armar({ vista: DUENO, procesos: [d()], tareas: tareas() }))
    expect(paso(f).titulo).toBe('Llamar')
    expect(paso(f).quien).toEqual({ id: 'coord-1', nombre: 'Paula Pandolfo' })
  })
  it('el dueño: si la tarea es del mismo asesor de la columna, no repite el nombre', () => {
    const f = una(armar({ vista: DUENO, procesos: [d()], tareas: [tareas()[1]] }))
    expect(paso(f).quien).toBeNull()
  })
  it('una tarea de otro proceso nunca llega a la fila', () => {
    const f = una(armar({ vista: DUENO, procesos: [d()], tareas: [tarea({ deal_id: 'd-otro' })] }))
    expect(f.proximo).toBeNull()
  })
  it('una tarea ligada solo al contacto (sin proceso) no cuenta en el CRM', () => {
    const f = una(armar({ vista: DUENO, procesos: [d()], tareas: [tarea({ deal_id: null, contact_id: 'c-d-x' })] }))
    expect(f.proximo).toBeNull()
  })
  it('las tareas de propiedades no cuentan', () => {
    const f = una(
      armar({
        vista: DUENO,
        procesos: [proceso({ id: 'd-x', stage: 'captured', assigned_to: 'asesor-1' })].map((p) => ({ ...p, stage: 'followup' })),
        tareas: ['informe_quincenal', 'review_property', 'rejected_docs', 'complete_imported_property'].map((type) =>
          tarea({ deal_id: 'd-x', type, title: 'Informe', assigned_to: 'asesor-1' }),
        ),
      }),
    )
    expect(f.proximo).toBeNull()
  })
  it('una tarea ya completada (en la lista de pendientes por error) no cuenta', () => {
    const f = una(armar({ vista: DUENO, procesos: [d()], tareas: [tarea({ deal_id: 'd-x', status: 'completed' })] }))
    expect(f.proximo).toBeNull()
  })
  it('un cerrado con una tarea pendiente → sin próximo paso (null)', () => {
    const f = una(armar({ vista: DUENO, procesos: [proceso({ id: 'd-x', stage: 'lost' })], tareas: [tarea({ deal_id: 'd-x' })] }))
    expect(f.proximo).toBeNull()
  })
  it('si las tareas fallaron → "error" en los abiertos y null en los cerrados', () => {
    const [ab, ce] = armar({ procesos: [proceso(), proceso({ stage: 'lost' })], tareas: 'error' })
    expect(ab.proximo).toBe('error')
    expect(ce.proximo).toBeNull()
  })
  it('la asignación con tasación agendada no es el próximo paso (regla de la ficha)', () => {
    const f = una(
      armar({
        vista: DUENO,
        procesos: [proceso({ id: 'd-x', stage: 'scheduled', scheduled_date: '2026-12-05', scheduled_time: '11:00', assigned_to: 'asesor-1' })],
        tareas: [tarea({ deal_id: 'd-x', type: 'new_assignment', title: 'Nueva asignación', assigned_to: 'asesor-1', due_date: '2026-12-02', due_time: '08:00' })],
      }),
    )
    expect(paso(f).titulo).toBe('Tasación')
  })
  it('la asignación sin tasación agendada sí cuenta', () => {
    const f = una(
      armar({
        vista: DUENO,
        procesos: [proceso({ id: 'd-x', stage: 'visited', assigned_to: 'asesor-1' })],
        tareas: [tarea({ deal_id: 'd-x', type: 'new_assignment', title: 'Nueva asignación', assigned_to: 'asesor-1' })],
      }),
    )
    expect(paso(f).titulo).toBe('Nueva asignación')
  })
})

describe('quitarNombreDelTitulo con dos puntos (QA 9.3)', () => {
  it('saca el nombre de los títulos automáticos "X: Nombre"', () => {
    expect(quitarNombreDelTitulo('Seguimiento mensaje: EDUARDO STANIC', 'Eduardo Stanic')).toBe('Seguimiento mensaje')
    expect(quitarNombreDelTitulo('Nuevo lead (Embudo): Sofía Lanús', 'Sofia Lanus')).toBe('Nuevo lead (Embudo)')
    expect(quitarNombreDelTitulo('Nota: llamar a otro', 'Sofía Lanús')).toBe('Nota: llamar a otro')
    expect(quitarNombreDelTitulo(': Ana', 'Ana')).toBe(': Ana')
  })
})

describe('copias de una tarea de la coordinación (createTaskForRole)', () => {
  it('regla por pares: la pendiente se anula por la cerrada a ≤60 s de ella, no por la del extremo (B7, H4)', () => {
    const base = Date.parse('2026-11-26T15:00:00.000Z')
    const en = (s: number) => new Date(base + s * 1000).toISOString()
    const t = (id: string, s: number, status?: string) => ({ ...tarea({ deal_id: 'd-x', id }), created_at: en(s), ...(status ? { status } : {}) }) as TareaLeida
    expect(colapsarCopiasDeCoordinacion([t('p1', 100)], [t('c1', 0, 'completed'), t('c2', 50, 'completed')], () => true)).toEqual([])
    expect(colapsarCopiasDeCoordinacion([t('p1', 100)], [t('c1', 0, 'completed')], () => true).map((x) => x.tarea.id)).toEqual(['p1'])
  })
  it('regla por pares (H4): cada pendiente se anula por una cerrada a ±60 s de ella', () => {
    const base = Date.parse('2026-11-26T15:00:00.000Z')
    const en = (s: number) => new Date(base + s * 1000).toISOString()
    const t = (id: string, s: number, status?: string) => ({ ...tarea({ deal_id: 'd-x', id }), created_at: en(s), ...(status ? { status } : {}) }) as TareaLeida
    expect(colapsarCopiasDeCoordinacion([t('a', 0), t('b', 70)], [t('c', 40, 'completed')], () => true)).toEqual([])
    const dos = colapsarCopiasDeCoordinacion([t('a', 0), t('b', 0.5), t('z', 200)], [], () => true)
    expect(dos.map((x) => [x.tarea.id, x.copias])).toEqual([['a', 2], ['z', 1]])
  })
  const base = { deal_id: 'd-x', type: 'update_contact', title: 'Contactar a Sofía Lanús', due_date: null, due_time: null, channel: null }
  const d = () => proceso({ id: 'd-x', created_at: '2025-10-01T12:00:00Z' })
  it('dos copias pendientes cuentan una vez, con "· coordinación"', () => {
    const f = una(
      armar({
        procesos: [d()],
        tareas: [
          tarea({ ...base, assigned_to: 'coord-1', created_at: '2026-10-01T12:00:00.100Z' }),
          tarea({ ...base, assigned_to: 'coord-2', created_at: '2026-10-01T12:00:00.300Z' }),
        ],
      }),
    )
    expect(paso(f).quien).toEqual({ id: 'coordinacion', nombre: 'coordinación' })
  })
  it('si una copia se completó, ninguna cuenta', () => {
    const f = una(
      armar({
        procesos: [d()],
        tareas: [tarea({ ...base, assigned_to: 'coord-2', created_at: '2026-10-01T12:00:00.300Z' })],
        tareasCerradas: [tarea({ ...base, assigned_to: 'coord-1', status: 'completed', created_at: '2026-10-01T12:00:00.100Z' })],
      }),
    )
    expect(f.proximo).toBeNull()
  })
  it('si una copia se descartó, ninguna cuenta', () => {
    const f = una(
      armar({
        procesos: [d()],
        tareas: [tarea({ ...base, assigned_to: 'coord-2', created_at: '2026-10-01T12:00:00Z' })],
        tareasCerradas: [tarea({ ...base, assigned_to: 'coord-1', status: 'dismissed', created_at: '2026-10-01T12:00:01Z' })],
      }),
    )
    expect(f.proximo).toBeNull()
  })
  it('12:00:59,9 y 12:01:00,1 son copias (no se trunca al minuto)', () => {
    const l = colapsarCopiasDeCoordinacion(
      [tarea({ ...base, id: 'a', assigned_to: 'coord-1', created_at: '2026-10-01T12:00:59.900Z' })],
      [tarea({ ...base, id: 'b', assigned_to: 'coord-2', status: 'completed', created_at: '2026-10-01T12:01:00.100Z' })],
      (id) => PERFILES.get(id ?? '')?.role === 'coordinador',
    )
    expect(l).toEqual([])
  })
  it('a 61 segundos ya no son copias', () => {
    const l = colapsarCopiasDeCoordinacion(
      [tarea({ ...base, id: 'a', assigned_to: 'coord-1', created_at: '2026-10-01T12:00:00Z' })],
      [tarea({ ...base, id: 'b', assigned_to: 'coord-2', status: 'completed', created_at: '2026-10-01T12:01:01Z' })],
      (id) => PERFILES.get(id ?? '')?.role === 'coordinador',
    )
    expect(l.map((x) => x.tarea.id)).toEqual(['a'])
  })
  it('una "Enviar WhatsApp" de la cadencia completada la semana pasada no esconde la pendiente de hoy', () => {
    const wa = { deal_id: 'd-x', type: 'follow_up', title: 'Enviar WhatsApp a Sofía Lanús', channel: 'message' }
    const f = una(
      armar({
        procesos: [d()],
        tareas: [tarea({ ...wa, assigned_to: 'coord-1', source_activity_id: 'act-2', created_at: '2026-12-02T12:00:00Z', due_date: '2026-12-02', due_time: '12:00' })],
        tareasCerradas: [tarea({ ...wa, assigned_to: 'coord-1', source_activity_id: 'act-1', status: 'completed', created_at: '2026-11-25T12:00:00Z' })],
      }),
    )
    expect(paso(f).titulo).toBe('Enviar WhatsApp')
  })
  it('dos tareas de la cadencia (con source_activity_id) nunca son copias, aunque nazcan juntas', () => {
    const wa = { ...base, type: 'follow_up', title: 'Enviar WhatsApp a Sofía Lanús', channel: 'message' }
    const l = colapsarCopiasDeCoordinacion(
      [tarea({ ...wa, id: 'a', assigned_to: 'coord-1', source_activity_id: 'act-2', created_at: '2026-10-01T12:00:00.500Z' })],
      [tarea({ ...wa, id: 'b', assigned_to: 'coord-2', source_activity_id: 'act-1', status: 'completed', created_at: '2026-10-01T12:00:00Z' })],
      (id) => PERFILES.get(id ?? '')?.role === 'coordinador',
    )
    expect(l.map((x) => x.tarea.id)).toEqual(['a'])
  })
  it('lo mismo sin source_activity_id: una semana de diferencia no es una copia', () => {
    const f = una(
      armar({
        procesos: [d()],
        tareas: [tarea({ ...base, assigned_to: 'coord-1', created_at: '2026-12-02T12:00:00Z' })],
        tareasCerradas: [tarea({ ...base, assigned_to: 'coord-1', status: 'completed', created_at: '2026-11-25T12:00:00Z' })],
      }),
    )
    expect(f.proximo).not.toBeNull()
  })
  it('una copia pendiente de hace 120 días cuya hermana se completó sigue anulada', () => {
    const f = una(
      armar({
        procesos: [d()],
        tareas: [tarea({ ...base, assigned_to: 'coord-2', created_at: '2026-08-04T12:00:00.200Z' })],
        tareasCerradas: [tarea({ ...base, assigned_to: 'coord-1', status: 'completed', created_at: '2026-08-04T12:00:00.100Z' })],
      }),
    )
    expect(f.proximo).toBeNull()
  })
  it('una tarea del asesor con el mismo título no es copia de la coordinación', () => {
    const l = colapsarCopiasDeCoordinacion(
      [tarea({ ...base, id: 'a', assigned_to: 'asesor-1', created_at: '2026-10-01T12:00:00Z' })],
      [tarea({ ...base, id: 'b', assigned_to: 'coord-2', status: 'completed', created_at: '2026-10-01T12:00:00Z' })],
      (id) => PERFILES.get(id ?? '')?.role === 'coordinador',
    )
    expect(l.map((x) => x.tarea.id)).toEqual(['a'])
  })
  it('una sola copia pendiente (una coordinadora) lleva su nombre', () => {
    const f = una(armar({ procesos: [d()], tareas: [tarea({ ...base, assigned_to: 'coord-1' })] }))
    expect(paso(f).quien).toEqual({ id: 'coord-1', nombre: 'Paula Pandolfo' })
  })
  it('en la vista de una coordinadora cuenta su copia aunque la hermana se haya completado', () => {
    const f = una(
      armar({
        vista: COORD,
        procesos: [d()],
        tareas: [tarea({ ...base, assigned_to: 'coord-1', created_at: '2026-10-01T12:00:00.300Z' })],
        tareasCerradas: [tarea({ ...base, assigned_to: 'coord-2', status: 'completed', created_at: '2026-10-01T12:00:00.100Z' })],
      }),
    )
    expect(f.proximo).not.toBeNull()
  })
})

describe('proximoPaso — vencimientos y orden', () => {
  const base = { tasacion: null, quienTasacion: null, etapa: 'seguimiento' as const, hayContactos: true, registradoEn: ar('2026-11-01', '10:00'), nombrePersona: 'Sofía Lanús', ahora: AHORA }
  const t = (p: Partial<TareaLeida>) => ({ ...tarea({ deal_id: 'd', ...p }), quien: null })
  it('la que vence primero gana', () => {
    const r = proximoPaso({ ...base, tareas: [t({ id: 'tarde', due_date: '2026-12-04' }), t({ id: 'antes', title: 'Antes', due_date: '2026-12-03' })] })
    expect(r?.titulo).toBe('Antes')
  })
  it('una tarea sin fecha va después de las que tienen', () => {
    const r = proximoPaso({ ...base, tareas: [t({ title: 'Sin fecha', due_date: null, due_time: null }), t({ title: 'Con fecha', due_date: '2026-12-20' })] })
    expect(r?.titulo).toBe('Con fecha')
  })
  it('una tarea sin fecha sola → instante null', () => {
    const r = proximoPaso({ ...base, tareas: [t({ title: 'Sin fecha', due_date: null, due_time: null })] })
    expect(r).toMatchObject({ titulo: 'Sin fecha', instante: null, vence: { due_date: null, due_time: null, all_day: false } })
  })
  it('sin tareas ni tasación → null ("Nada agendado")', () => {
    expect(proximoPaso({ ...base, tareas: [] })).toBeNull()
  })
  it('una tarea de hoy sin hora vence al final del día: después de una de hoy a las 17:00', () => {
    const r = proximoPaso({ ...base, tareas: [t({ title: 'Todo el día', due_date: '2026-12-02', due_time: null }), t({ title: 'A las 17', due_date: '2026-12-02', due_time: '17:00' })] })
    expect(r?.titulo).toBe('A las 17')
  })
  it('la hora "09:00:00" de la columna time se recorta a HH:MM', () => {
    const r = proximoPaso({ ...base, tareas: [t({ due_date: '2026-12-03', due_time: '09:00:00' })] })
    expect(r?.instante).toBe(new Date('2026-12-03T12:00:00Z').toISOString())
  })
  it('una fecha que no se entiende queda como sin fecha y no rompe', () => {
    const r = proximoPaso({ ...base, tareas: [t({ title: 'Rara', due_date: '2026-13-45' })] })
    expect(r?.instante).toBeNull()
  })
})

describe('proximoPaso — título', () => {
  const base = { tasacion: null, quienTasacion: null, etapa: 'seguimiento' as const, hayContactos: true, registradoEn: ar('2026-11-01', '10:00'), ahora: AHORA }
  const t = (title: string) => ({ ...tarea({ deal_id: 'd', title }), quien: null })
  it('"Llamada 2 a Sofía Lanús" → "Llamada 2"', () => {
    expect(proximoPaso({ ...base, nombrePersona: 'Sofía Lanús', tareas: [t('Llamada 2 a Sofía Lanús')] })?.titulo).toBe('Llamada 2')
  })
  it('con el nombre escrito en NFD (macOS) también lo saca', () => {
    expect(quitarNombreDelTitulo('Llamada 2 a Sofía Lanús', 'Sofía Lanús')).toBe('Llamada 2')
    expect(quitarNombreDelTitulo('Llamada 2 a Sofía Lanús', 'Sofía Lanús')).toBe('Llamada 2')
  })
  it('sin tildes en el título y con tildes en el nombre', () => {
    expect(quitarNombreDelTitulo('Entregar la tasacion a Mirta Sosa', 'Mírta Sosa')).toBe('Entregar la tasacion')
  })
  it('" con {nombre}" y " de {nombre}" también', () => {
    expect(quitarNombreDelTitulo('Reunión con Ana Pérez', 'Ana Pérez')).toBe('Reunión')
    expect(quitarNombreDelTitulo('Tasación de Ana Pérez', 'ana pérez')).toBe('Tasación')
  })
  it('caracteres de regex en el nombre no rompen', () => {
    expect(quitarNombreDelTitulo('Llamar a Juan (2*D)', 'Juan (2*D)')).toBe('Llamar')
    expect(quitarNombreDelTitulo('Llamar a Juan', '.*')).toBe('Llamar a Juan')
  })
  it('si el nombre no está al final, el título queda como está', () => {
    expect(quitarNombreDelTitulo('Llamar a Sofía Lanús mañana', 'Sofía Lanús')).toBe('Llamar a Sofía Lanús mañana')
  })
  it('un nombre vacío no recorta nada', () => {
    expect(quitarNombreDelTitulo('Llamar a ', '')).toBe('Llamar a ')
  })
  it('"Primera llamada" para una llamada de una solicitud sin contactos', () => {
    const r = proximoPaso({ ...base, etapa: 'solicitud', hayContactos: false, nombrePersona: 'Sofía Lanús', tareas: [t('Llamar a Sofía Lanús')] })
    expect(r?.titulo).toBe('Primera llamada')
  })
  it('una update_contact sin canal también es llamada', () => {
    const r = proximoPaso({
      ...base, etapa: 'solicitud', hayContactos: false, nombrePersona: 'X',
      tareas: [{ ...tarea({ deal_id: 'd', type: 'update_contact', channel: null, title: 'Contactar a X' }), quien: null }],
    })
    expect(r?.titulo).toBe('Primera llamada')
  })
  it('un WhatsApp (follow_up con canal message) no es "Primera llamada"', () => {
    const r = proximoPaso({
      ...base, etapa: 'solicitud', hayContactos: false, nombrePersona: 'X',
      tareas: [{ ...tarea({ deal_id: 'd', channel: 'message', title: 'Enviar WhatsApp a X' }), quien: null }],
    })
    expect(r?.titulo).toBe('Enviar WhatsApp')
  })
  it('con algún contacto registrado no es "Primera llamada"', () => {
    const r = proximoPaso({ ...base, etapa: 'solicitud', hayContactos: true, nombrePersona: 'Sofía Lanús', tareas: [t('Llamada 2 a Sofía Lanús')] })
    expect(r?.titulo).toBe('Llamada 2')
  })
})

describe('proximoPaso — la primera llamada sin fecha (D3)', () => {
  const entrada = (registradoEn: string, ahora: Date) =>
    proximoPaso({
      tareas: [{ ...tarea({ deal_id: 'd', type: 'update_contact', channel: null, title: 'Contactar a X', due_date: null, due_time: null }), quien: null }],
      tasacion: null,
      quienTasacion: null,
      etapa: 'solicitud',
      hayContactos: false,
      registradoEn,
      nombrePersona: 'X',
      ahora,
    })
  it('entró en horario (10:12) → vence en el registro, con espera', () => {
    const r = entrada(ar('2026-12-02', '10:12'), new Date('2026-12-02T13:40:00Z'))
    expect(r).toMatchObject({
      titulo: 'Primera llamada',
      vence: { due_date: '2026-12-02', due_time: '10:12', all_day: false },
      espera: { registradoEn: ar('2026-12-02', '10:12') },
      instante: ar('2026-12-02', '10:12'),
    })
  })
  it('entró a las 22:00 del martes → vence el miércoles 10:00, sin espera', () => {
    const r = entrada(ar('2026-12-01', '22:00'), AHORA)
    expect(r).toMatchObject({ vence: { due_date: '2026-12-02', due_time: '10:00' }, espera: null })
  })
  it('entró un viernes a las 19:00 → vence el lunes 10:00', () => {
    const r = entrada(ar('2026-12-04', '19:00'), new Date('2026-12-05T13:00:00Z'))
    expect(r?.vence).toMatchObject({ due_date: '2026-12-07', due_time: '10:00' })
  })
  it('entró un día hábil a las 7:30 → vence ese mismo día a las 10:00', () => {
    const r = entrada(ar('2026-12-02', '07:30'), AHORA)
    expect(r).toMatchObject({ vence: { due_date: '2026-12-02', due_time: '10:00' }, espera: null })
  })
  it('la tarea de entrada que ya nace con fecha (crm-tareas-y-campanita) sigue esperando', () => {
    const r = proximoPaso({
      tareas: [{ ...tarea({ deal_id: 'd', type: 'update_contact', channel: 'call', title: 'Solicitud de tasación: X', due_date: '2026-12-02', due_time: '10:12:00' }), quien: null }],
      tasacion: null, quienTasacion: null, etapa: 'solicitud', hayContactos: false,
      registradoEn: ar('2026-12-02', '10:12'), nombrePersona: 'X', ahora: new Date('2026-12-02T13:40:00Z'),
    })
    expect(r).toMatchObject({ titulo: 'Primera llamada', espera: { registradoEn: ar('2026-12-02', '10:12') } })
  })
  it('la entrada con fecha un minuto después del alta (el envío se toma instantes después) también espera', () => {
    const r = proximoPaso({
      tareas: [{ ...tarea({ deal_id: 'd', type: 'update_contact', channel: 'call', title: 'Solicitud de tasación: X', due_date: '2026-12-02', due_time: '10:13:00' }), quien: null }],
      tasacion: null, quienTasacion: null, etapa: 'solicitud', hayContactos: false,
      registradoEn: ar('2026-12-02', '10:12'), nombrePersona: 'X', ahora: new Date('2026-12-02T13:40:00Z'),
    })
    expect(r?.espera).toEqual({ registradoEn: ar('2026-12-02', '10:12') })
  })
  it('entró a las 18:00 en punto → ya es fuera de horario', () => {
    const r = entrada(ar('2026-12-01', '18:00'), AHORA)
    expect(r?.espera).toBeNull()
  })
  it('una solicitud anterior al registro sigue "Sin fecha"', () => {
    const r = entrada('2025-09-12T13:00:00Z', AHORA)
    expect(r).toMatchObject({ titulo: 'Primera llamada', vence: { due_date: null, due_time: null }, instante: null, espera: null })
  })
  it('con un contacto registrado, la tarea sin fecha queda sin fecha', () => {
    const r = proximoPaso({
      tareas: [{ ...tarea({ deal_id: 'd', type: 'update_contact', channel: null, title: 'Contactar a X', due_date: null, due_time: null }), quien: null }],
      tasacion: null, quienTasacion: null, etapa: 'solicitud', hayContactos: true, registradoEn: ar('2026-12-02', '10:12'), nombrePersona: 'X', ahora: AHORA,
    })
    expect(r?.instante).toBeNull()
  })
  it('en otra etapa (seguimiento), la tarea sin fecha queda sin fecha', () => {
    const r = proximoPaso({
      tareas: [{ ...tarea({ deal_id: 'd', type: 'update_contact', channel: null, title: 'Contactar a X', due_date: null, due_time: null }), quien: null }],
      tasacion: null, quienTasacion: null, etapa: 'seguimiento', hayContactos: false, registradoEn: ar('2026-12-02', '10:12'), nombrePersona: 'X', ahora: AHORA,
    })
    expect(r?.instante).toBeNull()
  })
})

describe('proximoPaso y la fila — tasación', () => {
  const coordinada = (fecha: string, hora: string | null, assigned_to: string | null = 'asesor-1') =>
    proceso({ id: 'd-t', stage: 'scheduled', scheduled_date: fecha, scheduled_time: hora, assigned_to, property_address: 'Bacacay 2450' })
  it('una tasación futura es el próximo paso: "Tasación"', () => {
    const f = una(armar({ vista: ASESOR, procesos: [coordinada('2026-12-02', '12:30:00')] }))
    expect(paso(f)).toMatchObject({ clase: 'tasacion', titulo: 'Tasación', vence: { due_date: '2026-12-02', due_time: '12:30', all_day: false } })
    expect(f.tasacion).toMatchObject({ fecha: '2026-12-02', hora: '12:30', asesor: 'Tomás Agüero', direccion: 'Bacacay 2450' })
  })
  it('una tasación que ya pasó → "Cargar el resultado de la tasación"', () => {
    const f = una(armar({ vista: ASESOR, procesos: [coordinada('2026-11-29', '11:00')] }))
    expect(paso(f)).toMatchObject({ clase: 'tasacion', titulo: 'Cargar el resultado de la tasación' })
  })
  it('para la coordinación la tasación pasada dice de quién es (· asesor)', () => {
    const f = una(armar({ vista: COORD, procesos: [coordinada('2026-11-29', '11:00')] }))
    expect(paso(f)).toMatchObject({ titulo: 'Cargar el resultado de la tasación', quien: { id: 'asesor-1', nombre: 'Tomás Agüero' } })
  })
  it('para la coordinación, su tarea vencida gana a la tasación vencida del asesor (auditoría M1)', () => {
    const f = una(
      armar({
        vista: COORD,
        procesos: [coordinada('2026-11-24', '11:00')],
        tareas: [tarea({ deal_id: 'd-t', title: 'Volver a llamar a Sofía Lanús', due_date: '2026-11-26', due_time: '10:00' })],
      }),
    )
    expect(paso(f)).toMatchObject({ clase: 'tarea', titulo: 'Volver a llamar' })
    expect(agrupar([f], COORD, AHORA).map((g) => g.clave)).toEqual(['vencidas'])
  })
  it('para el asesor, la tasación vencida sigue compitiendo con sus tareas por fecha', () => {
    const f = una(
      armar({
        vista: ASESOR,
        procesos: [coordinada('2026-11-24', '11:00')],
        tareas: [tarea({ deal_id: 'd-t', assigned_to: 'asesor-1', title: 'Mandar fotos', due_date: '2026-11-26', due_time: '10:00' })],
      }),
    )
    expect(paso(f)).toMatchObject({ clase: 'tasacion', titulo: 'Cargar el resultado de la tasación' })
  })
  it('para el dueño la tasación no repite el asesor de la columna', () => {
    const f = una(armar({ vista: DUENO, procesos: [coordinada('2026-11-29', '11:00')] }))
    expect(paso(f).quien).toBeNull()
  })
  it('una tarea que vence antes que la tasación gana', () => {
    const f = una(
      armar({
        vista: COORD,
        procesos: [coordinada('2026-12-03', '11:00')],
        tareas: [tarea({ deal_id: 'd-t', title: 'Confirmar el horario con Sofía Lanús', due_date: '2026-12-02', due_time: '16:00' })],
      }),
    )
    expect(paso(f).titulo).toBe('Confirmar el horario')
    expect(f.tasacion).not.toBeNull()
  })
  it('sin hora: todo el día, vence recién al día siguiente', () => {
    const hoy = una(armar({ vista: ASESOR, procesos: [coordinada('2026-12-02', null)] }))
    expect(paso(hoy)).toMatchObject({ titulo: 'Tasación', vence: { due_date: '2026-12-02', due_time: null, all_day: true } })
    const ayer = una(armar({ vista: ASESOR, procesos: [coordinada('2026-12-01', null)] }))
    expect(paso(ayer).titulo).toBe('Cargar el resultado de la tasación')
  })
  it('la tasación sin hora ordena después de la de la misma fecha con hora', () => {
    const [conHora, sinHora] = armar({ vista: ASESOR, procesos: [coordinada('2026-12-02', '15:30'), { ...coordinada('2026-12-02', null), id: 'd-t2' }] })
    expect(new Date(paso(conHora).instante ?? '').getTime()).toBeLessThan(new Date(paso(sinHora).instante ?? '').getTime())
    expect(new Date(conHora.tasacion?.instante ?? '').getTime()).toBeLessThan(new Date(sinHora.tasacion?.instante ?? '').getTime())
  })
  it('una coordinada sin día es Solicitud y no tiene tasación', () => {
    const f = una(armar({ vista: DUENO, procesos: [proceso({ stage: 'scheduled', scheduled_date: null })] }))
    expect(f.etapa).toBe('solicitud')
    expect(f.tasacion).toBeNull()
  })
  it('un proceso Realizado con fecha de tasación ya no tiene tasación en la fila', () => {
    const f = una(armar({ vista: DUENO, procesos: [proceso({ stage: 'visited', scheduled_date: '2026-11-20', assigned_to: 'asesor-1' })] }))
    expect(f.tasacion).toBeNull()
  })
})

describe('sinPrimerContacto', () => {
  it('una solicitud nueva sin ningún contacto → sí', () => {
    expect(sinPrimerContacto(una(armar({ procesos: [proceso()] })))).toBe(true)
  })
  it('con un contacto registrado → no', () => {
    const f = una(armar({ procesos: [proceso({ id: 'd-c' })], ultimos: new Map([['c-d-c', llamada('2026-12-02T12:00:00Z')]]) }))
    expect(sinPrimerContacto(f)).toBe(false)
  })
  it('anterior al registro de llamadas → no', () => {
    expect(sinPrimerContacto(una(armar({ procesos: [proceso({ created_at: '2025-09-12T13:00:00Z' })] })))).toBe(false)
  })
  it('si no se pudo leer el último contacto → no (no se afirma lo que no se sabe)', () => {
    expect(sinPrimerContacto(una(armar({ procesos: [proceso()], ultimos: 'error' })))).toBe(false)
  })
  it('una coordinada sin contactos → no (solo solicitudes)', () => {
    expect(sinPrimerContacto(una(armar({ procesos: [proceso({ stage: 'scheduled', scheduled_date: '2026-12-05' })] })))).toBe(false)
  })
})

describe('sinAsesor', () => {
  it.each(['scheduled', 'not_visited', 'visited', 'appraisal_sent', 'followup'])('%s sin asesor → sí', (stage) => {
    const f = una(armar({ procesos: [proceso({ stage, scheduled_date: stage === 'scheduled' ? '2026-12-05' : null })] }))
    expect(sinAsesor(f)).toBe(true)
  })
  it('una solicitud sin asesor no está trabada por eso', () => {
    expect(sinAsesor(una(armar({ procesos: [proceso()] })))).toBe(false)
  })
  it('un seguimiento con asesor activo → no', () => {
    expect(sinAsesor(una(armar({ procesos: [proceso({ stage: 'followup', assigned_to: 'asesor-1' })] })))).toBe(false)
  })
  it('un seguimiento a nombre del dueño → no (es un asesor activo más)', () => {
    expect(sinAsesor(una(armar({ procesos: [proceso({ stage: 'followup', assigned_to: 'dueno-1' })] })))).toBe(false)
  })
  it('a nombre de un perfil que ya no existe → cuenta como sin asesor', () => {
    expect(sinAsesor(una(armar({ procesos: [proceso({ stage: 'followup', assigned_to: 'borrado' })] })))).toBe(true)
  })
  it('un histórico sin asesor del sistema anterior cuenta (respuesta 4 del dueño)', () => {
    expect(sinAsesor(una(armar({ procesos: [proceso({ stage: 'visited', origin: 'historico' })] })))).toBe(true)
  })
  it('un cerrado o una clase gratuita sin asesor → no', () => {
    const [a, b, c] = armar({ procesos: [proceso({ stage: 'lost' }), proceso({ stage: 'clase_gratuita' }), proceso({ stage: 'comprador' })] })
    expect([sinAsesor(a), sinAsesor(b), sinAsesor(c)]).toEqual([false, false, false])
  })
})

describe('sinMovimiento (14 días)', () => {
  const seguimiento = (ultimo: ContactoRegistrado | null, ahora: Date) =>
    una(armar({ procesos: [proceso({ id: 'd-s', stage: 'followup', assigned_to: 'asesor-1' })], ultimos: new Map(ultimo ? [['c-d-s', ultimo]] : []), ahora }))
  const AHORA_LEJOS = new Date('2027-01-20T15:00:00Z')
  it('la constante es 14 (respuesta 2 del dueño)', () => {
    expect(SIN_MOVIMIENTO_DIAS).toBe(14)
  })
  it('última llamada hace 14 días → sí', () => {
    const f = seguimiento(llamada('2027-01-06T15:00:00Z'), AHORA_LEJOS)
    expect(sinMovimiento(f, AHORA_LEJOS)).toBe(true)
  })
  it('última llamada hace 13 días → no', () => {
    const f = seguimiento(llamada('2027-01-07T15:00:00Z'), AHORA_LEJOS)
    expect(sinMovimiento(f, AHORA_LEJOS)).toBe(false)
  })
  it('sin ningún contacto, contado desde el inicio del registro: a los 13 días no, a los 14 sí', () => {
    const d13 = new Date('2026-12-09T15:00:00Z')
    const d14 = new Date('2026-12-10T15:00:00Z')
    expect(sinMovimiento(seguimiento(null, d13), d13)).toBe(false)
    expect(sinMovimiento(seguimiento(null, d14), d14)).toBe(true)
  })
  it('una visita de hace 5 meses, 10 días después del inicio del registro → todavía no', () => {
    const ahora = new Date('2026-12-06T15:00:00Z')
    const f = seguimiento({ at: '2026-07-06T15:00:00Z', que: 'visita', resultado: null }, ahora)
    expect(sinMovimiento(f, ahora)).toBe(false)
  })
  it('la misma visita a los 14 días del inicio del registro → sí', () => {
    const ahora = new Date('2026-12-10T15:00:00Z')
    const f = seguimiento({ at: '2026-07-06T15:00:00Z', que: 'visita', resultado: null }, ahora)
    expect(sinMovimiento(f, ahora)).toBe(true)
  })
  it('cuenta días de Argentina: 14 días al cruzar la medianoche de Argentina, no antes', () => {
    // Última llamada el 6/1 a las 23:30 AR (7/1 02:30 UTC). El 20/1 a las 22:00 AR (21/1 01:00 UTC) son 14.
    const f = seguimiento(llamada('2027-01-07T02:30:00Z'), new Date('2027-01-21T01:00:00Z'))
    expect(sinMovimiento(f, new Date('2027-01-21T01:00:00Z'))).toBe(true)
    expect(sinMovimiento(f, new Date('2027-01-20T02:00:00Z'))).toBe(false)
  })
  it('con el último contacto en error → no', () => {
    const f = una(armar({ procesos: [proceso({ stage: 'followup' })], ultimos: 'error', ahora: AHORA_LEJOS }))
    expect(sinMovimiento(f, AHORA_LEJOS)).toBe(false)
  })
  it('solo seguimientos: una entregada sin contacto hace 30 días → no', () => {
    const f = una(armar({ procesos: [proceso({ stage: 'appraisal_sent', assigned_to: 'asesor-1' })], ahora: AHORA_LEJOS }))
    expect(sinMovimiento(f, AHORA_LEJOS)).toBe(false)
  })
})
