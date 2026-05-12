import { mlFetch } from './client'
import { propertyToMlPayload } from './mapping'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type {
  PortalAdapter,
  Property,
  PublishResult,
  PortalMetricsPoint,
  ValidationResult,
} from '../types'

interface MlItemCreated {
  id: string
  permalink: string
}

interface MlVisitsResponse {
  results?: Array<{ date: string; total: number }>
}

interface MlQuestionsResponse {
  total?: number
}

export class MercadoLibreAdapter implements PortalAdapter {
  readonly name = 'mercadolibre' as const

  constructor(public readonly enabled: boolean) {}

  validate(property: Property): ValidationResult {
    const base = validateCommon(property)
    const errors = [...base.errors]
    const warnings = [...base.warnings]
    if (!property.description || property.description.length < 100) {
      errors.push('ML requiere descripción ≥ 100 chars')
    }
    return { ok: errors.length === 0, errors, warnings }
  }

  async publish(property: Property): Promise<PublishResult> {
    const validation = this.validate(property)
    if (!validation.ok) {
      throw new PortalAdapterError(
        `Validación falló: ${validation.errors.join(', ')}`,
        'mercadolibre',
        'validation',
        false,
      )
    }
    const payload = propertyToMlPayload(property)
    const created = await mlFetch<MlItemCreated>('/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { externalId: created.id, externalUrl: created.permalink }
  }

  async update(property: Property, externalId: string): Promise<void> {
    const payload = propertyToMlPayload(property)
    // PUT no acepta category_id ni listing_type_id (son inmutables tras crear)
    const updateable: Partial<typeof payload> = { ...payload }
    delete updateable.category_id
    delete (updateable as { listing_type_id?: string }).listing_type_id
    await mlFetch(`/items/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(updateable),
    })
  }

  async unpublish(externalId: string): Promise<void> {
    await mlFetch(`/items/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'closed' }),
    })
  }

  async fetchMetrics(externalId: string, since: Date): Promise<PortalMetricsPoint[]> {
    const sinceISO = since.toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)

    const visits = await mlFetch<MlVisitsResponse>(
      `/items/${externalId}/visits/time_window?last=30&unit=day&ending=${today}`,
    ).catch(() => ({ results: [] } as MlVisitsResponse))

    const questions = await mlFetch<MlQuestionsResponse>(
      `/questions/search?item=${externalId}`,
    ).catch(() => ({ total: 0 } as MlQuestionsResponse))

    const byDate = new Map<string, PortalMetricsPoint>()
    for (const v of visits.results ?? []) {
      const d = v.date.slice(0, 10)
      if (d < sinceISO) continue
      byDate.set(d, {
        date: d,
        views: v.total ?? 0,
        contacts: 0,
        favorites: 0,
        whatsapps: 0,
        raw: { source: 'ml_visits', value: v },
      })
    }
    // Las preguntas las atribuímos al día de hoy (ML no expone histórico granular)
    if (byDate.has(today)) {
      const entry = byDate.get(today)!
      entry.contacts = questions.total ?? 0
    } else if ((questions.total ?? 0) > 0) {
      byDate.set(today, {
        date: today,
        views: 0,
        contacts: questions.total ?? 0,
        favorites: 0,
        whatsapps: 0,
        raw: { source: 'ml_questions', value: questions },
      })
    }
    return Array.from(byDate.values())
  }
}
