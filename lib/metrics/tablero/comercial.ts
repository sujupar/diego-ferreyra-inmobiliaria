/**
 * Franja "Comercial" del Tablero. Módulo puro.
 *
 * El embudo (solicitudes → captadas) sale de `personas.ts`, la misma lógica del
 * panel validado: acá solo se agregan las piezas que el panel no tenía.
 */

import { dia, type DealRow, type HistoriaRow, type Persona } from '../panel/personas'
import { enRango, type Rango } from '../panel/rango'

// ---------------------------------------------------------------------------
// Tiempo de solicitud a agendada.
// ---------------------------------------------------------------------------

const DIA_MS = 86_400_000
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DIA_MS)

export function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Mediana de días entre la solicitud y la agenda, de las personas de tasación
 * AGENDADAS en el período. Fuera las del sistema viejo (su fecha de agenda es la
 * de la solicitud, daría 0 días falsos).
 */
export function medianaDiasAgenda(personas: Persona[], r: Rango): { dias: number | null; n: number } {
  const xs: number[] = []
  for (const p of personas) {
    if (p.embudo !== 'tasacion' || p.historico) continue
    const a = p.fechas.agendada, s = p.fechas.solicitud
    if (!a || !s || !enRango(a, r)) continue
    xs.push(diasEntre(s, a))
  }
  return { dias: mediana(xs), n: xs.length }
}

// ---------------------------------------------------------------------------
// Solicitudes sin agendar hace más de 48 h.
// ---------------------------------------------------------------------------

export interface SinAgendar {
  dealId: string
  nombre: string | null
  solicitud: string
  /** Horas desde la solicitud (redondeado). */
  horas: number
}

export const HORAS_SIN_AGENDAR = 48

/**
 * Personas de tasación cuya solicitud cayó en el período, que no llegaron a
 * agendarse, cuyo proceso sigue en "Solicitud" (no descartado) y que pidieron
 * hace más de 48 h. Las más viejas primero.
 */
export function sinAgendar(
  personas: Persona[],
  deals: Map<string, Pick<DealRow, 'id' | 'stage' | 'created_at' | 'contact_id'>>,
  nombres: Map<string, string | null>,
  r: Rango,
  ahora: Date,
): SinAgendar[] {
  const out: SinAgendar[] = []
  for (const p of personas) {
    if (p.embudo !== 'tasacion' || p.fechas.agendada || !enRango(p.fechas.solicitud, r)) continue
    const d = deals.get(p.dealId)
    if (!d || d.stage !== 'request') continue
    const horas = Math.floor((ahora.getTime() - Date.parse(d.created_at)) / 3_600_000)
    if (horas < HORAS_SIN_AGENDAR) continue
    out.push({ dealId: d.id, nombre: d.contact_id ? nombres.get(d.contact_id) ?? null : null, solicitud: p.fechas.solicitud!, horas })
  }
  return out.sort((a, b) => b.horas - a.horas)
}

// ---------------------------------------------------------------------------
// Referidos (procesos con origin = 'referido').
// ---------------------------------------------------------------------------

export interface Referidos {
  /** Procesos referidos creados en el período. */
  nuevos: number
  agendados: number
  realizados: number
  captados: number
}

/**
 * Eventos del período de los procesos referidos: cada proceso cuenta una vez por
 * etapa, en la fecha en que entró por primera vez (historial de etapas).
 */
export function referidos(deals: DealRow[], historia: HistoriaRow[], r: Rango, pruebas: Set<string>): Referidos {
  const ids = new Set(deals.filter(d => d.origin === 'referido' && !(d.contact_id && pruebas.has(d.contact_id))).map(d => d.id))
  const primera = new Map<string, string>()
  for (const h of historia) {
    if (!ids.has(h.deal_id)) continue
    const k = `${h.deal_id}|${h.to_stage}`
    const prev = primera.get(k)
    if (!prev || h.changed_at < prev) primera.set(k, h.changed_at)
  }
  const cuenta = (etapas: string[]) => {
    let n = 0
    for (const id of ids) {
      const fechas = etapas.map(e => primera.get(`${id}|${e}`)).filter((x): x is string => !!x).sort()
      if (fechas.length && enRango(dia(fechas[0]), r)) n++
    }
    return n
  }
  return {
    nuevos: deals.filter(d => ids.has(d.id) && enRango(dia(d.created_at), r)).length,
    agendados: cuenta(['scheduled']),
    realizados: cuenta(['visited']),
    captados: cuenta(['captured']),
  }
}

// ---------------------------------------------------------------------------
// Registros de las páginas de propiedades (property_leads).
// ---------------------------------------------------------------------------

export type OrigenRegistro = 'cartel' | 'reel' | 'meta' | 'directo'

export const ETIQUETA_ORIGEN: Record<OrigenRegistro, string> = {
  cartel: 'Cartel en la visita',
  reel: 'Reel de Instagram',
  meta: 'Anuncio de Meta',
  directo: 'Directo',
}

export interface LeadRow {
  property_id: string | null
  source: string | null
  utm: Record<string, unknown> | null
  created_at: string
  suspected_bot: boolean | null
  deleted_at: string | null
  /** Solo para reconocer a la misma persona; nunca se muestra. */
  email?: string | null
  phone?: string | null
}

const low = (x: unknown) => (typeof x === 'string' ? x.toLowerCase() : '')

/** Clave de la persona: email normalizado, o los últimos 10 dígitos del teléfono. null si no hay ninguno. */
export function clavePersona(l: Pick<LeadRow, 'email' | 'phone'>): string | null {
  const e = (l.email ?? '').trim().toLowerCase()
  if (e) return 'e:' + e
  const t = (l.phone ?? '').replace(/\D/g, '').slice(-10)
  return t.length === 10 ? 't:' + t : null
}

/**
 * De dónde vino un registro, con el nombre del anuncio cuando el enlace lo trae
 * (`utm_content`). Meta deja literal `{{ad.id}}` cuando el anuncio no completa el
 * parámetro: eso es "sin dato del anuncio", no un nombre.
 */
export function detalleOrigen(source: string | null, utm: Record<string, unknown> | null): string {
  const o = origenRegistro(source, utm)
  if (o !== 'meta') return ETIQUETA_ORIGEN[o]
  const c = typeof utm?.utm_content === 'string' ? utm.utm_content.trim() : ''
  return c && !c.includes('{{') ? `Anuncio «${c.slice(0, 80)}»` : 'Anuncio (sin dato del anuncio)'
}

/**
 * De dónde vino un registro. Orden: el cartel manda (se carga en la visita);
 * después el reel (un reel con fbclid sigue siendo reel: el fbclid lo pone
 * Instagram a cualquier enlace); después Meta (fbclid o utm de anuncio pago);
 * si no, directo.
 */
export function origenRegistro(source: string | null, utm: Record<string, unknown> | null): OrigenRegistro {
  if (low(source).startsWith('visita:')) return 'cartel'
  const u = utm ?? {}
  if (low(u.utm_medium) === 'reel' || (low(u.utm_source) === 'instagram' && low(u.utm_content).startsWith('reel'))) return 'reel'
  if (u.fbclid || ['meta', 'fb', 'facebook', 'ig'].includes(low(u.utm_source)) || low(u.utm_medium).startsWith('paid')) return 'meta'
  return 'directo'
}

export interface RegistrosPropiedad {
  propiedadId: string
  direccion: string | null
  total: number
  /** Personas distintas (mismo email o teléfono = una persona). */
  personas: number
  porOrigen: Record<OrigenRegistro, number>
  /** De dónde vinieron, con el nombre del anuncio cuando se sabe. De mayor a menor. */
  detalle: { etiqueta: string; cantidad: number }[]
}

const vacio = (): Record<OrigenRegistro, number> => ({ cartel: 0, reel: 0, meta: 0, directo: 0 })

/** Registros válidos (sin robots ni borrados) del período, por propiedad. */
export function registrosPorPropiedad(leads: LeadRow[], r: Rango, direcciones: Map<string, string | null>) {
  const M = new Map<string, RegistrosPropiedad & { _personas: Set<string>; _detalle: Map<string, number> }>()
  const totalPorOrigen = vacio()
  const todas = new Set<string>()
  let total = 0
  for (const l of leads) {
    if (l.suspected_bot || l.deleted_at || !l.property_id || !enRango(dia(l.created_at), r)) continue
    const o = origenRegistro(l.source, l.utm)
    const x = M.get(l.property_id) ?? { propiedadId: l.property_id, direccion: direcciones.get(l.property_id) ?? null, total: 0, personas: 0, porOrigen: vacio(), detalle: [], _personas: new Set<string>(), _detalle: new Map<string, number>() }
    x.total++
    x.porOrigen[o]++
    // Sin email ni teléfono no se puede saber si es la misma persona: cuenta como una distinta.
    const k = clavePersona(l) ?? `sin:${total}`
    x._personas.add(k)
    todas.add(k)
    const et = detalleOrigen(l.source, l.utm)
    x._detalle.set(et, (x._detalle.get(et) ?? 0) + 1)
    M.set(l.property_id, x)
    totalPorOrigen[o]++
    total++
  }
  const porPropiedad: RegistrosPropiedad[] = [...M.values()].map(({ _personas, _detalle, ...x }) => ({
    ...x,
    personas: _personas.size,
    detalle: [..._detalle.entries()].map(([etiqueta, cantidad]) => ({ etiqueta, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
  }))
  return { total, personas: todas.size, porOrigen: totalPorOrigen, porPropiedad: porPropiedad.sort((a, b) => b.total - a.total) }
}

/** Registros del período que vinieron de Meta, por propiedad (para el costo por registro de sus campañas). */
export function registrosMetaPorPropiedad(leads: LeadRow[], r: Rango): Map<string, number> {
  const M = new Map<string, number>()
  for (const l of leads) {
    if (l.suspected_bot || l.deleted_at || !l.property_id || !enRango(dia(l.created_at), r)) continue
    if (origenRegistro(l.source, l.utm) !== 'meta') continue
    M.set(l.property_id, (M.get(l.property_id) ?? 0) + 1)
  }
  return M
}

// ---------------------------------------------------------------------------
// Consultas de portales.
// ---------------------------------------------------------------------------

export interface ConsultaRow { portal: string | null; received_at: string | null; created_at: string }

export const ETIQUETA_PORTAL: Record<string, string> = { zonaprop: 'Zonaprop', argenprop: 'Argenprop', mercadolibre: 'MercadoLibre' }

/** Consultas por portal, por fecha de recepción (o de carga si no la tiene), hora Argentina. */
export function consultasPorPortal(filas: ConsultaRow[], r: Rango): { total: number; porPortal: { portal: string; cantidad: number }[] } {
  const M = new Map<string, number>()
  let total = 0
  for (const c of filas) {
    if (!enRango(dia(c.received_at ?? c.created_at), r)) continue
    const p = c.portal ?? 'otro'
    M.set(p, (M.get(p) ?? 0) + 1)
    total++
  }
  return { total, porPortal: [...M.entries()].map(([portal, cantidad]) => ({ portal, cantidad })).sort((a, b) => b.cantidad - a.cantidad) }
}
