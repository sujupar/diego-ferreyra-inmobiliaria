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

/** El resultado del envío a un portal: éxito, o fallo con el motivo para el log/la ficha. */
export type ResultadoEnvioFicha = { ok: true } | { ok: false; motivo: string }

/**
 * Metadata final tras terminar un envío, calculada sobre una lectura FRESCA
 * de la fila (no la foto `locked` de cuando arrancó el envío). El trigger de
 * la ficha puede correr MIENTRAS el adapter está en el aire: mergea
 * `needs_update:true` + el nuevo `cambios_ficha` en la metadata sin tocar
 * `update_in_progress` (ese lock es cosa del worker). Si eso pasó, escribir
 * sobre la foto vieja pisaría el cambio nuevo y se perdería para siempre —
 * por eso todo lo que decide qué guardar vive acá, sobre la metadata fresca.
 */
export function metadataFinalTrasEnvio(fresca: unknown, resultado: ResultadoEnvioFicha): Record<string, unknown> {
  const reMarcado = ((fresca as { needs_update?: unknown } | null)?.needs_update) === true
  if (resultado.ok) {
    // Re-marcado: alguien volvió a tocar la ficha durante el envío. Se deja
    // needs_update en true (y su cambios_ficha ya mergeado) para que el
    // próximo tick del worker lo mande — solo se saca el lock del envío que
    // recién terminó.
    return reMarcado ? stripFlag(fresca, 'update_in_progress') : metadataTrasExito(fresca)
  }
  // Fallo: el flujo normal de reintentos/tope sirve igual esté re-marcado o
  // no, porque `fresca.cambios_ficha` YA es la unión que dejó el trigger.
  return estadoTrasFalloActualizacion(fresca, resultado.motivo)
}
