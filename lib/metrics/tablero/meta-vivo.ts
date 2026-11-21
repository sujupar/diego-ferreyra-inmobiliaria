/**
 * Lo que el Tablero lee de Meta EN VIVO (solo lectura). SOLO servidor.
 *
 *  - Cada anuncio de la campaña de tasación en el período, con su estado de hoy,
 *    vista previa, enlace de Instagram y miniatura.
 *  - Los nombres de los anuncios que figuran por número en los registros de las
 *    propiedades (el enlace del anuncio a veces trae el id y no el nombre).
 *
 * Reglas: caché en memoria 30 min, tiempo corto por pedido y fallo silencioso:
 * si Meta no contesta, la tabla dice "no disponible" y el resto del Tablero no se
 * entera (va por una ruta aparte).
 */
import 'server-only'
import { ACCION_REGISTRO, cargarBlue, db, todas } from '../panel/servidor'
import { embudoDeCampania } from '../panel/embudo'
import type { Rango } from '../panel/rango'
import { agruparAnunciosDelPeriodo, type AnunciosDelPeriodo, type FichaAnuncio, type FilaInsightAnuncio } from './anuncios-periodo'

const API = 'https://graph.facebook.com/v21.0'
const CACHE_MS = 30 * 60_000
const TIMEOUT_MS = 8_000
const MAX_PAGINAS = 10

export type AnunciosEnVivo =
  | ({ disponible: true; consultadoEn: string } & AnunciosDelPeriodo)
  | { disponible: false; motivo: string }

const cache = new Map<string, { en: number; valor: AnunciosEnVivo & { disponible: true } }>()

async function graph<T>(url: string, token: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  const sep = url.includes('?') ? '&' : '?'
  const r = await fetch(`${url}${sep}access_token=${encodeURIComponent(token)}`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  const j = await r.json()
  if (j?.error) throw new Error(j.error.message ?? 'Error de Meta')
  return j as T
}

/**
 * Todas las páginas de un listado de Meta. Si llega al techo de páginas o se
 * pasa del tiempo, TIRA: un total cortado presentado como completo es peor que
 * "no disponible".
 */
async function todasLasPaginas<T>(url: string, token: string, limite: number): Promise<T[]> {
  const out: T[] = []
  let siguiente: string | null = `${API}/${url}`
  for (let i = 0; siguiente; i++) {
    if (i >= MAX_PAGINAS) throw new Error('Meta devolvió más páginas que el techo')
    if (Date.now() > limite) throw new Error('Meta tardó demasiado')
    const r: { data?: T[]; paging?: { next?: string } } = await graph(siguiente, token, Math.max(1_000, Math.min(TIMEOUT_MS, limite - Date.now())))
    out.push(...(r.data ?? []))
    // `next` ya trae el token: se le saca para no mandarlo dos veces.
    siguiente = r.paging?.next ? r.paging.next.replace(/([?&])access_token=[^&]*&?/, '$1') : null
  }
  return out
}

/** El detalle por anuncio pide una fila por anuncio y por DÍA: más de 3 meses no entra en el tiempo de Netlify. */
export const MAX_DIAS_ANUNCIOS = 93
/** Tiempo total para leer Meta, por debajo del techo de ~26 s de Netlify. */
const PRESUPUESTO_MS = 18_000

interface AnuncioRawFicha {
  id: string
  effective_status: string
  preview_shareable_link?: string
  adset?: { name?: string }
  creative?: { thumbnail_url?: string; instagram_permalink_url?: string; body?: string; title?: string }
}

export async function anunciosDelPeriodo(r: Rango): Promise<AnunciosEnVivo> {
  const clave = `${r.desde}|${r.hasta}`
  const c = cache.get(clave)
  if (c && Date.now() - c.en < CACHE_MS) return c.valor
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return { disponible: false, motivo: 'Falta el acceso a Meta.' }
  const dias = Math.round((Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000) + 1
  if (dias > MAX_DIAS_ANUNCIOS) return { disponible: false, motivo: 'para ver cada anuncio, elegí un período de hasta 3 meses' }
  const limite = Date.now() + PRESUPUESTO_MS
  try {
    // Las campañas de tasación con gasto en el período salen de lo ya sincronizado: no se hardcodean.
    const data = await todas<{ campaign_id: string | null; campaign_name: string | null }>((a, b) => db().from('meta_ads_daily').select('campaign_id, campaign_name')
      .gte('date', r.desde).lte('date', r.hasta).gt('spend', 0).order('date').order('campaign_id').range(a, b))
    const campanias = [...new Set(data.filter(m => m.campaign_id && embudoDeCampania(m.campaign_name) === 'tasacion').map(m => String(m.campaign_id)))]
    if (campanias.length === 0) return { disponible: false, motivo: 'La campaña de tasación no tuvo gasto en el período.' }

    const tr = encodeURIComponent(JSON.stringify({ since: r.desde, until: r.hasta }))
    const [blue, partes] = await Promise.all([
      cargarBlue(),
      Promise.all(campanias.map(async id => {
        const [filas, fichas] = await Promise.all([
          todasLasPaginas<FilaInsightAnuncio>(`${id}/insights?level=ad&time_increment=1&time_range=${tr}&fields=ad_id,ad_name,adset_name,spend,impressions,inline_link_clicks,actions&limit=500`, token, limite),
          todasLasPaginas<AnuncioRawFicha>(`${id}/ads?fields=id,effective_status,preview_shareable_link,adset{name},creative{thumbnail_url,instagram_permalink_url,body,title}&limit=200`, token, limite),
        ])
        return { filas, fichas }
      })),
    ])
    const fichas: FichaAnuncio[] = partes.flatMap(p => p.fichas).map(a => ({
      id: a.id, effective_status: a.effective_status, conjunto: a.adset?.name ?? null,
      preview_shareable_link: a.preview_shareable_link ?? null, instagram_permalink_url: a.creative?.instagram_permalink_url ?? null,
      thumbnail_url: a.creative?.thumbnail_url ?? null, texto: a.creative?.body ?? null, titulo: a.creative?.title ?? null,
    }))
    const valor = { disponible: true as const, consultadoEn: new Date().toISOString(), ...agruparAnunciosDelPeriodo(partes.flatMap(p => p.filas), fichas, ACCION_REGISTRO, blue) }
    cache.set(clave, { en: Date.now(), valor })
    return valor
  } catch (e) {
    console.warn('[tablero/meta-vivo]', e instanceof Error ? e.message : e)
    return { disponible: false, motivo: 'Meta no respondió.' }
  }
}

const nombresCache = new Map<string, { en: number; nombre: string }>()

/**
 * Nombre de cada anuncio por su id de Meta, en UNA llamada (`?ids=`), con 3 s de
 * techo. Lo que no se pueda resolver no viene en el mapa: quien llama deja el
 * texto como estaba. Nunca tira.
 */
export async function nombresDeAnuncios(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const faltan: string[] = []
  for (const id of new Set(ids)) {
    const c = nombresCache.get(id)
    if (c && Date.now() - c.en < CACHE_MS) out.set(id, c.nombre)
    else if (/^\d{6,25}$/.test(id)) faltan.push(id)
  }
  const token = process.env.META_ACCESS_TOKEN
  if (!faltan.length || !token) return out
  try {
    const r = await graph<Record<string, { name?: string }>>(`${API}/?ids=${faltan.slice(0, 50).join(',')}&fields=name`, token, 3_000)
    for (const id of faltan) {
      const nombre = r[id]?.name
      if (nombre) { out.set(id, nombre); nombresCache.set(id, { en: Date.now(), nombre }) }
    }
  } catch (e) {
    console.warn('[tablero/meta-vivo] nombres de anuncios:', e instanceof Error ? e.message : e)
  }
  return out
}
