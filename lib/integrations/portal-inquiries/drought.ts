/**
 * Alerta de sequía: detecta que Gmail no devuelve NINGÚN email de portales
 * (fetched=0, ni siquiera duplicados) por más de DROUGHT_THRESHOLD_MS.
 * Señal inequívoca de casilla rota (MX/DNS caído, cuenta suspendida) o de los
 * 3 portales mudos a la vez — en ambos casos alguien tiene que mirar.
 *
 * Lección 2026-07: la casilla contacto@ estuvo 8 días sin MX y el cron seguía
 * reportando "ok" con fetched=0. Esta alerta lo habría detectado a las 48h.
 *
 * Lógica pura (testeable sin DB/red); el cron la conecta al estado persistido.
 */

export const DROUGHT_THRESHOLD_MS = 48 * 60 * 60 * 1000 // 48h sin emails
export const ALERT_THROTTLE_MS = 24 * 60 * 60 * 1000 // re-avisar máx 1/día

export interface DroughtInput {
  /** Emails de portales que devolvió Gmail en esta corrida (incluye ya procesados). */
  fetched: number
  /** Última corrida con fetched>0 (persistido). Null = sin dato (primer arranque). */
  lastNonZeroFetchAt: Date | null
  /** Último alert enviado (persistido). Null = nunca. */
  lastAlertAt: Date | null
  now: Date
}

export interface DroughtVerdict {
  /** true si estamos en sequía (>=48h sin ver un solo email de portales). */
  isDrought: boolean
  /** true si corresponde ENVIAR la alerta en esta corrida (sequía + throttle ok). */
  shouldAlert: boolean
  /** Valor a persistir como last_nonzero_fetch_at tras esta corrida. */
  nextLastNonZeroFetchAt: Date
  /** Horas transcurridas sin emails (para el texto del mensaje). */
  hoursDry: number
}

export function evaluateDrought(input: DroughtInput): DroughtVerdict {
  const { fetched, lastNonZeroFetchAt, lastAlertAt, now } = input

  if (fetched > 0) {
    return { isDrought: false, shouldAlert: false, nextLastNonZeroFetchAt: now, hoursDry: 0 }
  }

  // Sin dato previo (primer deploy / fila nueva): arrancar el reloj ahora,
  // nunca alertar sobre un pasado que no medimos.
  if (!lastNonZeroFetchAt) {
    return { isDrought: false, shouldAlert: false, nextLastNonZeroFetchAt: now, hoursDry: 0 }
  }

  const dryMs = now.getTime() - lastNonZeroFetchAt.getTime()
  const isDrought = dryMs >= DROUGHT_THRESHOLD_MS
  const throttleOk = !lastAlertAt || now.getTime() - lastAlertAt.getTime() >= ALERT_THROTTLE_MS

  return {
    isDrought,
    shouldAlert: isDrought && throttleOk,
    nextLastNonZeroFetchAt: lastNonZeroFetchAt, // la sequía sigue: no mover el reloj
    hoursDry: Math.floor(dryMs / 3_600_000),
  }
}
