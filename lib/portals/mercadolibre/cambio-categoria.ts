/**
 * Cambio de categoría / precio en el MISMO aviso de ML. Puro.
 * Sonda 2026-11-11: PUT /items/{id} con category_id + atributos fijos de la nueva
 * (+ price y currency_id JUNTOS) devuelve 200 conservando el id. Cambiar solo
 * category_id deja PROPERTY_TYPE viejo, por eso los fijos viajan en el mismo PUT.
 */
import type { MlRawAttribute } from './category-attributes'
import type { MlItemVivo } from './edicion'

// Calculados por ML: mandarlos genera warning (cause 3611).
const CALCULADOS = new Set(['HAS_LOWER_PRICE', 'BASE_PRICE', 'PRICE_TO_PAY', 'HAS_DISCOUNT'])

export interface AtributoMlEnvio { id: string; value_id?: string; value_name?: string }

export function fijosDeCategoria(raw: readonly MlRawAttribute[]): { id: string; value_id: string; value_name: string }[] {
  const out: { id: string; value_id: string; value_name: string }[] = []
  for (const r of raw) {
    const v = r.values?.[0]
    if (r.tags?.fixed && v) out.push({ id: r.id, value_id: v.id, value_name: v.name })
  }
  return out
}

export function armarCambioDePrecioMl(precio: { monto: number; moneda: string }): { price: number; currency_id: string } {
  return { price: Math.round(precio.monto), currency_id: precio.moneda.toUpperCase() }
}

export function armarCambioDeCategoriaMl(
  item: MlItemVivo,
  rawNueva: readonly MlRawAttribute[],
  categoriaNueva: string,
  precio: { monto: number; moneda: string } | null,
): { body: Record<string, unknown> } {
  const fijos = fijosDeCategoria(rawNueva)
  // Un atributo vivo sobrevive solo si la nueva lo lista y es escribible: los que
  // la nueva no tiene (ej. OPERATION_SUBTYPE) se omiten y ML los descarta.
  const escribibles = new Set(
    rawNueva.filter(r => !r.tags?.read_only && !r.tags?.fixed && !CALCULADOS.has(r.id)).map(r => r.id),
  )
  const vivos: AtributoMlEnvio[] = item.attributes
    .filter(a => escribibles.has(a.id))
    .map(a => ({
      id: a.id,
      ...(a.value_id ? { value_id: a.value_id } : {}),
      ...(a.value_name !== null ? { value_name: a.value_name } : {}),
    }))
  const body: Record<string, unknown> = {
    category_id: categoriaNueva,
    attributes: [...vivos, ...fijos],
  }
  if (precio) Object.assign(body, armarCambioDePrecioMl(precio))
  return { body }
}
