import { createClient } from '@supabase/supabase-js'
import { inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'
import { debeAvanzarACaptada } from '@/lib/properties/captacion'

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
  // El rango llega como fecha de calendario y se abre como día ARGENTINO
  // (ver lib/filters/rango-fechas.ts). Con 'T00:00:00Z' pedir "5 de agosto"
  // traía desde las 21:00 del 4 hasta las 20:59 del 5, hora de acá.
  if (filters?.from) query = query.gte('created_at', inicioDelDiaArgentina(filters.from))
  if (filters?.to) query = query.lte('created_at', finDelDiaArgentina(filters.to))
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
  // Día ARGENTINO en las dos puntas — y tiene que ser EXACTAMENTE el mismo
  // corte que el de `flagsQuery` de abajo, o las dos consultas devolverían
  // conjuntos distintos para el mismo offset y el merge por id quedaría cojo.
  if (filters.from) listQuery = listQuery.gte('created_at', inicioDelDiaArgentina(filters.from))
  if (filters.to) listQuery = listQuery.lte('created_at', finDelDiaArgentina(filters.to))
  if (filters.assigned_to) listQuery = listQuery.eq('assigned_to', filters.assigned_to)

  let flagsQuery = supabase
    .from('properties')
    .select('id, legal_docs_pending, origin_pending')
    .order(sortColumn, { ascending: sortAscending })
    .order('id', { ascending: true })

  if (filters.status) flagsQuery = flagsQuery.eq('status', filters.status)
  if (filters.origin) flagsQuery = flagsQuery.eq('origin', filters.origin)
  if (filters.from) flagsQuery = flagsQuery.gte('created_at', inicioDelDiaArgentina(filters.from))
  if (filters.to) flagsQuery = flagsQuery.lte('created_at', finDelDiaArgentina(filters.to))
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

/**
 * Manda la documentación al abogado.
 *
 * NO toca `properties.status`. Antes esto era `status='pending_review'`, y
 * sobre una propiedad ya captada eso apagaba de golpe la pestaña Difusión, la
 * landing pública, las consultas entrantes y el agendamiento del recorrido —
 * con plata de Meta apuntándole. El envío vive ahora en su propio carril
 * (`legal_submitted_at`), que convive con la captación sin pisarla.
 *
 * Si la documentación había sido rechazada, re-enviarla la devuelve a
 * 'pending': sin eso el rechazo era permanente y el abogado no podía volver a
 * revisarla, aunque el aviso de la ficha invitara a "volvé a enviarla".
 */
export async function submitPropertyForLegalReview(id: string) {
  const supabase = getAdmin()
  const prop = await getProperty(id)
  const ahora = new Date().toISOString()

  const patch: Record<string, unknown> = { legal_submitted_at: ahora, updated_at: ahora }
  if (prop.legal_status === 'rejected') {
    patch.legal_status = 'pending'
    patch.legal_notes = null
  }

  const { error } = await supabase.from('properties').update(patch).eq('id', id)
  if (error) throw error
  return prop
}

export async function reviewProperty(id: string, approved: boolean, reviewerId: string, notes?: string) {
  const supabase = getAdmin()
  const prop = await getProperty(id)
  const ahora = new Date().toISOString()

  const patch: Record<string, unknown> = {
    legal_status: approved ? 'approved' : 'rejected',
    legal_reviewer_id: reviewerId,
    legal_notes: notes || null,
    legal_reviewed_at: ahora,
    updated_at: ahora,
  }

  // Un rechazo sobre una propiedad que NUNCA se captó la saca del flujo, igual
  // que antes: no hay nada publicado que romper y el asesor tiene que corregir.
  // Sobre una propiedad CAPTADA el rechazo se queda en el carril legal — pisar
  // `status` ahí tumbaría la landing (404 con tráfico pago encima) mientras el
  // aviso sigue vivo en MercadoLibre, porque el trigger de despublicación solo
  // reacciona a 'sold'/'withdrawn'.
  const yaCaptada = prop.status === 'approved' || !!prop.captured_at
  if (!approved && !yaCaptada) patch.status = 'rejected'

  const { error } = await supabase.from('properties').update(patch).eq('id', id)
  if (error) throw error

  // Aprobar la documentación puede completar la captación de una propiedad que
  // ya tenía fotos. Es la MISMA regla que el camino de las fotos: una sola.
  if (approved) await checkAndAdvanceProperty(id)
}

/**
 * Avanza la propiedad a captada si corresponde. Corre al confirmar una subida
 * de fotos, al crearla y al aprobar la documentación.
 *
 * La regla vive en `lib/properties/captacion.ts` (fotos + ningún "no" activo).
 * Desde 2026-08-09 la documentación legal ya NO es condición.
 */
export async function checkAndAdvanceProperty(id: string) {
  const supabase = getAdmin()
  const prop = await getProperty(id)

  if (!debeAvanzarACaptada({
    status: prop.status,
    legalStatus: prop.legal_status,
    photosCount: Array.isArray(prop.photos) ? prop.photos.length : 0,
  })) return false

  const ahora = new Date().toISOString()

  // Reclamo ATÓMICO de la PRIMERA captación: el `.is('captured_at', null)` va
  // en el WHERE, así que dos subidas simultáneas no pueden ganar las dos y los
  // mails N8A/N8B salen una sola vez. Antes la idempotencia dependía del UNIQUE
  // de email_notifications_log, que nunca frenó nada: esa tabla no tiene ni una
  // fila de 'property_captured'.
  const { data: reclamada, error } = await supabase
    .from('properties')
    .update({ status: 'approved', captured_at: ahora, updated_at: ahora })
    .eq('id', id)
    .is('captured_at', null)
    .select('id')
  if (error) throw error

  if (reclamada && reclamada.length > 0) {
    await firePropertyCapturedNotifications(id)
    return true
  }

  // Ya se había captado antes (típico: se restauró una descartada y le subieron
  // una foto). Se restituye el estado, sin repetir el anuncio.
  const { error: errorRecaptura } = await supabase
    .from('properties')
    .update({ status: 'approved', updated_at: ahora })
    .eq('id', id)
  if (errorRecaptura) throw errorRecaptura
  return true
}

/**
 * Bandeja del abogado: la documentación que le mandaron y todavía no resolvió.
 *
 * Antes era `GET /api/properties?status=pending_review`. Ese filtro obligaba a
 * que el circuito legal viviera en la misma columna que la captación, con todo
 * lo que eso apagaba. Ahora la bandeja es el carril legal y nada más.
 */
export async function getPropertiesPendientesDeRevisionLegal() {
  const supabase = getAdmin()
  const { data, error, count } = await supabase
    .from('properties')
    .select(
      'id, address, neighborhood, city, property_type, asking_price, currency, documents, photos, rooms, covered_area, created_at, legal_submitted_at, status',
      { count: 'exact' },
    )
    .eq('legal_status', 'pending')
    .not('legal_submitted_at', 'is', null)
    .order('legal_submitted_at', { ascending: true })
  if (error) throw error
  return { data: data || [], total: count ?? (data?.length ?? 0) }
}
