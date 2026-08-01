/**
 * Qué se le ENTREGA al cliente que se registra en la landing.
 *
 * Tres candidatos a "entregable" conviven en la propiedad, en este orden de
 * preferencia:
 *  1. `video_recorrido_url` — video que recorre la propiedad por dentro.
 *  2. `tour_3d_url` — recorrido virtual navegable (iframe).
 *  3. `video_url` / `video_file_url` — el video "de marketing" de la propiedad
 *     (el mismo que se ve en el hero de la landing). Cuenta como entregable
 *     SOLO si no hay recorrido dedicado ni tour — decisión del dueño,
 *     2026-08-02: "si la propiedad no tiene video recorrido, pero tiene
 *     video, [...] entonces no es necesario el recorrido". Entre los dos,
 *     preferimos el archivo subido (`video_file_url`) sobre el enlace externo
 *     (`video_url`) — mismo criterio que ya usaba `HeroLuxury` para elegir qué
 *     reproducir.
 * Si hay dos o más candidatos disponibles, elige el asesor (`deliver_media`);
 * si la elección guardada ya no está disponible (se borró ese medio), se cae
 * al orden de preferencia. Si no hay NINGUNO, se entregan las fotos completas
 * (el flujo NUNCA se rompe por falta de media).
 */
export type DeliverKind = 'video_recorrido' | 'tour_3d' | 'video_propio' | 'fotos'

export interface DeliverMedia {
  kind: DeliverKind
  url: string | null
}

interface MediaFields {
  video_recorrido_url?: string | null
  tour_3d_url?: string | null
  video_url?: string | null
  video_file_url?: string | null
  deliver_media?: string | null
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

/** Orden de preferencia por defecto (sin elección del asesor, o elección ya inválida). */
const PREFERENCE_ORDER: readonly Exclude<DeliverKind, 'fotos'>[] = ['video_recorrido', 'tour_3d', 'video_propio']

/** Candidatos a entregable REALMENTE disponibles en esta propiedad. */
function available(p: MediaFields): Partial<Record<Exclude<DeliverKind, 'fotos'>, string>> {
  const out: Partial<Record<Exclude<DeliverKind, 'fotos'>, string>> = {}
  const video = clean(p.video_recorrido_url)
  const tour = clean(p.tour_3d_url)
  const propio = clean(p.video_file_url) ?? clean(p.video_url)
  if (video) out.video_recorrido = video
  if (tour) out.tour_3d = tour
  if (propio) out.video_propio = propio
  return out
}

export function resolveDeliverMedia(p: MediaFields): DeliverMedia {
  const opts = available(p)
  // Elección explícita del asesor, solo si ese medio SIGUE disponible — si se
  // borró después de elegido, no puede quedar vacío, cae al orden de preferencia.
  const chosen = p.deliver_media as Exclude<DeliverKind, 'fotos'> | null | undefined
  if (chosen && opts[chosen]) return { kind: chosen, url: opts[chosen]! }
  for (const kind of PREFERENCE_ORDER) {
    if (opts[kind]) return { kind, url: opts[kind]! }
  }
  return { kind: 'fotos', url: null }
}

/** Solo hay que preguntarle al asesor cuando hay DOS O MÁS candidatos disponibles. */
export function needsDeliveryChoice(p: MediaFields): boolean {
  return Object.keys(available(p)).length >= 2
}
