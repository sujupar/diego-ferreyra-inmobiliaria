import type { Database, Json } from '@/types/database.types'

export type PortalName = 'mercadolibre' | 'argenprop' | 'zonaprop'

export type ListingStatus =
  | 'pending'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'disabled'
  | 'paused'

export type Property = Database['public']['Tables']['properties']['Row']
export type PropertyListing = Database['public']['Tables']['property_listings']['Row']
export type PortalCredentialsRow = Database['public']['Tables']['portal_credentials']['Row']

export interface PublishResult {
  externalId: string
  externalUrl: string
  metadata?: Record<string, unknown>
}

export interface PortalMetricsPoint {
  date: string // YYYY-MM-DD
  views: number
  contacts: number
  favorites: number
  whatsapps: number
  raw: Record<string, unknown>
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface PortalAdapter {
  readonly name: PortalName
  readonly enabled: boolean

  validate(property: Property): ValidationResult
  // opts es portal-específico (MercadoLibre usa MlPayloadOptions). Se tipa unknown
  // acá para no acoplar la interfaz a un portal; cada adapter lo refina.
  publish(property: Property, opts?: unknown): Promise<PublishResult>
  update(property: Property, externalId: string): Promise<void>
  unpublish(externalId: string): Promise<void>
  fetchMetrics(externalId: string, since: Date): Promise<PortalMetricsPoint[]>
}

export type PortalErrorCode = 'auth' | 'validation' | 'rate_limit' | 'network' | 'unknown'

export class PortalAdapterError extends Error {
  constructor(
    message: string,
    public readonly portal: PortalName,
    public readonly code: PortalErrorCode,
    public readonly retryable: boolean,
    public readonly original?: unknown,
  ) {
    super(message)
    this.name = 'PortalAdapterError'
  }
}

/**
 * Separa lo que ve una persona de lo que sirve para diagnosticar.
 *
 * `mensaje` es castellano llano (va al toast del wizard). `paraElLog` le suma
 * el detalle crudo del portal, que se guarda en `property_listings.last_error`.
 * Antes los dos eran la misma cosa: el JSON de MercadoLibre terminaba en
 * pantalla, y el 2026-08-06 el dueño lo vio en vivo durante una demo.
 */
export function mensajeYDetalle(err: unknown): { mensaje: string; paraElLog: string } {
  const mensaje = err instanceof Error ? err.message : String(err)
  const detalle = err instanceof PortalAdapterError && typeof err.original === 'string'
    ? err.original
    : null
  return { mensaje, paraElLog: detalle ? `${mensaje}${SEPARADOR_DETALLE}${detalle}` : mensaje }
}

const SEPARADOR_DETALLE = ' | '

/**
 * Vuelta atrás de `mensajeYDetalle`: de lo guardado en `last_error`, deja solo
 * la parte legible. Es lo que se muestra en pantalla; el detalle crudo sigue
 * en la base para quien lo necesite diagnosticar.
 */
export function soloElMensaje(lastError: string | null | undefined): string | null {
  if (!lastError) return null
  const i = lastError.indexOf(SEPARADOR_DETALLE)
  return i === -1 ? lastError : lastError.slice(0, i)
}

// Re-export Json para que los adapters no tengan que importar de tipos generados
export type { Json }
