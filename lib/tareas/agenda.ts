// Reglas de las tareas: tipo, grupo por vencimiento, cuándo suenan en la campanita,
// posponer y el vencimiento de la tarea de entrada de un lead (crm-tareas-y-campanita, D1).
// Puro: todo en hora de Argentina con `horario-laboral`, nunca con `toISOString()` para días.

import { enArgentina, esDiaHabil, HORARIO_LABORAL, instanteDesdeAR, siguienteDiaHabil } from '@/lib/crm/horario-laboral'
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

export function tipoDeTarea(t: { type: string; channel: string | null }): TipoTarea {
  if (t.channel) return TIPO_POR_CANAL[t.channel] ?? 'otro'
  return TIPO_POR_CLASE[t.type] ?? 'otro'
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

/** El instante desde el que la tarea suena: su hora, o las 9:00 de su día si es de todo el día. */
export function momentoDeAviso(t: ConFecha): Date | null {
  if (!t.due_date) return null
  try {
    return instanteDesdeAR(t.due_date, t.due_time ? t.due_time.slice(0, 5) : HORARIO_LABORAL.inicio)
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
 * Cuándo vence la tarea de entrada de un lead: el registro si entró en horario hábil; antes
 * de las 9 de un día hábil, ese día a las 9; si no, el día hábil siguiente a las 9.
 */
export function vencimientoDeEntrada(registro: Date): { fecha: string; hora: string } {
  const { fecha, hora } = partes(registro)
  if (esDiaHabil(fecha)) {
    if (hora < HORARIO_LABORAL.inicio) return { fecha, hora: HORARIO_LABORAL.inicio }
    if (hora < HORARIO_LABORAL.fin) return { fecha, hora }
  }
  return siguienteDiaHabil(registro)
}

/** Diferencia máxima entre la creación y el vencimiento para leer "Espera hace…". */
const MARGEN_ESPERA_MS = 5 * 60_000

/**
 * La tarea de entrada que venció al crearse (el lead entró en horario) espera desde ese
 * momento: devuelve el instante, para el texto "Espera hace N". Si no, `null`.
 */
export function esperaDesde(t: ConFecha & { type: string; deal_id: string | null; created_at: string }): string | null {
  if (t.type !== 'update_contact' || !t.deal_id || !t.due_time) return null
  const momento = momentoDeAviso(t)
  if (!momento) return null
  return Math.abs(Date.parse(t.created_at) - momento.getTime()) <= MARGEN_ESPERA_MS ? momento.toISOString() : null
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
 * suenan"): el día en que se publicó crm-tareas-y-campanita. Se fija al mergear.
 */
export const INICIO_AVISOS = new Date('2026-11-28T00:00:00-03:00')
