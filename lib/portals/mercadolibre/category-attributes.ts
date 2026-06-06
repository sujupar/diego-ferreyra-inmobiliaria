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

  if (
    cached?.attributes &&
    cached.fetched_at &&
    Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS
  ) {
    return cached.attributes as unknown as MlRawAttribute[]
  }

  const fresh = await mlFetch<MlRawAttribute[]>(`/categories/${categoryId}/attributes`)
  await supabase.from('ml_category_attributes').upsert(
    {
      category_id: categoryId,
      attributes: fresh as unknown as Json,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'category_id' },
  )
  return fresh
}

/** Trae y clasifica los atributos de la categoría (con caché). */
export async function fetchCategoryAttributes(categoryId: string): Promise<CategoryAttributesResult> {
  return classifyAttributes(await getRawAttributes(categoryId))
}
