/**
 * Textos de la página de gracias (`/v/<token>`), resueltos.
 *
 * UNA sola fuente para los dos consumidores: la página real y la vista previa
 * del editor. Si los defaults vivieran en el JSX de la página, el editor
 * mostraría una cosa y el cliente vería otra — el error clásico de un editor
 * "WYSIWYG" que no es lo que se ve.
 *
 * Funciones PURAS: sin red, sin Supabase, testeables solas.
 */
import type { ThanksContent } from './schema'

/** Lo que la página necesita saber de la propiedad para armar sus textos. */
export interface ThanksSubject {
  address: string
  /** Qué se le entrega. `'fotos'` cambia el titular: sin recorrido no prometemos uno. */
  mediaKind: 'video_recorrido' | 'tour_3d' | 'video_propio' | 'fotos'
}

export interface ResolvedThanks {
  greeting: string
  headline: string
  intro: string
  scheduleTitle: string
  scheduleText: string
}

/**
 * Defaults — son EXACTAMENTE los textos que la página tuvo siempre escritos a
 * mano. Cambiarlos acá los cambia para toda propiedad que no los haya editado.
 */
export function defaultThanks(subject: ThanksSubject): ResolvedThanks {
  return {
    greeting: 'Hola {nombre}',
    headline: subject.mediaKind === 'fotos' ? '{direccion}, en detalle' : 'Conocé {direccion} por dentro',
    intro: '',
    scheduleTitle: '¿Querés visitarla?',
    scheduleText: 'Elegí el día y el momento que te queda cómodo. Nuestro equipo te contacta para confirmarla.',
  }
}

/** Reemplaza `{nombre}` y `{direccion}`. Un token desconocido se deja tal cual (no rompe el texto). */
export function fillTokens(text: string, vars: { nombre: string; direccion: string }): string {
  return text.replace(/\{nombre\}/g, vars.nombre).replace(/\{direccion\}/g, vars.direccion)
}

/**
 * Mezcla lo editado con los defaults. Un campo vacío o en blanco cuenta como
 * "no editado" y cae al default: si el asesor borra el titular, la página no
 * queda sin titular.
 */
export function resolveThanks(subject: ThanksSubject, edited?: ThanksContent | null): ResolvedThanks {
  const base = defaultThanks(subject)
  if (!edited) return base
  const pick = (v: string | undefined, fallback: string): string => {
    const t = (v ?? '').trim()
    return t.length > 0 ? t : fallback
  }
  return {
    greeting: pick(edited.greeting, base.greeting),
    headline: pick(edited.headline, base.headline),
    // `intro` es la excepción: su default es vacío, así que "vacío" es un valor
    // válido y no hay a qué caer.
    intro: (edited.intro ?? '').trim(),
    scheduleTitle: pick(edited.scheduleTitle, base.scheduleTitle),
    scheduleText: pick(edited.scheduleText, base.scheduleText),
  }
}

/** Los textos ya con los tokens reemplazados — lo que se pinta en pantalla. */
export function renderThanks(
  subject: ThanksSubject,
  edited: ThanksContent | null | undefined,
  vars: { nombre: string; direccion: string },
): ResolvedThanks {
  const r = resolveThanks(subject, edited)
  return {
    greeting: fillTokens(r.greeting, vars),
    headline: fillTokens(r.headline, vars),
    intro: fillTokens(r.intro, vars),
    scheduleTitle: fillTokens(r.scheduleTitle, vars),
    scheduleText: fillTokens(r.scheduleText, vars),
  }
}
