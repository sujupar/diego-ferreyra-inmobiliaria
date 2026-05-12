/**
 * Backoff exponencial: 1m, 5m, 25m, 2h, 12h, después fail definitivo.
 * Total: ~15 horas de retries antes de declarar failed.
 */
const BACKOFF_SECONDS = [60, 300, 1500, 7200, 43200]

export function nextBackoff(attempt: number): number | null {
  return BACKOFF_SECONDS[attempt] ?? null
}

export function isoFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

export const MAX_ATTEMPTS = BACKOFF_SECONDS.length
