import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import { mlFetch } from './client'

export type MlValueType = 'string' | 'number' | 'number_unit' | 'boolean' | 'list'

export interface MlRawAttribute {
  id: string
  name: string
  value_type: string
  tags?: Record<string, boolean>
  values?: { id: string; name: string }[]
  allowed_units?: { id: string; name: string }[]
  hint?: string
}

export interface CategoryAttribute {
  id: string
  name: string
  valueType: MlValueType
  required: boolean
  allowedValues?: { id: string; name: string }[]
  allowedUnits?: string[]
  hint?: string
}

export interface CategoryAttributesResult {
  required: CategoryAttribute[]
  recommended: CategoryAttribute[]
}

/** Valor que el asesor (o el prefill) asigna a un atributo. value_id para list, value_name para el resto. */
export interface AttributeOverride {
  value_name?: string
  value_id?: string
}

const TTL_MS = 24 * 60 * 60 * 1000

function isUsable(a: MlRawAttribute): boolean {
  const t = a.tags ?? {}
  return !t.hidden && !t.read_only && !t.variation_attribute
}

function normalize(a: MlRawAttribute): CategoryAttribute {
  const valid: MlValueType[] = ['string', 'number', 'number_unit', 'boolean', 'list']
  const valueType = (valid.includes(a.value_type as MlValueType) ? a.value_type : 'string') as MlValueType
  return {
    id: a.id,
    name: a.name,
    valueType,
    required: Boolean(a.tags?.required),
    allowedValues: a.values?.map(v => ({ id: v.id, name: v.name })),
    allowedUnits: a.allowed_units?.map(u => u.name),
    hint: a.hint,
  }
}

/** Pura: clasifica una lista cruda de atributos de ML en required/recommended. */
export function classifyAttributes(raw: MlRawAttribute[]): CategoryAttributesResult {
  const usable = raw.filter(isUsable).map(normalize)
  return {
    required: usable.filter(a => a.required),
    recommended: usable.filter(a => !a.required),
  }
}

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Trae los atributos crudos de la categoría con caché de 24h en DB. */
export async function getRawAttributes(categoryId: string): Promise<MlRawAttribute[]> {
  const supabase = getSupabase()
  const { data: cached } = await supabase
    .from('ml_category_attributes')
    .select('attributes, fetched_at')
    .eq('category_id', categoryId)
    .maybeSingle()

  // El chequeo de length ignora filas viejas con `[]` (quedaron de cuando el
  // mapa apuntaba a categorías padre) — mejor re-preguntar a ML que servirlas.
  if (
    Array.isArray(cached?.attributes) &&
    (cached.attributes as unknown[]).length > 0 &&
    cached.fetched_at &&
    Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS
  ) {
    return cached.attributes as unknown as MlRawAttribute[]
  }

  const fresh = await mlFetch<MlRawAttribute[]>(`/categories/${categoryId}/attributes`)
  // Una lista vacía NO se cachea: o es una categoría padre (error nuestro) o un
  // hipo de ML. Cachearla dejaría el error pegado 24h aunque ML ya responda bien.
  if (fresh.length > 0) {
    await supabase.from('ml_category_attributes').upsert(
      {
        category_id: categoryId,
        attributes: fresh as unknown as Json,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'category_id' },
    )
  }
  return fresh
}

interface CategoriaMl {
  id?: string
  children_categories?: unknown[]
  settings?: { listing_allowed?: boolean }
  path_from_root?: { name: string }[]
}

/**
 * Falla si la categoría no existe, no es HOJA o no admite publicar.
 *
 * Es el control que faltaba. El 2026-08-06 el mapa mandaba "casa en venta" a
 * MLA1472 ("Departamentos", una categoría padre) y el sistema recién se enteraba
 * cuando ML rechazaba el aviso, con un JSON ilegible, en mitad de una demo.
 *
 * Consulta el árbol público de ML (no requiere credenciales).
 */
export async function asegurarCategoriaPublicable(categoryId: string): Promise<void> {
  const r = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`)
  if (!r.ok) {
    throw new Error(
      `La categoría ${categoryId} no existe en MercadoLibre. ` +
      `Corré: npx tsx scripts/verify-ml-categories.ts`,
    )
  }
  const cat = (await r.json()) as CategoriaMl
  const ruta = (cat.path_from_root ?? []).map(p => p.name).join(' > ')

  if ((cat.children_categories ?? []).length > 0) {
    throw new Error(
      `La categoría ${categoryId} (${ruta}) agrupa otras y MercadoLibre no permite ` +
      `publicar ahí; hay que usar una categoría final. ` +
      `Corré: npx tsx scripts/verify-ml-categories.ts`,
    )
  }
  if (cat.settings?.listing_allowed !== true) {
    throw new Error(
      `MercadoLibre no permite publicar en la categoría ${categoryId} (${ruta}). ` +
      `Corré: npx tsx scripts/verify-ml-categories.ts`,
    )
  }
}

/**
 * Trae y clasifica los atributos de la categoría (con caché).
 *
 * Si ML devuelve CERO atributos, esto REVIENTA en vez de devolver listas vacías.
 *
 * Por qué: una categoría de inmuebles con cero atributos no existe. Cuando eso
 * pasa es porque se preguntó por una categoría PADRE — ML responde 200 con `[]`,
 * que no es un error para él pero sí es una anomalía para nosotros. Devolver
 * listas vacías hacía que el asistente concluyera "esta categoría no exige
 * nada": mostraba 0 campos, marcaba 100% completo y dejaba publicar. Después ML
 * rechazaba el aviso con un mensaje incomprensible. Falló en vivo el 2026-08-06.
 *
 * Regla general: "la respuesta vino vacía" nunca puede significar "está todo bien".
 */
export async function fetchCategoryAttributes(categoryId: string): Promise<CategoryAttributesResult> {
  const raw = await getRawAttributes(categoryId)
  if (raw.length === 0) {
    throw new Error(
      `MercadoLibre no devolvió ningún campo para la categoría ${categoryId}. ` +
      `Suele significar que no es una categoría final (por ejemplo, es un rubro ` +
      `que agrupa otros). Verificá el mapeo con: npx tsx scripts/verify-ml-categories.ts`,
    )
  }
  return classifyAttributes(raw)
}
