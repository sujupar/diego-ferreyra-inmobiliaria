import { pFetch } from './client'
import { propertyToPropertiPayload } from './mapping'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type {
  PortalAdapter,
  Property,
  PublishResult,
  PortalMetricsPoint,
  ValidationResult,
} from '../types'

interface PropertiCreated {
  id: string
  url: string
}

interface PropertiStatsResponse {
  daily?: Array<{
    date: string
    views?: number
    contacts?: number
    favorites?: number
  }>
}

export class PropertiAdapter implements PortalAdapter {
  readonly name = 'properati' as const

  constructor(public readonly enabled: boolean) {}

  validate(property: Property): ValidationResult {
    return validateCommon(property)
  }

  async publish(property: Property): Promise<PublishResult> {
    const v = this.validate(property)
    if (!v.ok) {
      throw new PortalAdapterError(
        `Validación falló: ${v.errors.join(', ')}`,
        'properati',
        'validation',
        false,
      )
    }
    const payload = propertyToPropertiPayload(property)
    const created = await pFetch<PropertiCreated>('/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { externalId: created.id, externalUrl: created.url }
  }

  async update(property: Property, externalId: string): Promise<void> {
    const payload = propertyToPropertiPayload(property)
    await pFetch(`/listings/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async unpublish(externalId: string): Promise<void> {
    await pFetch(`/listings/${externalId}`, { method: 'DELETE' })
  }

  async fetchMetrics(externalId: string, _since: Date): Promise<PortalMetricsPoint[]> {
    const stats = await pFetch<PropertiStatsResponse>(
      `/listings/${externalId}/stats?days=30`,
    ).catch(() => ({ daily: [] } as PropertiStatsResponse))
    return (stats.daily ?? []).map(d => ({
      date: d.date.slice(0, 10),
      views: d.views ?? 0,
      contacts: d.contacts ?? 0,
      favorites: d.favorites ?? 0,
      whatsapps: 0,
      raw: { source: 'properati_stats', value: d },
    }))
  }
}
