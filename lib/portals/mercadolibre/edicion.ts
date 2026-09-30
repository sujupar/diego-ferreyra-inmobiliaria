/**
 * Edición de un ítem YA publicado en ML. Puro.
 * Regla: se parte del ítem VIVO (re-leído al guardar), se aplican solo los
 * cambios de la persona y se envía la lista COMPLETA de atributos escribibles,
 * así el resultado no depende de si ML fusiona o reemplaza (Tarea 1 lo midió).
 */
import { aplicarCambios, mismoValor, type CambiosDeValores, type Valores } from '../edicion-comun'
import { normalizeUnit } from './mapping'
import type { CategoryAttribute, MlRawAttribute } from './category-attributes'
import { ML_MAX_FOTOS_AVISO } from '../photo-limits'

export interface MlItemVivo {
  id: string; title: string; status: string; category_id: string; price: number; permalink?: string
  attributes: { id: string; value_id: string | null; value_name: string | null }[]
}
export interface CambiosMl { titulo?: string; valores: CambiosDeValores; precio?: number; fotos?: string[] }

/**
 * Sonda 2026-09-30 sobre un ítem [TEST]: `{ value_name: '' }` quita el atributo;
 * `{ value_id: '-1' }` lo deja como "No aplica". Con esto ML SÍ deja vaciar, así
 * que este valor nunca es `null` y el throw de más abajo es código muerto hoy
 * (queda por si algún atributo puntual resultara no vaciable en el futuro).
 */
export const ML_VALOR_VACIO: { value_id?: string | null; value_name?: string | null } | null = { value_name: '' }

// Calculados por ML: si se mandan, ML los marca como warning (cause 3611).
const CALCULADOS = new Set(['HAS_LOWER_PRICE', 'BASE_PRICE', 'PRICE_TO_PAY', 'HAS_DISCOUNT'])

export function normalizarMl(id: string, v: string): string {
  return normalizeUnit({ id, value_name: v }).value_name ?? v
}

export function valoresDesdeItem(item: MlItemVivo, schema: readonly CategoryAttribute[]): Valores {
  const porId = new Map(schema.map(a => [a.id, a]))
  const out: Valores = {}
  for (const a of item.attributes) {
    const def = porId.get(a.id)
    if (!def) continue
    if (def.valueType === 'list' && a.value_id) out[a.id] = { value_id: a.value_id }
    else if (a.value_name) out[a.id] = { value_name: a.value_name }
  }
  return out
}

function escribibles(raw: readonly MlRawAttribute[]): Set<string> {
  return new Set(raw.filter(r => !r.tags?.read_only && !r.tags?.fixed && !CALCULADOS.has(r.id)).map(r => r.id))
}

export function armarActualizacionMl(item: MlItemVivo, cambios: CambiosMl, raw: readonly MlRawAttribute[]) {
  const permitidos = escribibles(raw)
  const vivos: Valores = {}
  for (const a of item.attributes) {
    if (!permitidos.has(a.id)) continue
    vivos[a.id] = a.value_id ? { value_id: a.value_id, value_name: a.value_name ?? undefined } : { value_name: a.value_name ?? undefined }
  }
  const ids: string[] = []
  for (const [id, v] of Object.entries(cambios.valores)) {
    if (!permitidos.has(id)) continue
    if (v === null && ML_VALOR_VACIO === null) throw new Error(`MercadoLibre no deja vaciar "${id}"; cambialo por otro valor.`)
    if (!mismoValor(vivos[id], v ?? undefined, s => normalizarMl(id, s))) ids.push(id)
  }
  const finales = aplicarCambios(vivos, Object.fromEntries(Object.entries(cambios.valores).filter(([id]) => permitidos.has(id))))
  const attributes = [
    // Se mandan value_id Y value_name cuando ML los da los dos (típico en boolean/list):
    // un atributo que nadie tocó (ej. SUITABLE_FOR_MORTGAGE_LOAN en el test de "lo que
    // cambió otra persona en el portal") tiene que viajar completo, no solo por value_id.
    ...Object.entries(finales).map(([id, v]) => normalizeUnit({
      id,
      ...(v.value_id ? { value_id: v.value_id } : {}),
      ...(v.value_name !== undefined ? { value_name: v.value_name } : {}),
    })),
    ...Object.entries(cambios.valores).filter(([id, v]) => v === null && permitidos.has(id) && vivos[id]).map(([id]) => ({ id, ...ML_VALOR_VACIO })),
  ]
  const body: Record<string, unknown> = { attributes }
  const cambiaTitulo = cambios.titulo !== undefined && cambios.titulo.trim() !== item.title.trim()
  const cambiaPrecio = cambios.precio !== undefined && cambios.precio !== item.price
  if (cambiaTitulo) body.title = cambios.titulo!.trim() // `!`: cambiaTitulo ya garantiza que existe
  if (cambiaPrecio) body.price = cambios.precio
  // Sin comparar contra `item.attributes`/pictures actuales: `cambios.fotos`
  // solo llega definido cuando ALGO en la DB marcó "fotos" como cambiado (ver
  // cambios-ficha.ts), así que reenviar la lista entera acá es inofensivo —
  // nunca se dispara por un cambio ajeno a las fotos.
  if (cambios.fotos !== undefined) body.pictures = cambios.fotos.slice(0, ML_MAX_FOTOS_AVISO).map(source => ({ source }))
  const cambiados = [
    ...(cambiaTitulo ? ['titulo'] : []), ...ids,
    ...(cambiaPrecio ? ['precio'] : []), ...(cambios.fotos !== undefined ? ['fotos'] : []),
  ]
  return { body, cambiados }
}
