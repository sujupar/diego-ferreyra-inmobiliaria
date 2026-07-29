/**
 * Qué se le ENTREGA al cliente que se registra en la landing.
 *
 * Tres cosas distintas conviven en la propiedad:
 *  - `video_url` / `video_file_url`: el video que se ve en la landing pública.
 *  - `tour_3d_url`: recorrido virtual navegable (iframe).
 *  - `video_recorrido_url`: video que recorre la propiedad por dentro.
 * Los dos últimos son los "entregables". Si están los dos, elige el asesor
 * (`deliver_media`); si hay uno solo, se usa ese; si no hay ninguno, se entregan
 * las fotos completas (el flujo NUNCA se rompe por falta de media).
 */
export type DeliverKind = 'video_recorrido' | 'tour_3d' | 'fotos'

export interface DeliverMedia {
  kind: DeliverKind
  url: string | null
}

interface MediaFields {
  video_recorrido_url?: string | null
  tour_3d_url?: string | null
  deliver_media?: string | null
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

export function resolveDeliverMedia(p: MediaFields): DeliverMedia {
  const video = clean(p.video_recorrido_url)
  const tour = clean(p.tour_3d_url)
  if (video && tour) {
    // Con ambos manda la elección del asesor; sin elección, el video recorrido.
    return p.deliver_media === 'tour_3d'
      ? { kind: 'tour_3d', url: tour }
      : { kind: 'video_recorrido', url: video }
  }
  if (video) return { kind: 'video_recorrido', url: video }
  if (tour) return { kind: 'tour_3d', url: tour }
  return { kind: 'fotos', url: null }
}

/** Solo hay que preguntarle al asesor cuando la propiedad tiene LAS DOS. */
export function needsDeliveryChoice(p: MediaFields): boolean {
  return Boolean(clean(p.video_recorrido_url) && clean(p.tour_3d_url))
}
