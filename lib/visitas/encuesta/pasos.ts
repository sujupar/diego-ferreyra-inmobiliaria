/**
 * Orden de la encuesta y de dónde se retoma (spec §3.6: "si abandona en la 3, las dos primeras
 * quedan; si vuelve a abrir el link, retoma donde quedó"). Puro y seguro para el navegador.
 */
import { PASOS_ENCUESTA, PASOS_GUARDABLES, type PasoEncuesta, type PasoGuardable, type RespuestasEncuesta } from './tipos'

export function esPasoGuardable(p: PasoEncuesta): p is PasoGuardable {
  return (PASOS_GUARDABLES as readonly string[]).includes(p)
}

export function pasoSiguiente(p: PasoEncuesta): PasoEncuesta {
  const i = PASOS_ENCUESTA.indexOf(p)
  return PASOS_ENCUESTA[Math.min(i + 1, PASOS_ENCUESTA.length - 1)]
}

/** Sin "atrás" en la bienvenida (no hay nada antes) ni en gracias (ya está enviada). */
export function pasoAnterior(p: PasoEncuesta): PasoEncuesta | null {
  if (p === 'bienvenida' || p === 'gracias') return null
  return PASOS_ENCUESTA[PASOS_ENCUESTA.indexOf(p) - 1]
}

export function pasoRespondido(p: PasoGuardable, r: RespuestasEncuesta): boolean {
  switch (p) {
    case 'gusto': return r.liked !== null
    case 'mas_gusto': return r.most_liked_tags.length > 0 || !!r.most_liked_other
    case 'menos_gusto': return r.least_liked_tags.length > 0 || !!r.least_liked_other
    case 'precio': return r.price_opinion !== null
    case 'oferta': return r.offer_amount !== null || r.offer_declined === true
  }
}

export function primerPasoSinResponder(r: RespuestasEncuesta): PasoGuardable | null {
  return PASOS_GUARDABLES.find(p => !pasoRespondido(p, r)) ?? null
}

export function pasoParaRetomar(r: RespuestasEncuesta, completa: boolean): PasoEncuesta {
  if (completa) return 'gracias'
  if (!PASOS_GUARDABLES.some(p => pasoRespondido(p, r))) return 'bienvenida'
  return primerPasoSinResponder(r) ?? 'contacto'
}

/** Fracción 0..1 para la barra fina. A propósito NO hay "paso N de M" (decisión del dueño). */
export function avance(p: PasoEncuesta): number {
  return PASOS_ENCUESTA.indexOf(p) / (PASOS_ENCUESTA.length - 1)
}
