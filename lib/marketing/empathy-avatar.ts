/**
 * E1.4 — EmpathyAvatar: avatar de comprador con MAPA DE EMPATÍA completo.
 *
 * Superset de BuyerAvatar (mantiene todos sus campos → el runner de imágenes de
 * la campaña lee `shortLabel`/`hooks`/etc. sin cambios). Agrega el mapa de
 * empatía (dice/piensa/siente/hace) + dolores/ganancias + jobs-to-be-done +
 * objeciones + canal + disparadores de decisión.
 *
 * Se genera al crear la landing (E1.4) y se COMPARTE con la campaña (E2.3) vía
 * la tabla property_avatars.
 */
import type { BuyerAvatar } from './buyer-avatar-generator'

export interface EmpathyMap {
  /** Qué dice en voz alta (declaraciones públicas). */
  says: string[]
  /** Qué piensa pero no dice (creencias, dudas internas). */
  thinks: string[]
  /** Qué siente (emociones, miedos, deseos). */
  feels: string[]
  /** Qué hace (comportamientos, acciones observables). */
  does: string[]
}

export interface EmpathyAvatar extends BuyerAvatar {
  empathyMap: EmpathyMap
  /** Dolores / frustraciones que trae al proceso de compra. */
  pains: string[]
  /** Ganancias deseadas (qué quiere lograr / cómo quiere sentirse). */
  gains: string[]
  /** "Trabajos" que quiere resolver comprando esta propiedad. */
  jobsToBeDone: string[]
  /** Objeciones concretas que hay que superar para que avance. */
  objections: string[]
  /** Canal por el que prefiere que lo contacten. */
  preferredChannel: string
  /** Qué gatilla que pase de "mirando" a "quiero verla". */
  decisionTriggers: string[]
}

const STR_ARR = (v: unknown, max = 6): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, max) : []

/**
 * Valida/normaliza un objeto crudo (de la IA) a un EmpathyAvatar. Devuelve null
 * si le faltan piezas esenciales (el caller reintenta con otro modelo o cae al
 * fallback determinístico). Nunca tira.
 */
export function coerceEmpathyAvatar(raw: unknown, fallbackId: string): EmpathyAvatar | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const em = (o.empathyMap ?? {}) as Record<string, unknown>

  const says = STR_ARR(em.says), thinks = STR_ARR(em.thinks), feels = STR_ARR(em.feels), does = STR_ARR(em.does)
  const shortLabel = typeof o.shortLabel === 'string' ? o.shortLabel : ''
  // Esencial: label + al menos algo de mapa de empatía.
  if (!shortLabel || (says.length + thinks.length + feels.length + does.length) === 0) return null

  const tone = o.communicationTone
  const communicationTone = (['aspiracional','práctico','familiar','urgente','sofisticado','cálido'] as const)
    .includes(tone as never) ? (tone as EmpathyAvatar['communicationTone']) : 'cálido'
  const cue = o.visualCue
  const visualCue = (['persona_joven','pareja_joven','familia','profesional_solo','pareja_senior','inversor'] as const)
    .includes(cue as never) ? (cue as EmpathyAvatar['visualCue']) : 'profesional_solo'

  return {
    id: typeof o.id === 'string' && o.id ? o.id : fallbackId,
    shortLabel,
    ageRange: typeof o.ageRange === 'string' ? o.ageRange : '',
    occupation: typeof o.occupation === 'string' ? o.occupation : '',
    lifeMoment: typeof o.lifeMoment === 'string' ? o.lifeMoment : '',
    motivation: typeof o.motivation === 'string' ? o.motivation : '',
    concerns: STR_ARR(o.concerns),
    communicationTone,
    visualCue,
    hooks: STR_ARR(o.hooks),
    reasoning: typeof o.reasoning === 'string' ? o.reasoning : '',
    empathyMap: { says, thinks, feels, does },
    pains: STR_ARR(o.pains),
    gains: STR_ARR(o.gains),
    jobsToBeDone: STR_ARR(o.jobsToBeDone),
    objections: STR_ARR(o.objections),
    preferredChannel: typeof o.preferredChannel === 'string' ? o.preferredChannel : 'WhatsApp',
    decisionTriggers: STR_ARR(o.decisionTriggers),
  }
}
