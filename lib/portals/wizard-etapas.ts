/**
 * Regla de navegación por las pastillas del stepper de los wizards de portal
 * (MercadoLibre y Argenprop comparten esta lógica).
 *
 * Pedido del dueño (2026-09-14): poder tocar "Campos" o "Descripción" y caer
 * ahí directo cuando ya se pasó por esas etapas, en vez de ir con Atrás /
 * Siguiente. Lo que NO se afloja: cada etapa valida lo suyo, así que hacia
 * adelante solo se llega hasta donde ya se llegó, y con la etapa actual
 * completa. Puro, sin React.
 */
export interface SaltoDeEtapa {
  destino: number
  actual: number
  /** Índice más alto que el asesor ya visitó en esta sesión del wizard. */
  maxAlcanzada: number
  /** Si la etapa actual pasa su validación (lo que habilita "Siguiente"). */
  actualValida: boolean
}

export function puedeSaltarA({ destino, actual, maxAlcanzada, actualValida }: SaltoDeEtapa): boolean {
  if (!Number.isInteger(destino) || destino < 0) return false
  if (destino === actual) return false
  if (destino < actual) return true
  return actualValida && destino <= maxAlcanzada
}

/** La etapa más lejana alcanzada nunca retrocede. */
export function alcanzadaTras(maxAlcanzada: number, nueva: number): number {
  return Math.max(maxAlcanzada, nueva)
}
