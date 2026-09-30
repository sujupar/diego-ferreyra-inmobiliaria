import { nextBackoff, isoFromNow } from './backoff'
import { PortalAdapterError, mensajeYDetalle } from './types'

/**
 * Lógica pura del worker (sin Supabase ni I/O).
 * Estos helpers se importan desde `netlify/functions/publish-listings.mts`.
 * Mantener pura para hacerla testeable sin mocks pesados.
 */

export interface ListingErrorState {
  status: 'pending' | 'failed'
  attempts: number
  next_attempt_at: string | null
  last_error: string
}

/**
 * Dado el estado actual de un listing y el error de publish, calcula
 * el siguiente estado: si todavía hay backoff disponible Y el error es
 * retryable, vuelve a 'pending' con nuevo next_attempt_at; sino 'failed'.
 */
export function nextStateAfterError(
  currentAttempts: number,
  err: unknown,
): ListingErrorState {
  // `last_error` es un campo de diagnóstico, no de pantalla: guardamos el
  // mensaje en castellano MÁS el detalle crudo del portal. Sin el detalle,
  // reconstruir qué rechazó exactamente ML se vuelve imposible.
  const { paraElLog: message } = mensajeYDetalle(err)
  const attempts = currentAttempts + 1

  const isRetryable =
    err instanceof PortalAdapterError ? err.retryable !== false : true

  const backoffSeconds = isRetryable ? nextBackoff(attempts - 1) : null

  if (backoffSeconds !== null) {
    return {
      status: 'pending',
      attempts,
      next_attempt_at: isoFromNow(backoffSeconds),
      last_error: message,
    }
  }
  return {
    status: 'failed',
    attempts,
    next_attempt_at: null,
    last_error: message,
  }
}

/**
 * Quita una key de un objeto metadata (jsonb).
 * Inmutable: devuelve un objeto nuevo.
 */
export function stripFlag(metadata: unknown, key: string): Record<string, unknown> {
  const m = { ...((metadata as Record<string, unknown>) ?? {}) }
  delete m[key]
  return m
}

/**
 * Setea una key en metadata, devolviendo objeto nuevo.
 */
export function setFlag(
  metadata: unknown,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return {
    ...((metadata as Record<string, unknown>) ?? {}),
    [key]: value,
  }
}

/**
 * Reemplaza una flag por otra (usado para el lock pattern:
 * needs_update → update_in_progress).
 */
export function swapFlag(
  metadata: unknown,
  from: string,
  to: string,
): Record<string, unknown> {
  const m = stripFlag(metadata, from)
  m[to] = true
  return m
}

/** Cuántas veces se reintenta el envío por cambio de ficha antes de rendirse y avisar. */
export const MAX_INTENTOS_ACTUALIZACION = 3

/**
 * Estado del listing tras un fallo al enviar un cambio de ficha (precio/fotos/
 * expensas) a un portal. Reintenta hasta MAX_INTENTOS_ACTUALIZACION veces (el
 * worker vuelve a levantarlo porque needs_update queda en true); al llegar al
 * tope, deja de reintentar y guarda el fallo en `actualizacion_fallida` para
 * que la ficha lo muestre — un reintento eterno mandando la ficha entera es
 * justo lo que este diseño evita.
 */
export function estadoTrasFalloActualizacion(metadata: unknown, motivo: string): Record<string, unknown> {
  const m = stripFlag(metadata, 'update_in_progress')
  const intentos = Number(m.intentos_actualizacion ?? 0) + 1
  if (intentos < MAX_INTENTOS_ACTUALIZACION) return { ...m, needs_update: true, intentos_actualizacion: intentos }
  return {
    ...m,
    needs_update: false,
    intentos_actualizacion: intentos,
    actualizacion_fallida: { motivo, cambios_ficha: m.cambios_ficha ?? [], fecha: new Date().toISOString() },
  }
}

/**
 * Metadata tras enviar con éxito un cambio de ficha: borra todas las marcas
 * del ciclo de actualización (lock, cola, contador, fallo previo) y conserva
 * el resto (ej. ml_attributes del wizard).
 */
export function metadataTrasExito(metadata: unknown): Record<string, unknown> {
  let m = { ...((metadata as Record<string, unknown>) ?? {}) }
  for (const k of ['needs_update', 'update_in_progress', 'cambios_ficha', 'intentos_actualizacion', 'actualizacion_fallida']) m = stripFlag(m, k)
  return m
}
