/**
 * Base simulada en memoria para los tests de las rutas de actividad con cadencia (tareas
 * 6.2 a 6.4). Reemplaza las funciones de `lib/supabase/actividades.ts` y `tasks.ts` con
 * las MISMAS reglas que la base real: `client_token` único, una tarea por actividad
 * (`uq_tasks_source_activity`), cerrar solo pendientes y anotar quién las cerró. Así
 * `aplicarCadencia` corre de verdad y los tests miran lo que queda "en la base".
 * No es un test: lo importan los `.test.ts` de esta carpeta.
 */
import type { FilaActividad, NuevaFilaActividad, ProcesoParaCadencia } from '@/lib/supabase/actividades'
import type { TareaDeFicha, CreateTaskInput } from '@/lib/supabase/tasks'
import type { Intento } from '@/lib/crm/tipos'

export interface ProcesoSimulado extends ProcesoParaCadencia {
  created_at: string
  contact_id: string
}

export interface TareaSimulada {
  id: string
  title: string
  type: string
  channel: string | null
  assigned_to: string | null
  created_at: string
  deal_id: string | null
  contact_id: string | null
  appraisal_id: string | null
  source_activity_id: string | null
  closed_by_activity_id: string | null
  status: 'pending' | 'completed' | 'dismissed'
  due_date: string | null
  due_time: string | null
}

export function crearBaseSimulada() {
  // Arranca en la hora "del sistema" (los tests la fijan con `vi.setSystemTime`) y avanza
  // un segundo por escritura: así `created_at` ordena como en la base real.
  let reloj = Date.now()
  let secuencia = 0
  const ahora = () => new Date((reloj += 1000)).toISOString()

  const base = {
    contactos: new Map<string, string>(), // id → nombre
    perfiles: new Map<string, { role: string; nombre: string }>(),
    procesos: [] as ProcesoSimulado[],
    actividades: [] as FilaActividad[],
    tareas: [] as TareaSimulada[],
    fallarCrear: 0, // cuántas veces seguidas falla createCadenceTask
    fallarCerrar: 0,
    ahora,
    avanzarReloj(ms: number) {
      reloj += ms
    },

    tarea(t: Partial<TareaSimulada> & { id: string }): TareaSimulada {
      const fila: TareaSimulada = {
        title: t.id,
        type: 'follow_up',
        channel: 'call',
        assigned_to: null,
        created_at: ahora(),
        deal_id: null,
        contact_id: null,
        appraisal_id: null,
        source_activity_id: null,
        closed_by_activity_id: null,
        status: 'pending',
        due_date: null,
        due_time: null,
        ...t,
      }
      base.tareas.push(fila)
      return fila
    },

    // --- lib/supabase/actividades.ts ---
    async leerProcesosDelContacto(contactId: string) {
      if (!base.contactos.has(contactId)) return { existe: false, procesos: [] }
      return { existe: true, procesos: base.procesos.filter((p) => p.contact_id === contactId) }
    },
    async insertarActividad(fila: NuevaFilaActividad) {
      if (base.actividades.some((a) => a.client_token === fila.client_token)) {
        return { ok: false as const, motivo: 'token_repetido' as const }
      }
      const creada = ahora()
      const nueva: FilaActividad = {
        id: `act-${++secuencia}`,
        contact_id: fila.contact_id,
        deal_id: fila.deal_id,
        kind: fila.kind,
        call_outcome: fila.call_outcome ?? null,
        body: fila.body,
        occurred_at: fila.occurred_at ?? creada,
        callback_at: fila.callback_at ?? null,
        created_at: creada,
        updated_at: null,
        created_by: fila.created_by,
        voided_at: null,
        voided_by: null,
        automatic: false,
        client_token: fila.client_token,
      }
      base.actividades.push(nueva)
      return { ok: true as const, fila: { ...nueva } }
    },
    async leerActividadPorToken(token: string) {
      const a = base.actividades.find((x) => x.client_token === token)
      return a ? { ...a } : null
    },
    async leerActividadDelContacto(contactId: string, activityId: string) {
      const a = base.actividades.find((x) => x.id === activityId && x.contact_id === contactId)
      return a ? { ...a } : null
    },
    async intentosNoAnulados(contactId: string, dealId: string | null): Promise<Intento[]> {
      return base.actividades
        .filter((a) => a.contact_id === contactId && a.kind !== 'note' && !a.voided_at && a.deal_id === dealId)
        .map(({ id, deal_id, kind, call_outcome, occurred_at, created_at }) => ({ id, deal_id, kind, call_outcome, occurred_at, created_at }))
    },
    async leerProcesoParaCadencia(dealId: string): Promise<ProcesoParaCadencia | null> {
      const p = base.procesos.find((x) => x.id === dealId)
      return p ? { id: p.id, stage: p.stage, assigned_to: p.assigned_to, scheduled_date: p.scheduled_date, origin: p.origin } : null
    },
    async nombreDelContacto(contactId: string) {
      const n = base.contactos.get(contactId)
      if (n === undefined) throw new Error('no existe')
      return n
    },
    async rolDePerfil(userId: string) {
      return base.perfiles.get(userId)?.role ?? null
    },
    async nombresDePerfiles(ids: string[]) {
      const m = new Map<string, string>()
      for (const id of ids) {
        const p = base.perfiles.get(id)
        if (p) m.set(id, p.nombre)
      }
      return m
    },

    // --- lib/supabase/tasks.ts ---
    async getPendingTasksForContact(contactId: string, dealIds: string[]): Promise<TareaDeFicha[]> {
      return base.tareas
        .filter((t) => t.status === 'pending' && (t.contact_id === contactId || (t.deal_id !== null && dealIds.includes(t.deal_id))))
        .map((t) => ({
          id: t.id,
          title: t.title,
          type: t.type,
          channel: t.channel,
          assigned_to: t.assigned_to,
          assigned_role: t.assigned_to ? (base.perfiles.get(t.assigned_to)?.role ?? null) : null,
          assigned_name: null,
          created_at: t.created_at,
          deal_id: t.deal_id,
          contact_id: t.contact_id,
          appraisal_id: t.appraisal_id,
          source_activity_id: t.source_activity_id,
          description: null,
          due_date: t.due_date,
          due_time: t.due_time,
          all_day: false,
          status: t.status,
        }))
    },
    async closeTasksByActivity(ids: string[], activityId: string) {
      if (base.fallarCerrar > 0) {
        base.fallarCerrar -= 1
        throw new Error('red caída (cerrar)')
      }
      const cerradas: string[] = []
      for (const t of base.tareas) {
        if (ids.includes(t.id) && t.status === 'pending') {
          t.status = 'completed'
          t.closed_by_activity_id = activityId
          cerradas.push(t.id)
        }
      }
      return cerradas
    },
    async createCadenceTask(input: CreateTaskInput & { source_activity_id: string }) {
      if (base.fallarCrear > 0) {
        base.fallarCrear -= 1
        throw new Error('red caída (crear)')
      }
      const ya = base.tareas.find((t) => t.source_activity_id === input.source_activity_id)
      if (ya) return { id: ya.id, yaExistia: true }
      const t = base.tarea({
        id: `t-${++secuencia}`,
        title: input.title,
        type: input.type,
        channel: input.channel ?? null,
        assigned_to: input.assigned_to,
        deal_id: input.deal_id ?? null,
        contact_id: input.contact_id ?? null,
        source_activity_id: input.source_activity_id,
        due_date: input.due_date ?? null,
        due_time: input.due_time ? `${input.due_time}:00` : null,
      })
      return { id: t.id, yaExistia: false }
    },
    async getTasksOfActivity(activityId: string) {
      const c = base.tareas.find((t) => t.source_activity_id === activityId && t.status !== 'dismissed')
      return {
        creada: c ? { id: c.id, title: c.title, due_date: c.due_date ?? '', due_time: c.due_time ?? '', channel: c.channel ?? '' } : null,
        cerradas: base.tareas
          .filter((t) => t.closed_by_activity_id === activityId && t.status === 'completed')
          .map((t) => ({ id: t.id, title: t.title })),
      }
    },
  }
  return base
}

export type BaseSimulada = ReturnType<typeof crearBaseSimulada>
