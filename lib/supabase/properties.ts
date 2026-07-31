import { createClient } from '@supabase/supabase-js'

/**
 * Fire N8A (congratulations asesor) + N8B (captación admins) when a property
 * transitions to status='approved'. Dynamic import to keep this module usable
 * from scripts/tests that don't include the email stack.
 */
async function firePropertyCapturedNotifications(propertyId: string) {
  try {
    const mod = await import('@/lib/email/notifications/property-captured')
    await mod.notifyPropertyCaptured(propertyId)
  } catch (err) {
    console.error('[notify] property-captured hook failed:', err)
  }
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface PropertyInput {
  appraisal_id?: string
  contact_id?: string
  address: string
  neighborhood: string
  city?: string
  property_type?: string
  rooms?: number
  bedrooms?: number
  bathrooms?: number
  garages?: number
  covered_area?: number
  total_area?: number
  floor?: number
  age?: number
  asking_price: number
  currency?: string
  commission_percentage?: number
  contract_start_date?: string
  contract_end_date?: string
  origin?: string
  created_by?: string
  assigned_to?: string
  description?: string
  photos?: string[]
  plans?: string[]
  status?: string
  video_url?: string | null
  tour_3d_url?: string | null
  video_file_url?: string | null
}

export async function createProperty(input: PropertyInput) {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('properties')
    .insert(input)
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function getProperties(filters?: { status?: string; origin?: string; from?: string; to?: string; assigned_to?: string }) {
  const supabase = getAdmin()
  let query = supabase
    .from('properties')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.origin) query = query.eq('origin', filters.origin)
  if (filters?.from) query = query.gte('created_at', filters.from + 'T00:00:00Z')
  if (filters?.to) query = query.lte('created_at', filters.to + 'T23:59:59Z')
  if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)

  const { data, error } = await query.limit(200)
  if (error) throw error
  return data || []
}

export interface PropertiesListFilters {
  status?: string
  origin?: string
  from?: string
  to?: string
  assigned_to?: string
}

/** Columnas de `vw_properties_list` que la tabla del listado deja ordenar por header. */
export const SORTABLE_PROPERTY_LIST_COLUMNS = [
  'address',
  'neighborhood',
  'property_type',
  'asking_price',
  'status',
  'origin',
  'created_at',
] as const
export type SortablePropertyListColumn = (typeof SORTABLE_PROPERTY_LIST_COLUMNS)[number]

export interface PropertiesListSort {
  key: string
  dir: 'asc' | 'desc'
}

/**
 * Resuelve un pedido de orden (`?sort=&dir=` de la ruta, o `undefined`) a una
 * columna/dirección válida. Cualquier `key` fuera del whitelist (typo, campo
 * que no existe en la vista) cae al default `created_at desc` — nunca deja
 * pasar un nombre de columna arbitrario a `.order()`. Pura y testeada
 * (hallazgo #7, revisión adversarial 2026-07-31: antes el orden de la vista
 * tabla se aplicaba en memoria sobre SOLO la página cargada, así que "Precio"
 * mostraba la más cara de los primeros 24 resultados, no de todo el sistema).
 */
export function resolvePropertiesListSort(sort?: PropertiesListSort | null): { column: SortablePropertyListColumn; ascending: boolean } {
  const isValidColumn = !!sort && (SORTABLE_PROPERTY_LIST_COLUMNS as readonly string[]).includes(sort.key)
  if (!isValidColumn) return { column: 'created_at', ascending: false }
  return { column: sort!.key as SortablePropertyListColumn, ascending: sort!.dir === 'asc' }
}

/**
 * Listado paginado para app/(dashboard)/properties/page.tsx — lee de
 * `vw_properties_list` (SIN el array `photos`, solo `thumbnail`/`photo_count`)
 * en vez de `properties.select('*')`. Ver supabase/migrations/20260731000002_vw_properties_list.sql
 * (A3 de la auditoría: 21.951 KB por request, 99% en `photos` con base64 legacy).
 *
 * `legal_docs_pending`/`origin_pending` NO están en la vista (son 2 columnas
 * booleanas chicas, no vale la pena tocar la vista/migración por esto) — se
 * traen aparte con un SELECT liviano a `properties` (no toca `photos`, cero
 * costo de detoast) EN PARALELO con la vista: mismos filtros + mismo orden
 * determinístico (columna de sort + tie-break por id — el tie-break garantiza
 * que ambas consultas devuelven exactamente el mismo conjunto de filas para
 * el mismo offset/limit aunque haya empates en la columna de orden) + mismo
 * range, y se mezclan acá por id.
 *
 * `sort`: orden real en el SERVIDOR, no en memoria sobre la página cargada
 * (hallazgo #7 — ver `resolvePropertiesListSort`).
 */
export async function getPropertiesListPage(
  filters: PropertiesListFilters = {},
  page: { limit: number; offset: number },
  sort?: PropertiesListSort | null,
) {
  const supabase = getAdmin()
  const { limit, offset } = page
  const { column: sortColumn, ascending: sortAscending } = resolvePropertiesListSort(sort)

  let listQuery = supabase
    .from('vw_properties_list')
    .select('*', { count: 'exact' })
    .order(sortColumn, { ascending: sortAscending })
    .order('id', { ascending: true })

  if (filters.status) listQuery = listQuery.eq('status', filters.status)
  if (filters.origin) listQuery = listQuery.eq('origin', filters.origin)
  if (filters.from) listQuery = listQuery.gte('created_at', filters.from + 'T00:00:00Z')
  if (filters.to) listQuery = listQuery.lte('created_at', filters.to + 'T23:59:59Z')
  if (filters.assigned_to) listQuery = listQuery.eq('assigned_to', filters.assigned_to)

  let flagsQuery = supabase
    .from('properties')
    .select('id, legal_docs_pending, origin_pending')
    .order(sortColumn, { ascending: sortAscending })
    .order('id', { ascending: true })

  if (filters.status) flagsQuery = flagsQuery.eq('status', filters.status)
  if (filters.origin) flagsQuery = flagsQuery.eq('origin', filters.origin)
  if (filters.from) flagsQuery = flagsQuery.gte('created_at', filters.from + 'T00:00:00Z')
  if (filters.to) flagsQuery = flagsQuery.lte('created_at', filters.to + 'T23:59:59Z')
  if (filters.assigned_to) flagsQuery = flagsQuery.eq('assigned_to', filters.assigned_to)

  const [{ data, error, count }, { data: flags, error: flagsError }] = await Promise.all([
    listQuery.range(offset, offset + limit - 1),
    flagsQuery.range(offset, offset + limit - 1),
  ])
  if (error) throw error
  if (flagsError) throw flagsError

  const flagsById = new Map<string, { legal_docs_pending: boolean; origin_pending: boolean }>(
    (flags || []).map((f) => [f.id, { legal_docs_pending: !!f.legal_docs_pending, origin_pending: !!f.origin_pending }])
  )

  const rows = data || []
  const merged = rows.map((r) => ({
    ...r,
    legal_docs_pending: flagsById.get(r.id)?.legal_docs_pending ?? false,
    origin_pending: flagsById.get(r.id)?.origin_pending ?? false,
  }))

  const total = count ?? merged.length
  return { data: merged, total, hasMore: offset + merged.length < total }
}

export async function getProperty(id: string) {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function updateProperty(id: string, updates: Partial<PropertyInput> & { status?: string; documents?: any; photos?: string[]; plans?: string[]; video_url?: string | null; tour_3d_url?: string | null; video_file_url?: string | null; video_recorrido_url?: string | null }) {
  const supabase = getAdmin()
  const { error } = await supabase
    .from('properties')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function reviewProperty(id: string, approved: boolean, reviewerId: string, notes?: string) {
  const supabase = getAdmin()

  if (!approved) {
    // Rejected — set both legal and property status to rejected
    const { error } = await supabase
      .from('properties')
      .update({
        legal_status: 'rejected',
        legal_reviewer_id: reviewerId,
        legal_notes: notes || null,
        legal_reviewed_at: new Date().toISOString(),
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
    return
  }

  // Approved — check if photos are uploaded before setting final status
  const prop = await getProperty(id)
  const hasPhotos = Array.isArray(prop.photos) && prop.photos.length > 0
  const finalStatus = hasPhotos ? 'approved' : 'pending_review'

  const { error } = await supabase
    .from('properties')
    .update({
      legal_status: 'approved',
      legal_reviewer_id: reviewerId,
      legal_notes: notes || null,
      legal_reviewed_at: new Date().toISOString(),
      status: finalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error

  // N8A+N8B: captación 100% solo cuando status efectivamente pasa a 'approved'
  // (requiere fotos + legal). Si legal aprueba pero faltan fotos, el disparo
  // real ocurre después en checkAndAdvanceProperty() al subir la primera foto.
  // UNIQUE INDEX garantiza que aunque este hook y el de upload/route.ts
  // disparen la misma notificación, solo se envía una vez por destinatario.
  if (finalStatus === 'approved' && prop.status !== 'approved') {
    await firePropertyCapturedNotifications(id)
  }
}

/** Check if property should auto-advance to approved (both legal + photos done) */
export async function checkAndAdvanceProperty(id: string) {
  const supabase = getAdmin()
  const prop = await getProperty(id)
  const hasPhotos = Array.isArray(prop.photos) && prop.photos.length > 0
  const legalApproved = prop.legal_status === 'approved'

  if (hasPhotos && legalApproved && prop.status !== 'approved') {
    const { error } = await supabase
      .from('properties')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    // N8A+N8B: captación 100% desde el camino "fotos después de aprobación legal".
    await firePropertyCapturedNotifications(id)
    return true
  }
  return false
}
