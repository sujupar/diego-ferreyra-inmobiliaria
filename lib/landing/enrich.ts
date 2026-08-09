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
 * Las etapas del arranque automático, en el orden en que deben correr.
 *
 * Están separadas UNA POR LLAMADA a propósito. En particular `vision` y
 * `description` viven aparte porque cada una puede tardar sola más de 10s
 * (Vision tiene su propio corte a los 15s, y la descripción de portal se genera
 * con IA cuando no está cacheada): juntas se pasaban del límite. `location` no
 * usa IA (búsquedas + mercado, cacheado) pero igual va en su propia llamada.
 *
 * `copy` YA NO corre en el arranque (decisión del usuario, 2026-08-06): los
 * textos se generan recién cuando el asesor manda sus respuestas — son las
 * respuestas las que hacen que el copy no sea genérico. El envío de respuestas
 * re-arma `enrich='copy'` y el mismo loop del cliente ejecuta esa etapa.
 */
export const ENRICH_STAGES = ['vision', 'location', 'description', 'avatars'] as const

export type EnrichStage = (typeof ENRICH_STAGES)[number] | 'copy' | 'done'

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
 *
 * 'copy' es válida aunque no esté en ENRICH_STAGES: es la etapa RE-ARMADA por
 * el envío de respuestas (y cubre drafts viejos que quedaron a mitad en v1).
 */
export function nextEnrichStage(ws: WizardStateLike): EnrichStage {
  const s = ws.enrich
  if (s === 'copy') return 'copy'
  if (s && (ENRICH_STAGES as readonly string[]).includes(s)) return s
  return 'done'
}

/** Texto que ve el asesor mientras espera. */
export function enrichLabel(stage: EnrichStage): string {
  switch (stage) {
    case 'vision':
      return 'Analizando las fotos de la propiedad…'
    case 'location':
      return 'Investigando la ubicación…'
    case 'description':
      return 'Preparando la descripción de la propiedad…'
    case 'avatars':
      return 'Armando los avatares y las preguntas…'
    case 'copy':
      return 'Escribiendo los textos de la landing…'
    default:
      return 'Listo'
  }
}

/** Progreso 1-100 para la barra. Arranca por encima de 0 para que se vea movimiento. */
export function enrichPercent(stage: EnrichStage): number {
  if (stage === 'copy') return 90
  const i = (ENRICH_STAGES as readonly string[]).indexOf(stage)
  if (i < 0) return 100
  return Math.round(((i + 0.5) / ENRICH_STAGES.length) * 100)
}
