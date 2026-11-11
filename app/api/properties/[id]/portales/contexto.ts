/**
 * Piezas comunes de las rutas `portales/diferencias` y `portales/sincronizar`:
 * cliente admin, propiedad, listings sincronizables, adapters y la conversión
 * de `metadata` (Json de la base) a un registro y de vuelta.
 */
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
import { initPortals, getAdapter } from '@/lib/portals'
import { MercadoLibreAdapter } from '@/lib/portals/mercadolibre/adapter'
import { ArgenpropAdapter } from '@/lib/portals/argenprop/adapter'
import type { PortalSincronizable } from '@/lib/portals/diferencias-con-ficha'
import type { Database, Json } from '@/types/database.types'

export const admin = (): SupabaseClient<Database> =>
  createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export type PropertyRow = Database['public']['Tables']['properties']['Row']
export type UsuarioAutenticado = Awaited<ReturnType<typeof requireAuth>>

export interface ListingVivo {
  id: string
  portal: PortalSincronizable
  status: string
  external_id: string
  external_url: string | null
  metadata: Record<string, unknown>
}

export const PORTALES_SINCRONIZABLES: readonly PortalSincronizable[] = ['mercadolibre', 'argenprop']
// Un aviso pausado también puede quedar desalineado con la ficha; cerrado/fallido no se toca.
const ESTADOS_SINCRONIZABLES = ['published', 'paused']

export function esRegistro(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Guard recursivo: lo que vuelve a la columna jsonb tiene que ser JSON de verdad. */
export function esJson(v: unknown): v is Json {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true
  if (typeof v === 'number') return Number.isFinite(v)
  if (Array.isArray(v)) return v.every(esJson)
  if (esRegistro(v)) return Object.values(v).every(x => x === undefined || esJson(x))
  return false
}

function esPortalSincronizable(p: string): p is PortalSincronizable {
  return p === 'mercadolibre' || p === 'argenprop'
}

/**
 * Auth + propiedad + permiso. `requireAuth` se llama acá y este helper se usa
 * FUERA del try de la ruta: su redirect, atrapado por un catch, se vuelve 502.
 */
export async function autorizar(id: string): Promise<
  | { error: NextResponse }
  | { user: UsuarioAutenticado; supabase: SupabaseClient<Database>; property: PropertyRow }
> {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const supabase = admin()
  const { data: property } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
  if (!property) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir', property))) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { user, supabase, property }
}

/** Listings publicados o pausados, con id de aviso, de los portales que se sincronizan. */
export async function listingsVivos(supabase: SupabaseClient<Database>, propertyId: string): Promise<ListingVivo[]> {
  const { data, error } = await supabase
    .from('property_listings')
    .select('id, portal, status, external_id, external_url, metadata')
    .eq('property_id', propertyId)
    .in('portal', [...PORTALES_SINCRONIZABLES])
    .in('status', ESTADOS_SINCRONIZABLES)
  if (error) throw new Error(`No se pudieron leer los avisos de la propiedad: ${error.message}`)
  const out: ListingVivo[] = []
  for (const l of data ?? []) {
    if (!l.external_id || !esPortalSincronizable(l.portal)) continue
    out.push({
      id: l.id, portal: l.portal, status: l.status, external_id: l.external_id,
      external_url: l.external_url, metadata: esRegistro(l.metadata) ? l.metadata : {},
    })
  }
  return out
}

export async function adapterMl(): Promise<MercadoLibreAdapter> {
  await initPortals()
  const ml = getAdapter('mercadolibre')
  if (!(ml instanceof MercadoLibreAdapter) || !ml.enabled) throw new Error('MercadoLibre no está conectado.')
  return ml
}

export async function adapterAp(): Promise<ArgenpropAdapter> {
  await initPortals()
  const ap = getAdapter('argenprop')
  if (!(ap instanceof ArgenpropAdapter) || !ap.enabled) throw new Error('Argenprop no está conectado.')
  return ap
}

export function fichaDe(property: PropertyRow) {
  return {
    property_type: property.property_type,
    operation_type: property.operation_type,
    asking_price: property.asking_price,
    currency: property.currency,
    photos: property.photos,
  }
}
