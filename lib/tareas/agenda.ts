// Reglas de las tareas: tipo, grupo por vencimiento, cuándo suenan en la campanita,
// posponer y el vencimiento de la tarea de entrada de un lead (crm-tareas-y-campanita, D1).
// Puro: todo en hora de Argentina con `horario-laboral`, nunca con `toISOString()` para días.

import { enArgentina, enHorarioOProximo, instanteDesdeAR } from '@/lib/crm/horario-laboral'
import { vencimientoDeTarea } from '@/lib/crm/tareas-ficha'

export const TIPOS_TAREA = ['llamada', 'mensaje', 'visita', 'documentacion', 'otro'] as const
export type TipoTarea = (typeof TIPOS_TAREA)[number]

/** Textos de la maqueta (`TIPOS_TAREA` de base.js). */
export const NOMBRE_TIPO: Record<TipoTarea, string> = {
  llamada: 'Llamada',
  mensaje: 'Mensaje',
  visita: 'Visita',
  documentacion: 'Documentación',
  otro: 'Otro',
}

/** El canal que se guarda al crear con cada tipo (CHECK `tasks_channel_check`). */
export const CANAL_DE_TIPO: Record<TipoTarea, 'call' | 'message' | 'visit' | 'document' | 'other'> = {
  llamada: 'call',
  mensaje: 'message',
  visita: 'visit',
  documentacion: 'document',
  otro: 'other',
}

const TIPO_POR_CANAL: Record<string, TipoTarea> = {
  call: 'llamada',
  message: 'mensaje',
  visit: 'visita',
  document: 'documentacion',
  other: 'otro',
  email: 'otro', // canal viejo: el formulario ya no lo ofrece
}

const TIPO_POR_CLASE: Record<string, TipoTarea> = {
  update_contact: 'llamada', // la entrada de un lead: hay que llamarlo
  new_assignment: 'visita', // tasación coordinada
  review_property: 'documentacion',
  rejected_docs: 'documentacion',
  complete_imported_property: 'documentacion',
  informe_quincenal: 'documentacion',
}

export function tipoDeTarea(t: { type: string; channel: string | null; title?: string }): TipoTarea {
  if (t.channel) return TIPO_POR_CANAL[t.channel] ?? 'otro'
  // "Actualizar contacto: {dirección}" (la que deja `advance` al avanzar) no es una llamada:
  // es completar datos. Solo la de entrada de un lead lo es (auditoría, hallazgo 17).
  if (t.type === 'update_contact' && t.title?.startsWith('Actualizar contacto')) return 'otro'
  return TIPO_POR_CLASE[t.type] ?? 'otro'
}

/** La tarea de entrada de un lead (desde crm-tareas-y-campanita nace con canal "call"). */
export function esTareaDeEntrada(t: { type: string; channel: string | null; deal_id: string | null }): boolean {
  return t.type === 'update_contact' && t.channel === 'call' && !!t.deal_id
}

export type GrupoTarea = 'vencidas' | 'hoy' | 'proximas' | 'sin_fecha'
export const GRUPOS_CON_FECHA = ['vencidas', 'hoy', 'proximas'] as const

interface ConFecha {
  due_date: string | null
  due_time: string | null
}

export function grupoDeTarea(t: ConFecha, ahora: Date): GrupoTarea {
  if (!t.due_date) return 'sin_fecha'
  if (vencimientoDeTarea(t, ahora).vencida) return 'vencidas'
  return t.due_date === enArgentina(ahora).fecha ? 'hoy' : 'proximas'
}

/**
 * Desde qué hora suena una tarea "todo el día". NO es el horario de la coordinación (10 a
 * 14): avisa desde las 9:00, como dice la spec de avisos y "Nueva tarea" (crm-cadencia-paula,
 * auditoría 2).
 */
export const HORA_AVISO_TODO_EL_DIA = '09:00'

/** El instante desde el que la tarea suena: su hora, o las 9:00 de su día si es de todo el día. */
export function momentoDeAviso(t: ConFecha): Date | null {
  if (!t.due_date) return null
  try {
    return instanteDesdeAR(t.due_date, t.due_time ? t.due_time.slice(0, 5) : HORA_AVISO_TODO_EL_DIA)
  } catch {
    return null
  }
}

/**
 * Si la tarea suena en la campanita: `vencida`, `ahora` (sonó sin vencer) o `null`. Lo que
 * debía sonar antes de `corte` (la publicación de este cambio) no suena.
 */
export function estadoDeAviso(t: ConFecha, ahora: Date, corte: Date): 'vencida' | 'ahora' | null {
  const momento = momentoDeAviso(t)
  if (!momento || momento.getTime() < corte.getTime() || momento.getTime() > ahora.getTime()) return null
  return vencimientoDeTarea(t, ahora).vencida ? 'vencida' : 'ahora'
}

function partes(instante: Date): { fecha: string; hora: string } {
  const a = enArgentina(instante)
  return { fecha: a.fecha, hora: a.hora.slice(0, 5) }
}

/** Ahora + 60 minutos, redondeado hacia arriba de a 5 minutos. */
export function enUnaHora(ahora: Date): { fecha: string; hora: string } {
  const paso = 5 * 60_000
  const t = Math.ceil((ahora.getTime() + 60 * 60_000) / paso) * paso
  return partes(new Date(t))
}

/** El día de calendario siguiente a las 9:00 (no el hábil: es lo que dice la opción). */
export function mananaALas9(ahora: Date): { fecha: string; hora: string } {
  const hoy = instanteDesdeAR(enArgentina(ahora).fecha, '12:00')
  return { fecha: enArgentina(new Date(hoy.getTime() + 24 * 60 * 60_000)).fecha, hora: '09:00' }
}

export function validarMomento(fecha: string, hora: string, ahora: Date): string | null {
  let m: Date
  try {
    m = instanteDesdeAR(fecha, hora)
  } catch {
    return 'Elegí un día y una hora válidos.'
  }
  if (Number.isNaN(m.getTime()) || enArgentina(m).fecha !== fecha) return 'Elegí un día y una hora válidos.'
  return m.getTime() < ahora.getTime() ? 'Elegí un día y una hora que todavía no hayan pasado.' : null
}

/**
 * Cuándo vence la tarea de entrada de un lead: el registro si entró en el horario de la
 * coordinación (lunes a viernes de 10:00 a 13:59; sin feriados); antes de las 10 de un día
 * hábil, ese día a las 10; si no, el día hábil siguiente a las 10. Es `enHorarioOProximo`,
 * la misma regla que el WhatsApp de la cadencia. También la usa la cartera para las tareas
 * de entrada viejas, sin fecha.
 */
export const vencimientoDeEntrada = enHorarioOProximo

/** Diferencia máxima entre la creación y el vencimiento para leer "Espera hace…". */
const MARGEN_ESPERA_MS = 5 * 60_000

/**
 * La tarea de entrada que vence en el momento del registro (el lead entró en horario) espera
 * desde ahí: devuelve el instante, para el texto "Espera hace N". Si no, `null`.
 * `registradoEn` es el alta del proceso (el registro real); sin él, la creación de la tarea.
 * Una tarea de entrada pendiente implica que nadie llamó todavía: la llamada de la
 * coordinación la cierra (cadencia) y salir de "Solicitud" también.
 */
export function esperaDesde(
  t: ConFecha & { type: string; deal_id: string | null; created_at: string },
  registradoEn?: string | null,
): string | null {
  if (t.type !== 'update_contact' || !t.deal_id || !t.due_time) return null
  const momento = momentoDeAviso(t)
  const base = Date.parse(registradoEn ?? t.created_at)
  if (!momento || Number.isNaN(base)) return null
  return Math.abs(base - momento.getTime()) <= MARGEN_ESPERA_MS ? momento.toISOString() : null
}

export function resumenDeGrupos(n: Record<GrupoTarea, number>): string {
  const partes: string[] = []
  if (n.vencidas) partes.push(`${n.vencidas} ${n.vencidas === 1 ? 'vencida' : 'vencidas'}`)
  if (n.hoy) partes.push(`${n.hoy} para hoy`)
  if (n.proximas) partes.push(`${n.proximas} ${n.proximas === 1 ? 'próxima' : 'próximas'}`)
  if (n.sin_fecha) partes.push(`${n.sin_fecha} sin fecha`)
  return partes.length > 0 ? partes.join(' · ') : 'Nada pendiente'
}

/**
 * Desde cuándo suenan las tareas en la campanita (spec "Las vencidas antes de este cambio no
 * suenan"): las 00:00 de Argentina del día en que se publica crm-tareas-y-campanita. Se
 * revisa al mergear (si se publica otro día, se cambia a ese día).
 */
export const INICIO_AVISOS = new Date('2026-11-27T00:00:00-03:00')
