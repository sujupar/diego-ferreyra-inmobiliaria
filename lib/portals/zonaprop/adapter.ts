import { zpFetch } from './client'
import { propertyToZpPayload } from './mapping'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type {
  PortalAdapter,
  Property,
  PublishResult,
  PortalMetricsPoint,
  ValidationResult,
} from '../types'

interface ZpListingCreated {
  id: string
  publicUrl: string
}

interface ZpStatsResponse {
  daily?: Array<{
    date: string
    views?: number
    contacts?: number
    favorites?: number
    whatsapps?: number
  }>
}

export class ZonapropAdapter implements PortalAdapter {
  readonly name = 'zonaprop' as const

  constructor(public readonly enabled: boolean) {}

  validate(property: Property): ValidationResult {
    const base = validateCommon(property)
    const errors = [...base.errors]
    const warnings = [...base.warnings]
    if ((property.photos?.length ?? 0) < 10) {
      warnings.push('ZonaProp recomienda ≥10 fotos para mejor calidad de aviso')
    }
    if (!property.description || property.description.length < 300) {
      warnings.push('ZonaProp recomienda descripción ≥300 chars')
    }
    return { ok: errors.length === 0, errors, warnings }
  }

  async publish(property: Property): Promise<PublishResult> {
    const v = this.validate(property)
    if (!v.ok) {
      throw new PortalAdapterError(
        `Validación falló: ${v.errors.join(', ')}`,
        'zonaprop',
        'validation',
        false,
      )
    }
    const payload = propertyToZpPayload(property)
    const created = await zpFetch<ZpListingCreated>('/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { externalId: created.id, externalUrl: created.publicUrl }
  }

  async update(property: Property, externalId: string): Promise<void> {
    const payload = propertyToZpPayload(property)
    await zpFetch(`/listings/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async unpublish(externalId: string): Promise<void> {
    await zpFetch(`/listings/${externalId}`, { method: 'DELETE' })
  }

  async fetchMetrics(externalId: string, _since: Date): Promise<PortalMetricsPoint[]> {
    const stats = await zpFetch<ZpStatsResponse>(
      `/listings/${externalId}/stats?range=30d`,
    ).catch(() => ({ daily: [] } as ZpStatsResponse))

    return (stats.daily ?? []).map(d => ({
      date: d.date.slice(0, 10),
      views: d.views ?? 0,
      contacts: d.contacts ?? 0,
      favorites: d.favorites ?? 0,
      whatsapps: d.whatsapps ?? 0,
      raw: { source: 'zonaprop_stats', value: d },
    }))
  }
}
