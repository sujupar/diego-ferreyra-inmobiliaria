import { apFetch } from './client'
import { propertyToApPayload } from './mapping'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type {
  PortalAdapter,
  Property,
  PublishResult,
  PortalMetricsPoint,
  ValidationResult,
} from '../types'

interface ApAdCreated {
  id: string
  url: string
}

interface ApStatsResponse {
  daily?: Array<{
    date: string
    views?: number
    contacts?: number
    favorites?: number
  }>
}

export class ArgenpropAdapter implements PortalAdapter {
  readonly name = 'argenprop' as const

  constructor(public readonly enabled: boolean) {}

  validate(property: Property): ValidationResult {
    return validateCommon(property)
  }

  async publish(property: Property): Promise<PublishResult> {
    const v = this.validate(property)
    if (!v.ok) {
      throw new PortalAdapterError(
        `Validación falló: ${v.errors.join(', ')}`,
        'argenprop',
        'validation',
        false,
      )
    }
    const payload = propertyToApPayload(property)
    const created = await apFetch<ApAdCreated>('/ads', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { externalId: created.id, externalUrl: created.url }
  }

  async update(property: Property, externalId: string): Promise<void> {
    const payload = propertyToApPayload(property)
    await apFetch(`/ads/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async unpublish(externalId: string): Promise<void> {
    await apFetch(`/ads/${externalId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ active: false }),
    })
  }

  async fetchMetrics(externalId: string, _since: Date): Promise<PortalMetricsPoint[]> {
    const stats = await apFetch<ApStatsResponse>(
      `/ads/${externalId}/stats?days=30`,
    ).catch(() => ({ daily: [] } as ApStatsResponse))

    return (stats.daily ?? []).map(d => ({
      date: d.date.slice(0, 10),
      views: d.views ?? 0,
      contacts: d.contacts ?? 0,
      favorites: d.favorites ?? 0,
      whatsapps: 0,
      raw: { source: 'argenprop_stats', value: d },
    }))
  }
}
