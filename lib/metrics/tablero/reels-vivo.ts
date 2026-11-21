/**
 * Datos de los reels para el Tablero. SOLO servidor.
 * Comentarios, privados, visitas y registros salen de la base; las vistas de
 * cada reel, de Instagram en vivo (caché 30 min, fallo silencioso: sin vistas
 * la tabla igual se arma).
 */
import 'server-only'
import { db, todas } from '../panel/servidor'
import type { Rango } from '../panel/rango'
import { resumenReels, type ComentarioReelRow, type ReelRow, type ResumenReels, type VisitaReelRow } from './reels'
import type { LeadRow } from './comercial'

const API = 'https://graph.facebook.com/v21.0'
const CACHE_MS = 30 * 60_000
const vistasCache = new Map<string, { en: number; vistas: number | null }>()

async function vistasDeInstagram(ids: string[]): Promise<Map<string, number | null>> {
  const token = process.env.META_ACCESS_TOKEN
  const out = new Map<string, number | null>()
  await Promise.all(ids.map(async id => {
    const c = vistasCache.get(id)
    if (c && Date.now() - c.en < CACHE_MS) { out.set(id, c.vistas); return }
    if (!token || !/^\d{6,25}$/.test(id)) { out.set(id, null); return }
    try {
      const r = await fetch(`${API}/${id}/insights?metric=views&access_token=${encodeURIComponent(token)}`, { cache: 'no-store', signal: AbortSignal.timeout(5_000) })
      const j = await r.json()
      const v = Number(j?.data?.find((d: { name: string }) => d.name === 'views')?.values?.[0]?.value)
      const vistas = Number.isFinite(v) ? v : null
      if (j?.error) console.warn('[tablero/reels] vistas de Instagram:', j.error.message)
      out.set(id, vistas)
      vistasCache.set(id, { en: Date.now(), vistas })
    } catch (e) {
      console.warn('[tablero/reels] vistas de Instagram:', e instanceof Error ? e.message : e)
      out.set(id, null)
    }
  }))
  return out
}

export async function reelsDelTablero(r: Rango): Promise<ResumenReels> {
  const sb = db()
  const reels = await sb.from('property_reels').select('id, property_id, automatizacion_activa, simulacro, publicado_en, ig_media_id')
    .eq('estado', 'publicado').not('ig_media_id', 'is', null).order('publicado_en').limit(200)
  if (reels.error) throw new Error(reels.error.message)
  const filas = (reels.data ?? []) as ReelRow[]
  if (!filas.length) return resumenReels({ reels: [], comentarios: [], visitas: [], leads: [], direcciones: new Map(), vistas: new Map(), rango: r })
  const ids = filas.map(x => x.id)
  // PostgREST corta en 1000 filas sin avisar: todo lo que crece se pagina con orden fijo.
  const [comentarios, visitas, leads, props, vistas] = await Promise.all([
    todas<ComentarioReelRow>((a, b) => sb.from('reel_comentarios').select('reel_id, coincide, simulado, dm_enviado_en, created_at, ig_user_id').in('reel_id', ids).order('id').range(a, b)),
    todas<VisitaReelRow>((a, b) => sb.from('landing_page_visits').select('utm_content, visited_at').like('utm_content', 'reel_%').eq('is_bot', false).order('id').range(a, b)),
    todas<LeadRow>((a, b) => sb.from('property_leads').select('property_id, source, utm, created_at, suspected_bot, deleted_at, email, phone').like('utm->>utm_content', 'reel_%').order('id').range(a, b)),
    sb.from('properties').select('id, address').in('id', filas.map(x => x.property_id).filter((x): x is string => !!x)),
    vistasDeInstagram(filas.map(x => x.ig_media_id!).filter(Boolean)),
  ])
  if (props.error) throw new Error(props.error.message)
  return resumenReels({
    reels: filas,
    comentarios,
    visitas,
    leads,
    direcciones: new Map((props.data ?? []).map(p => [p.id as string, p.address as string | null])),
    vistas,
    rango: r,
  })
}
