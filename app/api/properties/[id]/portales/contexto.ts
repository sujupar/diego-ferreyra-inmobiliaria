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
import {
  CLAVE_RECLAMO, limiteReclamo,
  type DepsComunes, type DepsMl, type DepsAp, type EventoAuditoria,
} from '@/lib/portals/sincronizar-portal'
import { getRawAttributes, fetchCategoryAttributes } from '@/lib/portals/mercadolibre/category-attributes'
import { apPublicUrl } from '@/lib/portals/argenprop/field-schema'
import { syncPortalPropertyMap } from '@/lib/portals/mapa-avisos'
import { writeAudit } from '@/lib/portals/audit'

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
  // Permiso ANTES del 404: quien no puede difundir no se entera de si la propiedad existe.
  // Con `null` el caso 'propias' falla cerrado.
  if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir', property ?? null))) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  if (!property) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
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

// initPortals(true) como ml-publish: relee credenciales (un token de ML renovado
// en otra instancia no queda viejo en el registro de esta).
export async function adapterMl(): Promise<MercadoLibreAdapter> {
  await initPortals(true)
  const ml = getAdapter('mercadolibre')
  if (!(ml instanceof MercadoLibreAdapter) || !ml.enabled) throw new Error('MercadoLibre no está conectado.')
  return ml
}

export async function adapterAp(): Promise<ArgenpropAdapter> {
  await initPortals(true)
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

// ─── Dependencias reales de la orquestación ───────────────────────────────

/**
 * Escrituras en la base + la reserva del listing. La reserva es un UPDATE
 * condicional (PostgREST): solo toma la fila si `metadata.sync_en_curso` está
 * vacío o vencido; Postgres re-evalúa el WHERE tras el lock de la fila, así que
 * de dos pedidos simultáneos uno solo recibe la fila.
 */
export function depsComunes(
  supabase: SupabaseClient<Database>, property: PropertyRow, listing: ListingVivo, user: UsuarioAutenticado,
): DepsComunes {
  const token = new Date().toISOString()
  let reservado = false
  const conToken = (meta: Record<string, unknown>) => (reservado ? { ...meta, [CLAVE_RECLAMO]: token } : meta)
  return {
    async guardarListing(cambios) {
      const { metadata, ...resto } = cambios
      // Mientras dura la reserva, ninguna escritura de metadata la puede borrar.
      const meta = metadata !== undefined ? conToken(metadata) : undefined
      if (meta !== undefined && !esJson(meta)) throw new Error('metadata del listing no es JSON válido')
      const { error } = await supabase.from('property_listings')
        .update({ ...resto, ...(meta !== undefined ? { metadata: meta } : {}) })
        .eq('id', listing.id)
      if (error) throw new Error(`No se pudo guardar el aviso en la plataforma: ${error.message}`)
    },
    sincronizarMapa: (code, url) => syncPortalPropertyMap(supabase, listing.portal, property, code, url),
    auditar: (evento: EventoAuditoria) => writeAudit(supabase, {
      listingId: listing.id, propertyId: property.id, portal: listing.portal,
      eventType: evento.eventType, payload: evento.payload, errorMessage: evento.errorMessage,
      actor: user.profile.full_name ?? user.id,
    }),
    ahora: () => new Date().toISOString(),
    async reclamar() {
      const meta = { ...listing.metadata, [CLAVE_RECLAMO]: token }
      if (!esJson(meta)) throw new Error('metadata del listing no es JSON válido')
      const limite = limiteReclamo(new Date())
      const { data, error } = await supabase.from('property_listings')
        .update({ metadata: meta })
        .eq('id', listing.id)
        .or(`metadata->>${CLAVE_RECLAMO}.is.null,metadata->>${CLAVE_RECLAMO}.lt."${limite}"`)
        .select('id')
      if (error) throw new Error(`No se pudo reservar el aviso: ${error.message}`)
      reservado = (data ?? []).length > 0
      return reservado
    },
    async liberar() {
      // Se relee para no pisar lo que la sincronización acaba de guardar.
      const { data } = await supabase.from('property_listings').select('metadata').eq('id', listing.id).maybeSingle()
      const actual = esRegistro(data?.metadata) ? data.metadata : {}
      reservado = false
      if (actual[CLAVE_RECLAMO] !== token) return
      const sin = Object.fromEntries(Object.entries(actual).filter(([k]) => k !== CLAVE_RECLAMO))
      if (!esJson(sin)) return
      const { error } = await supabase.from('property_listings').update({ metadata: sin })
        .eq('id', listing.id).eq(`metadata->>${CLAVE_RECLAMO}`, token)
      if (error) throw new Error(error.message)
    },
  }
}

export function depsMlPara(comunes: DepsComunes, ml: MercadoLibreAdapter, property: PropertyRow): DepsMl {
  return {
    ...comunes,
    leerAviso: async ext => (await ml.leerAviso(ext)).item,
    atributosDeCategoria: getRawAttributes,
    idsAceptados: async cat => {
      const { required, recommended } = await fetchCategoryAttributes(cat)
      return new Set([...required, ...recommended].map(a => a.id))
    },
    cambiarEnElLugar: (ext, body) => ml.cambiarEnElLugar(ext, body),
    publicarReemplazo: opts => ml.publicarReemplazo(property, opts),
    cerrar: ext => ml.cerrar(ext),
  }
}

export function depsApPara(comunes: DepsComunes, ap: ArgenpropAdapter, property: PropertyRow): DepsAp {
  return {
    ...comunes,
    leerAviso: codigo => ap.leerAviso(codigo),
    idAnunciante: () => ap.idAnunciante(),
    caracteristicasDeCategoria: tipo => ap.caracteristicasDeCategoria(tipo),
    republicar: (codigo, dto) => ap.republicar(codigo, dto),
    enviarAviso: dto => ap.enviarAviso(dto),
    suspender: codigo => ap.setEstado(codigo, 'suspendido'),
    urlPublica: avisoId => apPublicUrl(property, avisoId),
  }
}
