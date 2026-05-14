import type { Database, Json } from '@/types/database.types'

export type PortalName =
  | 'mercadolibre'
  | 'argenprop'
  | 'zonaprop'
  | 'properati'
  | 'mudafy'

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
  publish(property: Property): Promise<PublishResult>
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

// Re-export Json para que los adapters no tengan que importar de tipos generados
export type { Json }
