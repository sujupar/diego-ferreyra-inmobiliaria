/**
 * Cada anuncio de la estructura ACTUAL de la campaña de tasación, leído de Meta
 * en vivo (solo lectura). SOLO servidor.
 *
 * Reglas: caché en memoria 30 min, tiempo corto por pedido, y fallo silencioso:
 * si Meta no contesta, la tabla dice "no disponible" y el resto del Tablero no
 * se entera (va por una ruta aparte).
 */
import 'server-only'
import { ACCION_REGISTRO, db } from '../panel/servidor'
import { armarAnunciosVivo, campaniaTasacionVigente, type AnuncioRaw, type AnuncioVivo, type ConjuntoRaw } from './anuncios'
import type { MetaDia } from '../panel/embudo'

const API = 'https://graph.facebook.com/v21.0'
const CACHE_MS = 30 * 60_000
const TIMEOUT_MS = 8_000

export type AnunciosEnVivo =
  | { disponible: true; campaniaId: string; anuncios: AnuncioVivo[]; consultadoEn: string }
  | { disponible: false; motivo: string }

let cache: { en: number; valor: AnunciosEnVivo & { disponible: true } } | null = null

async function graph<T>(ruta: string, token: string): Promise<T> {
  const sep = ruta.includes('?') ? '&' : '?'
  const r = await fetch(`${API}/${ruta}${sep}access_token=${encodeURIComponent(token)}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  const j = await r.json()
  if (j?.error) throw new Error(j.error.message ?? 'Error de Meta')
  return j as T
}

export async function anunciosEnVivo(): Promise<AnunciosEnVivo> {
  if (cache && Date.now() - cache.en < CACHE_MS) return cache.valor
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return { disponible: false, motivo: 'Falta el acceso a Meta.' }
  try {
    // La campaña de tasación vigente sale de los datos ya sincronizados: no se hardcodea.
    const { data, error } = await db().from('meta_ads_daily').select('date, campaign_id, campaign_name, spend')
      .gt('spend', 0).order('date', { ascending: false }).limit(200)
    if (error) throw new Error(error.message)
    const filas: MetaDia[] = (data ?? []).map(m => ({ fecha: String(m.date).slice(0, 10), campaniaId: m.campaign_id ?? '', campania: m.campaign_name ?? '', gasto: Number(m.spend) || 0, impresiones: 0, clics: 0, visitasMeta: 0 }))
    const campaniaId = campaniaTasacionVigente(filas)
    if (!campaniaId) return { disponible: false, motivo: 'No hay campaña de tasación con gasto.' }

    const conjuntos = (await graph<{ data: ConjuntoRaw[] }>(`${campaniaId}/adsets?fields=id,name,effective_status&limit=100`, token)).data ?? []
    const activos = conjuntos.filter(c => c.effective_status === 'ACTIVE')
    const anuncios: Record<string, AnuncioRaw[]> = {}
    await Promise.all(activos.map(async c => {
      const r = await graph<{ data: AnuncioRaw[] }>(`${c.id}/ads?fields=id,name,effective_status,insights.date_preset(maximum){spend,actions}&limit=100`, token)
      anuncios[c.id] = r.data ?? []
    }))
    const valor = { disponible: true as const, campaniaId, anuncios: armarAnunciosVivo(activos, anuncios, ACCION_REGISTRO), consultadoEn: new Date().toISOString() }
    cache = { en: Date.now(), valor }
    return valor
  } catch (e) {
    console.warn('[tablero/meta-vivo]', e instanceof Error ? e.message : e)
    return { disponible: false, motivo: 'Meta no respondió.' }
  }
}
