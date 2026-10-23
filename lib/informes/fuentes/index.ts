import 'server-only'
/**
 * Las fuentes automáticas del informe: UNA llamada por fuente (regla dura de Netlify: nunca
 * encadenar varias integraciones lentas en un request). La ruta `/api/informes/[id]/fuentes/[fuente]`
 * y el cron piden de a una. Ninguna lanza: devuelven `ok`, `sin_datos` o `error`.
 */
import { mlFetch } from '@/lib/portals/mercadolibre/client'
import { instagramFetch } from '@/lib/integrations/instagram/client'
import { todasLasVisitas } from '@/lib/visitas/datos'
import { sb } from '../sb'
import { idDeAvisoMercadoLibre } from '../aviso-ml'
import type { DatosPorFuente, FuenteGuardada, NombreFuente } from '../tipos'
import { conError, instantesDelPeriodo, ok, sinDatos, sinLanzar, type ContextoFuente } from './comun'
import { contactosDeMercadoLibre, contarConsultas, fichaDeVisitas, reelDeInsights, sumarMeta, visitasDeMercadoLibre, vistasDelTelefonoEnPeriodo } from './parsers'

const GRAPH = 'https://graph.facebook.com/v21.0'
const TIMEOUT_MS = 8_000

async function consultas(c: ContextoFuente): Promise<FuenteGuardada<DatosPorFuente['consultas']>> {
  const { desdeISO, hastaISO } = instantesDelPeriodo(c)
  // received_at puede venir vacío (el portal no trajo fecha): se usa created_at, como en las métricas.
  // La consulta se GUARDA cuando el cron lee el mail (created_at), que puede ser después de recibida:
  // una recibida el 15 a las 23:55 entra el 16. Por eso la base se pide con 7 días de margen a cada
  // lado y el período se recorta abajo por la fecha de recepción.
  const margen = 7 * 86_400_000
  const q = await sb().from('portal_inquiries').select('portal, lead_name, lead_email, received_at, created_at')
    .eq('property_id', c.propertyId)
    .gte('created_at', new Date(Date.parse(desdeISO) - margen).toISOString())
    .lt('created_at', new Date(Date.parse(hastaISO) + margen).toISOString())
  if (q.error) throw new Error(`consultas: ${q.error.message}`)
  const enRango = (q.data ?? []).filter(r => {
    const t = Date.parse(String(r.received_at ?? r.created_at))
    return t >= Date.parse(desdeISO) && t < Date.parse(hastaISO)
  })
  const l = await sb().from('property_leads').select('name, email').eq('property_id', c.propertyId)
    .eq('source', 'landing').is('deleted_at', null).gte('created_at', desdeISO).lt('created_at', hastaISO)
  if (l.error) throw new Error(`registros: ${l.error.message}`)
  return ok(c.ahora, contarConsultas(enRango as never, (l.data ?? []) as never))
}

async function visitas(c: ContextoFuente): Promise<FuenteGuardada<DatosPorFuente['visitas']>> {
  const { desdeISO, hastaISO } = instantesDelPeriodo(c)
  const { filas, truncado } = await todasLasVisitas({ alcance: { tipo: 'todo' }, propiedadId: c.propertyId, desde: desdeISO, hasta: new Date(Date.parse(hastaISO) - 1).toISOString() })
  if (truncado) throw new Error('demasiadas visitas para un período: no se puede contar con certeza')
  return ok(c.ahora, fichaDeVisitas(filas))
}

async function reserva(c: ContextoFuente): Promise<FuenteGuardada<DatosPorFuente['reserva']>> {
  const { desdeISO, hastaISO } = instantesDelPeriodo(c)
  const r = await sb().from('property_status_events').select('created_at').eq('property_id', c.propertyId)
    .eq('to_status', 'reservada').gte('created_at', desdeISO).lt('created_at', hastaISO).order('created_at').limit(1)
  if (r.error) throw new Error(`reserva: ${r.error.message}`)
  const primera = r.data?.[0]?.created_at
  return ok(c.ahora, { reservada: !!primera, fecha: primera ? String(primera) : null })
}

/** El aviso de ML: el que cargó Paula, el que publicó la plataforma o el del mapa de avisos. */
async function avisoDeMercadoLibre(c: ContextoFuente): Promise<string | null> {
  const manual = idDeAvisoMercadoLibre(c.avisoMercadoLibre)
  if (manual) return manual
  const l = await sb().from('property_listings').select('external_id').eq('property_id', c.propertyId)
    .eq('portal', 'mercadolibre').not('external_id', 'is', null).maybeSingle()
  if (l.error) throw new Error(`aviso de MercadoLibre: ${l.error.message}`)
  const publicado = idDeAvisoMercadoLibre(l.data?.external_id ? String(l.data.external_id) : null)
  if (publicado) return publicado
  const m = await sb().from('portal_property_map').select('external_code, external_url').eq('property_id', c.propertyId)
    .eq('portal', 'mercadolibre').limit(5)
  if (m.error) throw new Error(`mapa de avisos: ${m.error.message}`)
  for (const fila of m.data ?? []) {
    const id = idDeAvisoMercadoLibre(String(fila.external_code ?? '')) ?? idDeAvisoMercadoLibre(String(fila.external_url ?? ''))
    if (id) return id
  }
  return null
}

/**
 * Interesados del aviso en el período, todas las páginas (de a 50, tope 10 páginas). OJO: ML limita mucho este
 * endpoint (429 "quota exceeded" con unos pocos pedidos seguidos, medido 2026-10-22): un informe pide UN aviso.
 */
async function leadsDelPeriodo(usuario: number, avisoId: string, c: ContextoFuente): Promise<unknown[]> {
  const paginas: unknown[] = []
  for (let offset = 0, i = 0; i < 10; i++, offset += 50) {
    const p = await mlFetch<{ paging?: { total?: number }; results?: unknown[] }>(
      `/vis/users/${usuario}/leads/buyers?item_id=${encodeURIComponent(avisoId)}&date_from=${c.desde}&date_to=${c.hasta}&limit=50&offset=${offset}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    )
    paginas.push(p)
    if (offset + 50 >= (p.paging?.total ?? 0)) break
  }
  return paginas
}

async function mercadolibre(c: ContextoFuente): Promise<FuenteGuardada<DatosPorFuente['mercadolibre']>> {
  const avisoId = await avisoDeMercadoLibre(c)
  if (!avisoId) return sinDatos(c.ahora)
  const corte = () => ({ signal: AbortSignal.timeout(TIMEOUT_MS) })
  const id = encodeURIComponent(avisoId)
  const yo = await mlFetch<{ id?: number }>('/users/me', corte())
  if (!yo.id) throw new Error('MercadoLibre no devolvió el usuario de la cuenta')
  // Vistas del teléfono: ML las da día por día en una ventana hacia atrás desde hoy (máximo 150 días).
  const diasAtras = Math.ceil((Date.parse(c.ahora.toISOString().slice(0, 10)) - Date.parse(c.desde)) / 86_400_000) + 1
  const [visitas, paginas, telefono] = await Promise.all([
    mlFetch<unknown>(`/items/visits?ids=${id}&date_from=${c.desde}&date_to=${c.hasta}`, corte()),
    leadsDelPeriodo(yo.id, avisoId, c),
    diasAtras <= 150 ? mlFetch<unknown>(`/items/${id}/contacts/phone_views/time_window?last=${diasAtras}&unit=day`, corte()) : Promise.resolve(null),
  ])
  return ok(c.ahora, {
    avisoId,
    visitas: visitasDeMercadoLibre(visitas, avisoId),
    contactos: contactosDeMercadoLibre(paginas),
    vistasTelefono: telefono === null ? null : vistasDelTelefonoEnPeriodo(telefono, c.desde, c.hasta),
  })
}

async function graph(ruta: string): Promise<{ data?: Array<Record<string, unknown>> }> {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) throw new Error('falta META_ACCESS_TOKEN')
  const sep = ruta.includes('?') ? '&' : '?'
  const res = await fetch(`${GRAPH}/${ruta}${sep}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  const j = (await res.json().catch(() => ({}))) as { data?: Array<Record<string, unknown>>; error?: { message?: string } }
  if (!res.ok || j.error) throw new Error(`Meta: ${j.error?.message ?? `HTTP ${res.status}`}`)
  return j
}

async function meta(c: ContextoFuente): Promise<FuenteGuardada<DatosPorFuente['meta']>> {
  const camps = await sb().from('property_meta_campaigns').select('campaign_id').eq('property_id', c.propertyId).not('campaign_id', 'is', null)
  if (camps.error) throw new Error(`campañas: ${camps.error.message}`)
  const ids = (camps.data ?? []).map(r => String(r.campaign_id)).slice(0, 3)
  if (!ids.length) return sinDatos(c.ahora)
  const rango = `time_range=${encodeURIComponent(JSON.stringify({ since: c.desde, until: c.hasta }))}`
  // Todo en paralelo (como mucho 3 campañas × 3 consultas): en serie se pasaría del techo de Netlify.
  const filas = await Promise.all(ids.map(async id => {
    const [total, edadSexo, plataformas] = await Promise.all([
      graph(`${id}/insights?fields=reach,impressions,spend,actions&${rango}`),
      graph(`${id}/insights?fields=actions&breakdowns=age,gender&${rango}`),
      graph(`${id}/insights?fields=reach,actions&breakdowns=publisher_platform&${rango}`),
    ])
    return { total: total.data ?? [], edadSexo: edadSexo.data ?? [], plataformas: plataformas.data ?? [] }
  }))
  const d = sumarMeta(filas as never)
  return d.campanas ? ok(c.ahora, d) : sinDatos(c.ahora)
}

async function instagram(c: ContextoFuente): Promise<FuenteGuardada<DatosPorFuente['instagram']>> {
  const r = await sb().from('property_reels').select('ig_media_id, ig_permalink, publicado_en').eq('property_id', c.propertyId)
    .not('ig_media_id', 'is', null).order('publicado_en', { ascending: false }).limit(3)
  if (r.error) throw new Error(`reels: ${r.error.message}`)
  // Un reel publicado DESPUÉS del período no corresponde a este informe.
  const { hastaISO } = instantesDelPeriodo(c)
  const reels = (r.data ?? []).filter(x => !x.publicado_en || Date.parse(String(x.publicado_en)) < Date.parse(hastaISO))
  if (!reels.length) return sinDatos(c.ahora)
  // En paralelo y con corte cada uno: en serie, tres reels lentos sumaban más que el techo de Netlify.
  const datos = await Promise.all(reels.map(async reel => {
    const ins = await instagramFetch<unknown>(`/${reel.ig_media_id}/insights?metric=views,reach,likes,comments,saved,shares`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return reelDeInsights(ins, { permalink: reel.ig_permalink ? String(reel.ig_permalink) : null, publicadoEn: reel.publicado_en ? String(reel.publicado_en) : null })
  }))
  return ok(c.ahora, { reels: datos })
}

const TRAER: { [K in NombreFuente]: (c: ContextoFuente) => Promise<FuenteGuardada<DatosPorFuente[K]>> } = {
  consultas, visitas, reserva, mercadolibre, meta, instagram,
}

export async function traerFuente<K extends NombreFuente>(nombre: K, c: ContextoFuente): Promise<FuenteGuardada<DatosPorFuente[K]>> {
  const f = TRAER[nombre] as (c: ContextoFuente) => Promise<FuenteGuardada<DatosPorFuente[K]>>
  if (!f) return conError(c.ahora, new Error(`fuente desconocida: ${String(nombre)}`))
  return sinLanzar(c.ahora, () => f(c))
}
