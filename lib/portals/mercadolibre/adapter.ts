import { mlFetch } from './client'
import { propertyToMlPayload, ML_LISTING_TYPES, type MlPayloadOptions } from './mapping'
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

    // Fallback de tier: intentamos el listing_type pedido (default gold_premium) y,
    // si ML responde "Not available quota" (la cuenta no tiene cupo para ese tier
    // pago), bajamos al siguiente tier disponible. Cualquier otro error se propaga.
    const requested = opts.listingType || 'gold_premium'
    const order = ML_LISTING_TYPES.map(t => t.id)
    const startIdx = Math.max(0, order.indexOf(requested))
    const tiersToTry = order.slice(startIdx)

    let lastErr: unknown
    for (const tier of tiersToTry) {
      try {
        const payload = propertyToMlPayload(property, { ...opts, listingType: tier })
        const created = await mlFetch<MlItemCreated>('/items', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        // ML NO publica la descripción inline del POST /items: hay que setearla
        // como sub-recurso aparte. Sin esto el aviso queda SIN descripción.
        const plainText = payload.description?.plain_text
        if (plainText) {
          await mlFetch(`/items/${created.id}/description`, {
            method: 'POST',
            body: JSON.stringify({ plain_text: plainText }),
          }).catch(err => {
            // No abortamos la publicación por la descripción, pero lo registramos.
            console.error(`[ml.publish] descripción falló para ${created.id}`, err)
          })
        }
        return {
          externalId: created.id,
          externalUrl: created.permalink,
          metadata: { listingTypeUsed: tier, ...(tier !== requested ? { downgradedFrom: requested } : {}) },
        }
      } catch (err) {
        lastErr = err
        const msg = err instanceof Error ? err.message : String(err)
        // Sin cupo para este tier, o el tier no aplica a la categoría → probar el siguiente.
        if (/available quota/i.test(msg) || /listing.?type/i.test(msg)) continue
        throw err
      }
    }
    throw lastErr
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
    // La descripción se actualiza por su sub-recurso, no en el PUT del item.
    const plainText = updateable.description?.plain_text
    delete updateable.description
    await mlFetch(`/items/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(updateable),
    })
    if (plainText) {
      await mlFetch(`/items/${externalId}/description`, {
        method: 'PUT',
        body: JSON.stringify({ plain_text: plainText }),
      }).catch(err => console.error(`[ml.update] descripción falló para ${externalId}`, err))
    }
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
