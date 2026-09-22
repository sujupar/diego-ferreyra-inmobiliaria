/**
 * El modo de un reel, como lo entiende una persona: Apagado, Modo prueba o En vivo.
 *
 * Por qué existe: la pantalla tenía dos interruptores ("Automatización" y
 * "Modo simulacro") y el dueño no supo cuándo usar cada uno (2026-09-22). Las
 * cuatro combinaciones se reducen a tres situaciones reales, y eso es lo que se
 * muestra.
 *
 * NO es una columna nueva: se traduce a las dos que ya existen. Así el
 * procesador, los frenos de `decision.ts` y el cron no cambian ni una línea.
 *
 * Módulo PURO.
 */

export type ModoReel = 'apagado' | 'prueba' | 'en_vivo'

export interface CamposDeModo {
  automatizacion_activa: boolean
  simulacro: boolean
}

export function modoDelReel(r: CamposDeModo): ModoReel {
  if (!r.automatizacion_activa) return 'apagado'
  return r.simulacro ? 'prueba' : 'en_vivo'
}

/**
 * Apagado deja el simulacro PRENDIDO a propósito: si alguien vuelve a activar
 * tocando solo "Automatización" por otro camino, el reel arranca en prueba y no
 * hablándole a todos.
 */
export function camposDelModo(modo: ModoReel): CamposDeModo {
  switch (modo) {
    case 'apagado':
      return { automatizacion_activa: false, simulacro: true }
    case 'prueba':
      return { automatizacion_activa: true, simulacro: true }
    case 'en_vivo':
      return { automatizacion_activa: true, simulacro: false }
  }
}

export const ETIQUETA_MODO: Record<ModoReel, string> = {
  apagado: 'Apagado',
  prueba: 'Modo prueba',
  en_vivo: 'En vivo',
}
