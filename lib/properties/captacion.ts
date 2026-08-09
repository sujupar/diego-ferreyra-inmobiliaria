/**
 * Reglas de CAPTACIÓN de una propiedad — módulo puro.
 *
 * Desde 2026-08-09 la documentación legal dejó de ser obligatoria para captar
 * (pedido del dueño). Lo único que hace falta es que haya al menos una foto y
 * que nadie haya dicho que no.
 *
 * Un rechazo (del abogado, o el descarte) es un "no" ACTIVO y sigue frenando.
 * La ausencia de documentación es una ausencia, no un no.
 *
 * ── Por qué el circuito legal salió de `properties.status` ──────────────────
 * `status` describe UNA sola cosa: en qué punto de la captación está la
 * propiedad. Mientras el circuito legal vivía ahí ("pending_review"), mandarla
 * al abogado apagaba todo lo demás al mismo tiempo: la pestaña Difusión, la
 * landing pública (`app/p/[slug]` filtra por status='approved'), las consultas
 * entrantes (`/api/leads` responde 410) y el agendamiento del recorrido. Con la
 * regla nueva —donde una propiedad se capta antes de tener papeles— eso pasaba
 * de ser raro a ser el caso normal: cualquiera que mandara la documentación de
 * una propiedad ya publicada la sacaba del aire, con tráfico pago apuntándole.
 *
 * El carril legal es ahora `legal_status` (pending/approved/rejected) + la marca
 * `legal_submitted_at` ("se lo mandé al abogado"). Los dos ejes conviven sin
 * pisarse: se puede estar captada Y con la documentación en revisión.
 */

/* ------------------------------- captación -------------------------------- */

export type MotivoSinCaptar =
  /** Lo único que bloquea de verdad hoy. */
  | 'sin-fotos'
  | 'descartada'
  | 'rechazada'
  | 'documentacion-rechazada'

export interface EntradaCaptacion {
  status: string | null | undefined
  legalStatus: string | null | undefined
  photosCount: number
}

export interface Captacion {
  captada: boolean
  motivo: MotivoSinCaptar | null
}

/**
 * ¿Esta propiedad está captada?
 *
 * El orden importa: primero los "no" explícitos (que son decisiones de una
 * persona), después la única condición material que queda.
 */
export function evaluarCaptacion(i: EntradaCaptacion): Captacion {
  if (i.status === 'descartada') return { captada: false, motivo: 'descartada' }
  if (i.status === 'rejected') return { captada: false, motivo: 'rechazada' }
  if (i.legalStatus === 'rejected') return { captada: false, motivo: 'documentacion-rechazada' }
  if (!(i.photosCount > 0)) return { captada: false, motivo: 'sin-fotos' }
  return { captada: true, motivo: null }
}

/**
 * ¿Hay que escribir `status='approved'`?
 *
 * Solo AVANZA. Nunca degrada: si la propiedad ya está captada y pierde una
 * condición (le borran las fotos, el abogado rechaza después), esta función
 * devuelve false y el `status` guardado se queda donde está. Degradar sola una
 * propiedad viva es exactamente lo que apagaba la landing y los portales.
 */
export function debeAvanzarACaptada(i: EntradaCaptacion): boolean {
  return evaluarCaptacion(i).captada && i.status !== 'approved'
}

/* ------------------------------ carril legal ------------------------------ */

export type EstadoLegal = 'sin-enviar' | 'en-revision' | 'aprobada' | 'rechazada'

export interface EntradaLegal {
  legalStatus: string | null | undefined
  /** `properties.legal_submitted_at`. Null = nunca se mandó al abogado. */
  legalSubmittedAt: string | null | undefined
}

export function estadoLegal(i: EntradaLegal): EstadoLegal {
  if (i.legalStatus === 'approved') return 'aprobada'
  if (i.legalStatus === 'rejected') return 'rechazada'
  return i.legalSubmittedAt ? 'en-revision' : 'sin-enviar'
}

/**
 * ¿El abogado puede aprobar/rechazar la documentación de esta propiedad?
 *
 * NO mira `status`: una propiedad captada y publicada también se revisa. Ese
 * acoplamiento era el que dejaba al abogado sin poder cerrar su revisión en
 * cuanto alguien subía una foto.
 */
export function puedeRevisarDocumentacion(i: EntradaLegal & { role: string | null | undefined }): boolean {
  return i.role === 'abogado' && estadoLegal(i) === 'en-revision'
}

/* ------------------------------- etiquetas -------------------------------- */

export interface EtiquetaEstado { label: string; color: string }

/**
 * Badge del encabezado de la ficha.
 *
 * `pending_docs` decía "Pendiente Documentos" — con la regla nueva eso es
 * mentira: los documentos ya no son lo que falta. El badge se deriva de la
 * regla, no del literal guardado en la columna.
 */
export function etiquetaDeCaptacion(i: EntradaCaptacion): EtiquetaEstado {
  if (i.status === 'descartada') return { label: 'Descartada', color: 'bg-slate-500' }
  if (i.status === 'rejected') return { label: 'Rechazada', color: 'bg-red-500' }
  if (i.status === 'approved') return { label: 'Captación Completa', color: 'bg-green-500' }
  if (i.status === 'active') return { label: 'Activa', color: 'bg-emerald-600' }
  if (i.legalStatus === 'rejected') return { label: 'Documentación Rechazada', color: 'bg-red-500' }
  if (!(i.photosCount > 0)) return { label: 'Pendiente Fotos', color: 'bg-orange-500' }
  // Tiene fotos y nadie dijo que no, pero la columna todavía no se actualizó
  // (el avance corre al confirmar la subida). Dura lo que tarda ese guardado.
  return { label: 'En captación', color: 'bg-amber-500' }
}
