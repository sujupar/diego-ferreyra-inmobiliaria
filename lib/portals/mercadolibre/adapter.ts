import { mlFetch } from './client'
import { propertyToMlPayload, type MlPayloadOptions } from './mapping'
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

  async publish(property: Property, opts: MlPayloadOptions = {}): Promise<PublishResult> {
    const validation = this.validate(property)
    if (!validation.ok) {
      throw new PortalAdapterError(
        `Validación falló: ${validation.errors.join(', ')}`,
        'mercadolibre',
        'validation',
        false,
      )
    }
    const payload = propertyToMlPayload(property, opts)
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
    // ML rechaza atributos "calculados" si se envían como input. Los detecta
    // y los marca como warnings (cause_id 3611). Para evitar ruido en logs y
    // posibles 400 en updates parciales, filtramos los conocidos.
    const CALCULATED_ATTRS = new Set([
      'HAS_LOWER_PRICE',
      'BASE_PRICE',
      'PRICE_TO_PAY',
      'HAS_DISCOUNT',
    ])
    if (updateable.attributes) {
      updateable.attributes = updateable.attributes.filter(
        a => !CALCULATED_ATTRS.has(a.id),
      )
    }
    await mlFetch(`/items/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(updateable),
    })
  }

  /**
   * unpublish cierra el item definitivamente (status: closed). NO se puede
   * reactivar después — para "ocultar temporalmente" usar pause() del wrapper
   * del wizard que hace status: paused.
   *
   * Se usa desde el worker (needs_unpublish flag) cuando la propiedad se vende
   * o se descarta, y desde el cleanup del pipeline-test.
   */
  async unpublish(externalId: string): Promise<void> {
    await mlFetch(`/items/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'closed' }),
    })
  }

  /**
   * pause oculta el item pero lo deja reactivable (status: paused).
   * Si el item está en not_yet_active, ML rechaza el cambio — el caller debe
   * manejar ese error (típicamente esperar a active vía polling).
   */
  async pause(externalId: string): Promise<void> {
    await mlFetch(`/items/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'paused' }),
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
