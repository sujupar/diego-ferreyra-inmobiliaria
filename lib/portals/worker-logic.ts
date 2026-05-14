import { nextBackoff, isoFromNow } from './backoff'
import { PortalAdapterError } from './types'

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
  const message = err instanceof Error ? err.message : String(err)
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
