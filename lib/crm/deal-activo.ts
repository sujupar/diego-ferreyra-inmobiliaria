// Proceso activo de un contacto, su situación y quién puede convertirlo o cerrarlo
// (design.md D2). Puro: sin red, sin base, sin reloj.

export const ETAPAS_CERRADAS = ['captured', 'lost', 'comprador'] as const

function estaCerrado(stage: string): boolean {
  return (ETAPAS_CERRADAS as readonly string[]).includes(stage)
}

/**
 * El activo es el proceso ABIERTO más reciente (por `created_at`). Una etapa que no
 * conocemos cuenta como abierta: preferimos mostrarla a esconder un proceso vivo.
 * No se prefiere la solicitud sobre la clase: decisión del dueño (2026-11-25), y cambiar
 * el activo movería el número de intento de llamadas ya cargadas.
 */
export function elegirDealActivo<T extends { id: string; stage: string; created_at: string }>(
  deals: T[],
): T | null {
  let activo: T | null = null
  for (const d of deals) {
    if (estaCerrado(d.stage)) continue
    if (!activo || d.created_at > activo.created_at) activo = d
  }
  return activo
}

export type SituacionProceso = 'solicitud' | 'clase_gratuita' | 'coordinada_o_posterior' | 'sin_proceso'

type ProcesoParaSituacion = { stage: string; scheduled_date: string | null; origin: string | null }

function esEtapaDeSolicitud(deal: { stage: string; scheduled_date: string | null }): boolean {
  // Mismo criterio que `etapaCRM` (lib/crm/etapas.ts): "scheduled" sin día todavía es una solicitud.
  return deal.stage === 'request' || (deal.stage === 'scheduled' && !deal.scheduled_date)
}

/**
 * Un proceso cerrado cuenta como `sin_proceso`: es lo que pide `aplicarCadencia` (D4,
 * paso 3a) cuando la actividad quedó ligada a un proceso que después se cerró.
 */
export function situacionProceso(deal: ProcesoParaSituacion | null): SituacionProceso {
  if (!deal || estaCerrado(deal.stage)) return 'sin_proceso'
  if (deal.stage === 'clase_gratuita') return 'clase_gratuita'
  if (esEtapaDeSolicitud(deal)) {
    // Un proceso de la clase en ese estado no se convierte: se le abre uno nuevo (D9).
    return deal.origin === 'clase_gratuita' ? 'clase_gratuita' : 'solicitud'
  }
  return 'coordinada_o_posterior'
}

export type MotivoNoConvertir = 'sin_permiso' | 'clase_gratuita' | 'ya_cambio_de_etapa'

type UsuarioConvertir = { id: string; puedeVerTodos: boolean; puedeCoordinar: boolean }
type ProcesoConvertir = ProcesoParaSituacion & { assigned_to: string | null }

/**
 * Por qué no se puede convertir, en este orden. El permiso va primero: si no, un asesor
 * sabría por el motivo algo de un proceso que no es suyo. La ruta lo usa para elegir
 * entre 404 y 409 (D9).
 */
export function motivoNoConvertir(u: UsuarioConvertir, deal: ProcesoConvertir): MotivoNoConvertir | null {
  const esSuyo = deal.assigned_to !== null && deal.assigned_to === u.id
  if (!u.puedeCoordinar || (!u.puedeVerTodos && !esSuyo)) return 'sin_permiso'
  if (deal.origin === 'clase_gratuita' || deal.stage === 'clase_gratuita') return 'clase_gratuita'
  if (!esEtapaDeSolicitud(deal)) return 'ya_cambio_de_etapa'
  return null
}

/** Una sola definición: es verdadero exactamente cuando no hay motivo en contra. */
export function puedeConvertirSolicitud(u: UsuarioConvertir, deal: ProcesoConvertir): boolean {
  return motivoNoConvertir(u, deal) === null
}

const ROLES_OPERACIONES = ['admin', 'dueno', 'coordinador']

/**
 * Lista EXPLÍCITA de roles, falla cerrado. No se reutiliza `canAccessDeal`: deja pasar a
 * todo rol que no sea asesor, y el rol viejo `agent` tiene `pipeline.advance`.
 * Un proceso sin asesor no es de ningún asesor.
 */
export function esProcesoPropio(u: { id: string; role: string }, deal: { assigned_to: string | null }): boolean {
  if (ROLES_OPERACIONES.includes(u.role)) return true
  if (u.role === 'asesor') return deal.assigned_to !== null && deal.assigned_to === u.id
  return false
}

export function puedeCerrarProceso(
  u: { id: string; role: string; puedeAvanzar: boolean },
  deal: { assigned_to: string | null },
): boolean {
  return u.puedeAvanzar && esProcesoPropio(u, deal)
}
