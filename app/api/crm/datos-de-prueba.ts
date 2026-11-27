// Datos fijos para las pruebas de las rutas del CRM (app/api/crm/**). NO es una ruta ni se
// usa en la app: las pruebas arman con esto una base simulada (lib/supabase/cartera.simulada)
// y llaman a la ruta con el servicio REAL, así lo que se verifica es lo que viaja por la red.
//
// El escenario tiene dos asesores, procesos sin asesor de la coordinación y una persona
// compartida (un proceso de cada asesor, el más nuevo de B): lo necesario para buscar en la
// respuesta serializada del asesor A cualquier rastro de B (tarea 5.3).

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const DUENO = uuid(1)
export const ADMIN = uuid(8)
export const COORD_1 = uuid(2)
export const COORD_2 = uuid(3)
export const ASESOR_A = uuid(4)
export const ASESOR_B = uuid(5)
export const ABOGADO = uuid(6)
export const INACTIVO = uuid(7)

export const PERFILES = [
  { id: DUENO, full_name: 'Diego Dueño', role: 'dueno', is_active: true },
  { id: ADMIN, full_name: 'Ada Admin', role: 'admin', is_active: true },
  { id: COORD_1, full_name: 'Paula Coord', role: 'coordinador', is_active: true },
  { id: COORD_2, full_name: 'Julian Coord', role: 'coordinador', is_active: true },
  { id: ASESOR_A, full_name: 'Ana Asesora', role: 'asesor', is_active: true },
  { id: ASESOR_B, full_name: 'Bruno Asesor', role: 'asesor', is_active: true },
  { id: ABOGADO, full_name: 'Luis Abogado', role: 'abogado', is_active: true },
  { id: INACTIVO, full_name: 'Ido Baja', role: 'asesor', is_active: false },
]

type Fila = Record<string, unknown>

function contacto(id: string, nombre: string, c: Fila = {}): Fila {
  return {
    id, full_name: nombre, phone: '1150000000', email: null, origin: 'embudo', assigned_to: null, created_by: null,
    created_at: '2026-11-20T10:00:00.000Z', ...c,
  }
}
function proceso(id: string, contactId: string | null, p: Fila = {}): Fila {
  return {
    id, contact_id: contactId, stage: 'followup', scheduled_date: null, scheduled_time: null, origin: 'embudo', assigned_to: null,
    created_at: '2026-11-26T14:00:00.000Z', property_type: null, property_type_other: null, rooms: null,
    neighborhood: 'Palermo', property_address: 'Calle 1', tags: null, captured_at: null, lost_at: null,
    stage_changed_at: '2026-11-26T14:00:00.000Z', ...p,
  }
}
function tarea(id: string, t: Fila & { assigned_to: string }): Fila {
  return {
    id, type: 'follow_up', title: 'Llamar', deal_id: null, contact_id: null, due_date: '2026-11-28', due_time: null,
    all_day: true, channel: 'call', created_at: '2026-11-26T15:00:00.000Z', source_activity_id: null, status: 'pending', ...t,
  }
}

// Ids del escenario.
export const C_A = uuid(101)
export const C_B = uuid(102)
export const C_SIN = uuid(103)
export const C_COMP = uuid(104)
export const P_A = uuid(201)
export const P_B = uuid(202)
export const P_SIN = uuid(203)
export const P_COMP_A = uuid(204)
export const P_COMP_B = uuid(205)
export const T_A = uuid(301)
export const T_B = uuid(302)
export const T_SIN = uuid(303)
export const T_COMP_B = uuid(304)

/** Lo que NUNCA puede aparecer en una respuesta del asesor A. */
export const AJENO_A_A = [
  ASESOR_B, 'Bruno Asesor',
  C_B, 'Beto Ajeno', P_B, T_B, 'Secreto de Beto',
  C_SIN, 'Sonia Sin Asesor', P_SIN, T_SIN, 'Coordinar a Sonia',
  P_COMP_B, T_COMP_B, 'Tarea compartida de Bruno', 'Ajena 999', 'Belgrano', '2026-12-03', '17:45',
]

export function escenario(): Record<string, Fila[]> {
  return {
    profiles: PERFILES,
    contacts: [
      contacto(C_A, 'Ana Cliente', { assigned_to: ASESOR_A }),
      contacto(C_B, 'Beto Ajeno', { assigned_to: ASESOR_B }),
      contacto(C_SIN, 'Sonia Sin Asesor'),
      contacto(C_COMP, 'Compartida Persona'),
    ],
    deals: [
      proceso(P_A, C_A, { assigned_to: ASESOR_A, property_address: 'Propia 100' }),
      proceso(P_B, C_B, { assigned_to: ASESOR_B, property_address: 'Ajena 1' }),
      proceso(P_SIN, C_SIN, { stage: 'request', property_address: 'Sin 5' }),
      proceso(P_COMP_A, C_COMP, { assigned_to: ASESOR_A, created_at: '2026-10-01T10:00:00.000Z', property_address: 'Suya 100' }),
      proceso(P_COMP_B, C_COMP, {
        assigned_to: ASESOR_B, stage: 'scheduled', scheduled_date: '2026-12-03', scheduled_time: '17:45:00',
        created_at: '2026-11-25T10:00:00.000Z', property_address: 'Ajena 999', neighborhood: 'Belgrano',
      }),
    ],
    tasks: [
      tarea(T_A, { deal_id: P_A, assigned_to: ASESOR_A, title: 'Llamar a Ana Cliente' }),
      tarea(T_B, { deal_id: P_B, assigned_to: ASESOR_B, title: 'Secreto de Beto' }),
      tarea(T_SIN, { deal_id: P_SIN, assigned_to: COORD_1, title: 'Coordinar a Sonia', type: 'update_contact' }),
      tarea(T_COMP_B, { deal_id: P_COMP_B, assigned_to: ASESOR_B, title: 'Tarea compartida de Bruno' }),
    ],
    appraisals: [],
  }
}

/** Último contacto de cada persona del escenario (la RPC simulada filtra por lo pedido). */
export function ultimosDelEscenario(args: Record<string, unknown>): Fila[] {
  const pedidos = Array.isArray(args.p_contactos) ? args.p_contactos : []
  return [C_A, C_B, C_SIN, C_COMP]
    .filter((id) => pedidos.includes(id))
    .map((id) => ({ contacto_id: id, actividad_at: '2026-11-26T18:00:00.000Z', actividad_tipo: 'call', actividad_resultado: 'no_atendio', visita_at: null }))
}
