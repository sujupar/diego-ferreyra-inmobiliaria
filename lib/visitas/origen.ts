/**
 * Catálogo ÚNICO de orígenes de una visita (spec §4.3) y su derivación desde el
 * registro del comprador (`property_leads`).
 *
 * Es el mismo que el CHECK `property_visits_origin_check` (migración
 * 20261010000001): se tocan JUNTOS. `origen.test.ts` lee la migración y falla si
 * difieren — si la app escribe un valor que la base no acepta, Postgres lo
 * rechaza con 23514 y la visita no se agenda.
 *
 * Módulo puro y seguro para el navegador (lo usa la ventana de agendar).
 */
export const ORIGENES_VISITA = ['portal', 'publicidad_meta', 'publicidad_paga', 'cartel', 'otro'] as const
export type OrigenVisita = (typeof ORIGENES_VISITA)[number]

export interface InfoOrigen {
  etiqueta: string
  ayuda: string
  /** Si la ventana pide escribir "cuál". */
  detalle: 'obligatorio' | 'opcional' | 'no'
}

export const ORIGEN_INFO: Record<OrigenVisita, InfoOrigen> = {
  portal: { etiqueta: 'Consulta de portal', ayuda: 'Zonaprop, Argenprop o MercadoLibre', detalle: 'no' },
  publicidad_meta: { etiqueta: 'Publicidad de Meta', ayuda: 'Facebook o Instagram pago', detalle: 'no' },
  publicidad_paga: { etiqueta: 'Otra publicidad paga', ayuda: 'Google u otro anuncio pago', detalle: 'opcional' },
  cartel: { etiqueta: 'Cartel en la propiedad', ayuda: 'Llamó o escribió por el cartel', detalle: 'no' },
  otro: { etiqueta: 'Otro', ayuda: 'Escribís cuál', detalle: 'obligatorio' },
}

export const PORTAL_ETIQUETA: Record<string, string> = {
  zonaprop: 'Zonaprop',
  argenprop: 'Argenprop',
  mercadolibre: 'MercadoLibre',
}

export function esOrigenVisita(v: unknown): v is OrigenVisita {
  return typeof v === 'string' && (ORIGENES_VISITA as readonly string[]).includes(v)
}

export interface LeadParaOrigen {
  source: string | null
  utm: unknown
}

export interface OrigenDerivado {
  origen: OrigenVisita
  detalle: string | null
}

const FUENTES_META = new Set(['meta', 'facebook', 'fb', 'instagram', 'ig'])
const MEDIOS_PAGOS = new Set(['cpc', 'ppc', 'cpm', 'paid', 'paid_social', 'paid_search', 'display'])
const LARGO_MAXIMO_DETALLE = 120

function utmTexto(utm: unknown, clave: string): string | null {
  if (!utm || typeof utm !== 'object') return null
  const v = (utm as Record<string, unknown>)[clave]
  return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null
}

/**
 * Para las visitas que se crean SOLAS (agente de WhatsApp, link del recorrido):
 * el origen sale de cómo entró la persona. Las reglas de UTM son las de
 * `lib/marketing/meta-campaign-builder.ts` (utm_source=meta, utm_medium=paid_social)
 * y `lib/social/reels/enlace.ts` (utm_medium=reel, que es orgánico).
 */
export function origenDesdeLead(lead: LeadParaOrigen): OrigenDerivado {
  const source = (lead.source ?? '').trim().toLowerCase()
  if (source.startsWith('portal:')) return { origen: 'portal', detalle: source.slice('portal:'.length) || null }
  // Los formatos que acepta POST /api/leads (`meta_form`, `portal_<portal>`, ver el
  // comentario de property_leads.source en 20260514000000). Hoy no hay filas así en la
  // base, pero si llegan no tienen que caer en "otro".
  if (source === 'meta_form') return { origen: 'publicidad_meta', detalle: null }
  if (source.startsWith('portal_')) return { origen: 'portal', detalle: source.slice('portal_'.length) || null }
  if (source.startsWith('visita:')) {
    const o = source.slice('visita:'.length)
    if (esOrigenVisita(o)) return { origen: o, detalle: null }
  }
  if (source.startsWith('prueba')) return { origen: 'otro', detalle: 'Prueba' }
  if (source === 'landing' || source === '') {
    const fuente = utmTexto(lead.utm, 'utm_source')
    const medio = utmTexto(lead.utm, 'utm_medium')
    if (medio === 'reel') return { origen: 'otro', detalle: 'Reel de Instagram' }
    if (utmTexto(lead.utm, 'fbclid') || (fuente && FUENTES_META.has(fuente))) return { origen: 'publicidad_meta', detalle: null }
    if (utmTexto(lead.utm, 'gclid') || fuente === 'google') return { origen: 'publicidad_paga', detalle: 'Google' }
    if (medio && MEDIOS_PAGOS.has(medio)) return { origen: 'publicidad_paga', detalle: fuente }
    return { origen: 'otro', detalle: 'Landing' }
  }
  return { origen: 'otro', detalle: null }
}

/**
 * Cómo se MUESTRA un `property_leads.source` de los que escribe este módulo
 * (`portal:<portal>` y `visita:<origen>`, ver fuenteDelComprador). El Inbox tenía una
 * tabla fija con los formatos viejos (`portal_zonaprop`) y mostraba estos crudos.
 * `null` si no lo reconoce: quien llama decide el respaldo (el texto crudo).
 */
export function etiquetaDeFuente(source: string): string | null {
  const s = source.trim().toLowerCase()
  if (s.startsWith('portal:')) {
    const portal = s.slice('portal:'.length)
    // Object.hasOwn: el source viene de la base y "portal:constructor" leería
    // Object.prototype.constructor (una función) en vez de "no lo conozco".
    return Object.hasOwn(PORTAL_ETIQUETA, portal) ? PORTAL_ETIQUETA[portal] : null
  }
  if (s.startsWith('visita:')) {
    const o = s.slice('visita:'.length)
    return esOrigenVisita(o) ? `Visita · ${ORIGEN_INFO[o].etiqueta}` : null
  }
  return null
}

/** `property_leads.source` de un comprador creado desde la ventana de agendar. */
export function fuenteDelComprador(origen: OrigenVisita, portal?: string | null): string {
  if (origen === 'portal' && portal) return `portal:${portal}`
  return `visita:${origen}`
}

export function validarDetalleDeOrigen(
  origen: OrigenVisita,
  texto: string | null | undefined,
  portal?: string | null,
): { ok: true; detalle: string | null } | { ok: false; error: string } {
  if (origen === 'portal') return { ok: true, detalle: portal ?? null }
  const limpio = (texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, LARGO_MAXIMO_DETALLE)
  const regla = ORIGEN_INFO[origen].detalle
  if (regla === 'obligatorio' && limpio.length < 2) return { ok: false, error: 'Escribí de dónde vino la visita' }
  if (regla === 'no') return { ok: true, detalle: null }
  return { ok: true, detalle: limpio || null }
}
