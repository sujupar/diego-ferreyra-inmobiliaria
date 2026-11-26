// Qué tareas lista la ficha y cuándo una está vencida (design.md D3 y D5). Puro.
import { diasDeCalendarioEntre, enArgentina, instanteDesdeAR } from './horario-laboral'

/**
 * Saca (a) las `new_assignment` de procesos con tasación agendada (ya se ven en su
 * tarjeta), (b) las de procesos ocultos para quien mira y (c) con `soloPropiasSinProceso`
 * (asesor) las ligadas solo al contacto que no son suyas. Una tarea asignada a quien mira
 * NUNCA se oculta por (b) ni por (c): el "Llamar a…" que un asesor se agendó sobre un
 * proceso ajeno tiene que verse en su ficha. Solo la usa `GET …/tasks`: el cierre de la
 * cadencia trabaja sobre la lista completa.
 */
export function tareasVisiblesEnFicha<T extends { type: string; deal_id: string | null; assigned_to: string | null }>(
  tareas: T[],
  c: { dealsConTasacionAgendada: string[]; dealsOcultos: string[]; usuarioId: string; soloPropiasSinProceso: boolean },
): T[] {
  return tareas.filter((t) => {
    if (t.type === 'new_assignment' && t.deal_id && c.dealsConTasacionAgendada.includes(t.deal_id)) return false
    const esDeQuienMira = !!c.usuarioId && t.assigned_to === c.usuarioId
    if (esDeQuienMira) return true
    if (t.deal_id && c.dealsOcultos.includes(t.deal_id)) return false
    if (!t.deal_id && c.soloPropiasSinProceso) return false
    return true
  })
}

/**
 * A dónde lleva una tarea de la cadencia desde `/tasks` (D5, tarea 11.3): una `follow_up`
 * que nació de una actividad (`source_activity_id`) y tiene contacto abre la ficha, donde
 * se registra la llamada. Si abriera el proceso, la coordinadora no podría registrarla
 * ahí, y el asesor con un "Llamar a…" sobre un proceso ajeno caería en una pantalla que le
 * responde 403. Cualquier otra tarea → `null`, y `/tasks` decide como siempre.
 */
export function enlaceTareaCadencia(t: {
  type: string
  source_activity_id?: string | null
  contact_id: string | null
  deal_id?: string | null
}): string | null {
  if (t.type !== 'follow_up' || !t.source_activity_id || !t.contact_id) return null
  return `/contacts/${t.contact_id}`
}

/**
 * `due_date`/`due_time` se leen SIEMPRE como hora de Argentina (decisión 8.4), nunca con
 * `toISOString()` (que corre las tareas de noche). Con fecha y hora vence cuando ese
 * momento pasó; con fecha sola, recién al día siguiente; sin fecha, nunca. `dias` cuenta
 * días de calendario de Argentina desde la fecha de la tarea; `null` si no está vencida.
 * Una fecha que no se entiende no vence: no se rompe la lista por un dato raro.
 */
export function vencimientoDeTarea(
  tarea: { due_date: string | null; due_time: string | null },
  ahora: Date,
): { vencida: boolean; dias: number | null } {
  const noVencida = { vencida: false, dias: null }
  if (!tarea.due_date) return noVencida
  let inicioDelDia: Date
  try {
    inicioDelDia = instanteDesdeAR(tarea.due_date, '00:00')
  } catch (err) {
    console.warn('[vencimientoDeTarea] fecha de tarea que no se entiende', { due_date: tarea.due_date, err })
    return noVencida
  }
  const dias = diasDeCalendarioEntre(inicioDelDia, ahora)
  if (tarea.due_time) {
    let momento: Date
    try {
      momento = instanteDesdeAR(tarea.due_date, tarea.due_time.slice(0, 5))
    } catch (err) {
      console.warn('[vencimientoDeTarea] hora de tarea que no se entiende', { due_time: tarea.due_time, err })
      return noVencida
    }
    return momento.getTime() < ahora.getTime() ? { vencida: true, dias } : noVencida
  }
  return tarea.due_date < enArgentina(ahora).fecha ? { vencida: true, dias } : noVencida
}
