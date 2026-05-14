import { mFetch } from './client'
import { propertyToMudafyPayload } from './mapping'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type {
  PortalAdapter,
  Property,
  PublishResult,
  PortalMetricsPoint,
  ValidationResult,
} from '../types'

interface MudafyListingCreated {
  id: string
  publicUrl: string
}

interface MudafyStatsResponse {
  daily?: Array<{
    date: string
    views?: number
    contacts?: number
    favorites?: number
    whatsapps?: number
  }>
}

export class MudafyAdapter implements PortalAdapter {
  readonly name = 'mudafy' as const

  constructor(public readonly enabled: boolean) {}

  validate(property: Property): ValidationResult {
    return validateCommon(property)
  }

  async publish(property: Property): Promise<PublishResult> {
    const v = this.validate(property)
    if (!v.ok) {
      throw new PortalAdapterError(
        `Validación falló: ${v.errors.join(', ')}`,
        'mudafy',
        'validation',
        false,
      )
    }
    const payload = propertyToMudafyPayload(property)
    const created = await mFetch<MudafyListingCreated>('/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { externalId: created.id, externalUrl: created.publicUrl }
  }

  async update(property: Property, externalId: string): Promise<void> {
    const payload = propertyToMudafyPayload(property)
    await mFetch(`/listings/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async unpublish(externalId: string): Promise<void> {
    await mFetch(`/listings/${externalId}`, { method: 'DELETE' })
  }

  async fetchMetrics(externalId: string, _since: Date): Promise<PortalMetricsPoint[]> {
    const stats = await mFetch<MudafyStatsResponse>(
      `/listings/${externalId}/stats?range=30d`,
    ).catch(() => ({ daily: [] } as MudafyStatsResponse))
    return (stats.daily ?? []).map(d => ({
      date: d.date.slice(0, 10),
      views: d.views ?? 0,
      contacts: d.contacts ?? 0,
      favorites: d.favorites ?? 0,
      whatsapps: d.whatsapps ?? 0,
      raw: { source: 'mudafy_stats', value: d },
    }))
  }
}
