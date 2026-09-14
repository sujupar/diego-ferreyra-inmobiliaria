import type { VisitDataSnapshot, VisitPortalesData, ValorAtributoPortal } from '@/types/visit-data.types'

/**
 * Saneo del snapshot que manda el formulario de visita antes de mezclarlo en
 * `deals.visit_data` (JSONB). `sale`/`purchase` pasan como siempre (el
 * formulario es el único que los arma); las secciones nuevas —`portales` y
 * `landing`— viajan a prefills y prompts, así que se acotan acá: strings con
 * tope, ids de atributo con forma conocida, expensas numérica.
 */
const MAX_RESPUESTA_LANDING = 1500
const MAX_VALOR_ATRIBUTO = 200
const ID_ATRIBUTO = /^[A-Z0-9_]{1,64}$/

export function sanearValoresAtributo(v: unknown): Record<string, ValorAtributoPortal> {
  const out: Record<string, ValorAtributoPortal> = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [id, val] of Object.entries(v as Record<string, unknown>)) {
    if (!ID_ATRIBUTO.test(id)) continue
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue
    const o = val as { value_id?: unknown; value_name?: unknown }
    const limpio: ValorAtributoPortal = {}
    if (typeof o.value_id === 'string' && o.value_id.trim()) limpio.value_id = o.value_id.trim().slice(0, MAX_VALOR_ATRIBUTO)
    if (typeof o.value_name === 'string' && o.value_name.trim()) limpio.value_name = o.value_name.trim().slice(0, MAX_VALOR_ATRIBUTO)
    if (limpio.value_id || limpio.value_name) out[id] = limpio
  }
  return out
}

function sanearPortales(v: unknown): VisitPortalesData {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>
  const n = typeof o.expensas === 'number' ? o.expensas : typeof o.expensas === 'string' ? Number(o.expensas) : NaN
  return {
    expensas: Number.isFinite(n) && n >= 0 ? n : null,
    ml: sanearValoresAtributo(o.ml),
    ap: sanearValoresAtributo(o.ap),
  }
}

export function sanearRespuestasLanding(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!/^q\d{1,2}$/.test(k)) continue
    if (typeof val !== 'string') continue
    const t = val.trim().slice(0, MAX_RESPUESTA_LANDING)
    if (t) out[k] = t
  }
  return out
}

export function sanearSnapshotVisita(body: unknown): Partial<VisitDataSnapshot> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  const b = body as Record<string, unknown>
  const out: Partial<VisitDataSnapshot> = {}
  if ('sale' in b) out.sale = b.sale as VisitDataSnapshot['sale']
  if ('purchase' in b) out.purchase = b.purchase as VisitDataSnapshot['purchase']
  if ('portales' in b) out.portales = sanearPortales(b.portales)
  if ('landing' in b) out.landing = sanearRespuestasLanding(b.landing)
  return out
}
