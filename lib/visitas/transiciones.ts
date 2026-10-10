/**
 * Etapas de una visita y qué se puede hacer en cada una (spec §3.3).
 * Módulo puro: decide el `patch` a escribir; la ruta lo aplica y el trigger de
 * la base deja el historial (confirmed_at, outcome_at, eventos).
 *
 * Los 5 estados son los mismos de siempre (los leen 16 archivos: inicio,
 * pendientes, agente, recordatorio…). No agregar uno sin revisar todos.
 */
import { validarHorarioDeVisita } from './horario'

export const ESTADOS_VISITA = ['pending_confirmation', 'scheduled', 'completed', 'no_show', 'cancelled'] as const
export type EstadoVisita = (typeof ESTADOS_VISITA)[number]

export const ESTADO_ETIQUETA: Record<EstadoVisita, string> = {
  pending_confirmation: 'A confirmar',
  scheduled: 'Confirmada',
  completed: 'Realizada',
  no_show: 'No se realizó',
  cancelled: 'Cancelada',
}

export const ESTADOS_ACTIVOS: readonly EstadoVisita[] = ['pending_confirmation', 'scheduled']
export const ESTADOS_FINALES: readonly EstadoVisita[] = ['completed', 'no_show', 'cancelled']

export function esEstadoVisita(v: unknown): v is EstadoVisita {
  return typeof v === 'string' && (ESTADOS_VISITA as readonly string[]).includes(v)
}

/** Mismo catálogo que el CHECK `property_visits_outcome_reason_check`. */
export const MOTIVOS_NO_REALIZADA = [
  'no_vino', 'cancelo_persona', 'cancelo_propietario', 'cancelamos_nosotros', 'no_disponible', 'otro',
] as const
export type MotivoNoRealizada = (typeof MOTIVOS_NO_REALIZADA)[number]

export const MOTIVO_ETIQUETA: Record<MotivoNoRealizada, string> = {
  no_vino: 'No vino',
  cancelo_persona: 'Canceló la persona',
  cancelo_propietario: 'Canceló el propietario',
  cancelamos_nosotros: 'Cancelamos nosotros',
  no_disponible: 'La propiedad dejó de estar disponible',
  otro: 'Otro',
}

export const INTERESES = ['alto', 'medio', 'bajo'] as const
export type Interes = (typeof INTERESES)[number]
export const INTERES_ETIQUETA: Record<Interes, string> = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }

/** Se puede marcar el resultado desde 1 h antes del horario: la visita está ocurriendo. */
const MARGEN_RESULTADO_MS = 60 * 60 * 1000
const LARGO_NOTAS = 1000
const LARGO_DETALLE = 500

export type AccionVisita =
  | { tipo: 'confirmar' }
  | { tipo: 'reprogramar'; fecha: string; hora: string }
  | { tipo: 'cancelar'; motivo: MotivoNoRealizada; detalle?: string | null }
  | { tipo: 'realizada'; interes: Interes; notas?: string | null }
  | { tipo: 'no_realizada'; motivo: MotivoNoRealizada; detalle?: string | null }
  | { tipo: 'cambiar_asesor'; asesorId: string }
  | { tipo: 'reabrir'; motivo: string }

export type TipoAccion = AccionVisita['tipo']

export interface VisitaParaAccion {
  status: EstadoVisita
  scheduled_at: string
  advisor_id: string | null
}

export interface PatchVisita {
  status?: EstadoVisita
  scheduled_at?: string
  advisor_id?: string
  outcome_reason?: MotivoNoRealizada | null
  advisor_interest?: Interes | null
  completion_notes?: string | null
}

export type ResultadoAccion = { ok: true; patch: PatchVisita } | { ok: false; error: string }

function limpiar(texto: string | null | undefined, largo: number): string {
  return (texto ?? '').normalize('NFC').replace(/[^\S\n]+/g, ' ').trim().slice(0, largo)
}

function yaPuedeTenerResultado(v: VisitaParaAccion, ahora: Date): boolean {
  return new Date(v.scheduled_at).getTime() - MARGEN_RESULTADO_MS <= ahora.getTime()
}

export function pasoSinResultado(v: VisitaParaAccion, ahora: Date): boolean {
  return ESTADOS_ACTIVOS.includes(v.status) && new Date(v.scheduled_at).getTime() < ahora.getTime()
}

export function accionesDisponibles(v: VisitaParaAccion, ahora: Date): TipoAccion[] {
  if (ESTADOS_FINALES.includes(v.status)) return ['reabrir']
  const acciones: TipoAccion[] = []
  if (v.status === 'pending_confirmation') acciones.push('confirmar')
  const conResultado = yaPuedeTenerResultado(v, ahora)
  if (conResultado) acciones.push('realizada', 'no_realizada')
  acciones.push('reprogramar')
  // Después del horario ya no es "cancelar": es "No se realizó" con su motivo.
  if (!conResultado) acciones.push('cancelar')
  acciones.push('cambiar_asesor')
  return acciones
}

function motivoValido(
  motivo: MotivoNoRealizada,
  detalle: string | null | undefined,
): { ok: true; nota: string | null } | { ok: false; error: string } {
  if (!(MOTIVOS_NO_REALIZADA as readonly string[]).includes(motivo)) return { ok: false, error: 'Elegí un motivo' }
  const nota = limpiar(detalle, LARGO_DETALLE)
  if (motivo === 'otro' && nota.length < 3) return { ok: false, error: 'Contanos el motivo' }
  return { ok: true, nota: nota || null }
}

const MENSAJE_NO_DISPONIBLE: Record<TipoAccion, string> = {
  confirmar: 'Esta visita ya no se puede confirmar',
  reprogramar: 'Esta visita ya no se puede reprogramar',
  cancelar: 'Esta visita ya no se puede cancelar',
  realizada: 'Todavía no llegó el horario de la visita',
  no_realizada: 'Todavía no llegó el horario de la visita',
  cambiar_asesor: 'A esta visita ya no se le puede cambiar el asesor',
  reabrir: 'Esta visita todavía está abierta',
}

export function aplicarAccion(v: VisitaParaAccion, accion: AccionVisita, ahora: Date): ResultadoAccion {
  if (!accionesDisponibles(v, ahora).includes(accion.tipo)) {
    // Una visita cerrada "no llegó al horario" no tiene sentido: decir la verdad.
    if ((accion.tipo === 'realizada' || accion.tipo === 'no_realizada') && ESTADOS_FINALES.includes(v.status)) {
      return { ok: false, error: 'Esta visita ya tiene resultado' }
    }
    return { ok: false, error: MENSAJE_NO_DISPONIBLE[accion.tipo] }
  }

  switch (accion.tipo) {
    case 'confirmar':
      return { ok: true, patch: { status: 'scheduled' } }
    case 'reprogramar': {
      const h = validarHorarioDeVisita(accion.fecha, accion.hora, ahora)
      if (!h.ok) return h
      if (h.instante.getTime() === new Date(v.scheduled_at).getTime()) return { ok: false, error: 'Es el mismo día y horario' }
      if (h.instante.getTime() < ahora.getTime()) return { ok: false, error: 'Elegí un horario que todavía no pasó' }
      return { ok: true, patch: { scheduled_at: h.instante.toISOString() } }
    }
    case 'cancelar': {
      const m = motivoValido(accion.motivo, accion.detalle)
      if (!m.ok) return m
      return { ok: true, patch: { status: 'cancelled', outcome_reason: accion.motivo, completion_notes: m.nota } }
    }
    case 'no_realizada': {
      const m = motivoValido(accion.motivo, accion.detalle)
      if (!m.ok) return m
      return { ok: true, patch: { status: 'no_show', outcome_reason: accion.motivo, completion_notes: m.nota } }
    }
    case 'realizada': {
      // Spec §3.3: "Se realizó" pide ¿Cómo viste el interés? (Alto / Medio / Bajo). Sin
      // ese dato la visita realizada no le dice nada al seguimiento. El tipo ya lo
      // exige; esto lo frena en tiempo de ejecución (un cuerpo sin interés o inventado).
      const interes: unknown = accion.interes
      if (!(INTERESES as readonly unknown[]).includes(interes)) return { ok: false, error: 'Elegí cómo viste el interés' }
      const notas = limpiar(accion.notas, LARGO_NOTAS)
      return { ok: true, patch: { status: 'completed', advisor_interest: accion.interes, completion_notes: notas || null, outcome_reason: null } }
    }
    case 'cambiar_asesor': {
      const id = accion.asesorId.trim()
      if (!id) return { ok: false, error: 'Elegí el asesor' }
      if (id === v.advisor_id) return { ok: false, error: 'Ese asesor ya tiene la visita' }
      return { ok: true, patch: { advisor_id: id } }
    }
    case 'reabrir': {
      const motivo = limpiar(accion.motivo, LARGO_DETALLE)
      if (motivo.length < 3) return { ok: false, error: 'Contanos por qué la reabrís' }
      return {
        ok: true,
        patch: { status: 'scheduled', outcome_reason: null, advisor_interest: null, completion_notes: `Reabierta: ${motivo}` },
      }
    }
  }
}
