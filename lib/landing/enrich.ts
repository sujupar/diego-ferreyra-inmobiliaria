/**
 * Máquina de etapas del enriquecimiento con IA de la landing.
 *
 * POR QUÉ EXISTE (bug real, 2026-07-29): `startCoCreation` corría CUATRO etapas
 * de IA en un solo request HTTP —Vision sobre 8 fotos, descripción de portal,
 * 3 avatares + preguntas, y el copy de conversión—. Medido: ~17s sin Vision y
 * ~15s más con Vision en producción, total ~30s. Las funciones de Netlify se
 * cortan bastante antes de eso (el `maxDuration = 60` de Next es una directiva
 * de Vercel, Netlify no la respeta), así que el gateway mataba la función y
 * devolvía una página HTML de error 504. Tres landings se habían creado bien de
 * pura suerte de latencia: las 4 propiedades tienen las MISMAS 12 fotos y
 * descripciones parecidas, no había diferencia estructural. Era una moneda al aire.
 *
 * La solución es la misma que ya usa el generador de carruseles y el wizard de
 * Meta v2: el POST de creación es RÁPIDO (cero IA) y el trabajo pesado se hace
 * en llamadas separadas, UNA ETAPA POR LLAMADA, con el cliente mostrando el
 * progreso. Cada llamada entra cómoda en el límite y un fallo se reintenta solo
 * en su etapa, sin volver a pagar las anteriores.
 *
 * Este archivo es solo la máquina de estados: puro, sin IO, testeado.
 */

/**
 * Las etapas pesadas, en el orden en que deben correr.
 *
 * Están separadas UNA POR LLAMADA a propósito. En particular `vision` y
 * `description` viven aparte porque cada una puede tardar sola más de 10s
 * (Vision tiene su propio corte a los 15s, y la descripción de portal se genera
 * con IA cuando no está cacheada): juntas se pasaban del límite.
 */
export const ENRICH_STAGES = ['vision', 'description', 'avatars', 'copy'] as const

export type EnrichStage = (typeof ENRICH_STAGES)[number] | 'done'

interface WizardStateLike {
  enrich?: EnrichStage
}

/**
 * Qué etapa toca ahora.
 *
 * Una landing SIN el campo `enrich` es una landing creada antes de este cambio:
 * ya tiene su contenido completo, así que se trata como terminada. Nunca se
 * re-genera nada sobre ella (re-generar pisaría el contenido que el asesor pudo
 * haber editado). Un valor desconocido cae al mismo lugar: 'done' es el estado
 * seguro, porque garantiza que el loop del cliente termine siempre.
 */
export function nextEnrichStage(ws: WizardStateLike): EnrichStage {
  const s = ws.enrich
  if (s && (ENRICH_STAGES as readonly string[]).includes(s)) return s
  return 'done'
}

/** Texto que ve el asesor mientras espera. */
export function enrichLabel(stage: EnrichStage): string {
  switch (stage) {
    case 'vision':
      return 'Analizando las fotos de la propiedad…'
    case 'description':
      return 'Preparando la descripción de la propiedad…'
    case 'avatars':
      return 'Armando los avatares del comprador…'
    case 'copy':
      return 'Escribiendo los textos de la landing…'
    default:
      return 'Listo'
  }
}

/** Progreso 1-100 para la barra. Arranca por encima de 0 para que se vea movimiento. */
export function enrichPercent(stage: EnrichStage): number {
  const i = (ENRICH_STAGES as readonly string[]).indexOf(stage)
  if (i < 0) return 100
  return Math.round(((i + 0.5) / ENRICH_STAGES.length) * 100)
}
