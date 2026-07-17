/**
 * Atribución de campañas Meta (UTM + IDs) capturada en la landing y propagada
 * al deal/CRM. Política first-touch: el primer clic pago manda (se conserva).
 */

export interface FunnelAttribution {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  fb_campaign_id?: string | null
  fb_adset_id?: string | null
  fb_ad_id?: string | null
  fb_placement?: string | null
}

const ATTR_KEY = 'df_attr'
const NINETY_DAYS = 60 * 60 * 24 * 90
const ATTR_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fb_campaign_id',
  'fb_adset_id',
  'fb_ad_id',
  'fb_placement',
] as const

/** ¿Hay señal de Meta/paga (no una visita directa vacía)? */
export function hasMetaAttribution(a: FunnelAttribution | null | undefined): boolean {
  if (!a) return false
  return Boolean(a.fb_campaign_id || a.fb_ad_id || a.utm_campaign || a.utm_source)
}

/** Lee la atribución desde un query string (?utm_...&fb_...). */
export function readAttributionFromParams(search: string): FunnelAttribution {
  const p = new URLSearchParams(search)
  const out: FunnelAttribution = {}
  for (const f of ATTR_FIELDS) {
    const v = p.get(f)
    if (v) out[f] = v.slice(0, 200)
  }
  // Compat con el formato de los ADS ACTIVOS (era GHL, verificado en la API de
  // Meta 2026-07-17): utm_source=fb_ad + utm_medium={{adset.name}} +
  // campaign_id={{campaign.id}} (sin prefijo fb_). No tocamos los anuncios:
  // adaptamos la lectura.
  const cid = p.get('campaign_id')
  if (cid && !out.fb_campaign_id) out.fb_campaign_id = cid.slice(0, 200)
  if (!out.utm_term && out.utm_medium && (out.utm_source ?? '').toLowerCase().startsWith('fb')) {
    out.utm_term = out.utm_medium // en ese formato, el conjunto viaja en utm_medium
  }
  return out
}

/** Lee la atribución guardada (cookie df_attr → localStorage). Client-only. */
export function readStoredAttribution(): FunnelAttribution | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)df_attr=([^;]*)/)
  let raw = m ? decodeURIComponent(m[1]) : ''
  if (!raw) {
    try {
      raw = localStorage.getItem(ATTR_KEY) || ''
    } catch {
      /* localStorage bloqueado */
    }
  }
  if (!raw) return null
  try {
    return JSON.parse(raw) as FunnelAttribution
  } catch {
    return null
  }
}

/**
 * Persiste la atribución (cookie 90d + localStorage). FIRST-TOUCH: si ya hay una
 * guardada con datos Meta, NO la pisa (conserva el primer clic pago). Client-only.
 */
export function persistAttribution(a: FunnelAttribution): void {
  if (typeof window === 'undefined') return
  if (!hasMetaAttribution(a)) return
  const existing = readStoredAttribution()
  if (hasMetaAttribution(existing)) return
  const json = JSON.stringify(a)
  try {
    localStorage.setItem(ATTR_KEY, json)
  } catch {
    /* localStorage bloqueado */
  }
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${ATTR_KEY}=${encodeURIComponent(json)}; Max-Age=${NINETY_DAYS}; Path=/; SameSite=Lax${secure}`
}

/**
 * Mapea la atribución a las columnas meta_* del deal. PURO (server, testeable).
 * Devuelve {} si no hay ningún dato (evita un UPDATE vacío).
 */
export function attributionToDealColumns(
  a: FunnelAttribution | null | undefined,
): Record<string, string | FunnelAttribution | null> {
  if (!a) return {}
  const clean = (v?: string | null) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null
  const cols = {
    meta_campaign_id: clean(a.fb_campaign_id),
    meta_campaign_name: clean(a.utm_campaign),
    meta_adset_id: clean(a.fb_adset_id),
    meta_adset_name: clean(a.utm_term),
    meta_ad_id: clean(a.fb_ad_id),
    meta_ad_name: clean(a.utm_content),
    meta_placement: clean(a.fb_placement),
    meta_site_source: clean(a.utm_source),
  }
  if (!Object.values(cols).some((v) => v !== null)) return {}
  return { ...cols, origin_metadata: a }
}
