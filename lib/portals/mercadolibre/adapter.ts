import { mlFetch } from './client'
import { propertyToMlPayload, resolveCategory, mensajeSinCategoria, ML_LISTING_TYPES, type MlPayloadOptions } from './mapping'
import { fetchAvailableListingTypes } from './listing-types'
import { asegurarCategoriaPublicable } from './category-attributes'
import { validateCommon } from '../validation'
import { PortalAdapterError, mensajeYDetalle } from '../types'
import type { MlItemVivo } from './edicion'
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
  warnings?: { code?: string; message?: string }[]
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
    if (!resolveCategory(property)) {
      errors.push(mensajeSinCategoria(property))
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

    // Fallback de tier robusto: probamos el listing_type pedido y, si ML responde
    // "Not available quota" / tier inválido para la categoría, seguimos con los tiers
    // REALMENTE disponibles para la cuenta+categoría (los trae ML, más barato primero).
    // La disponibilidad es por categoría: depto/casa suelen tener solo 'silver', PH 'free'.
    // Defensa en profundidad: confirmamos contra ML que la categoría existe, es
    // HOJA y admite publicar, ANTES de armar el aviso. El mapa está verificado
    // por scripts/verify-ml-categories.ts, pero los IDs son datos de un tercero
    // y se pudren solos: MLA1471 estaba en el mapa viejo y hoy da 404. Sin este
    // control, el síntoma es un JSON incomprensible de ML en mitad de una demo.
    const categoria = resolveCategory(property)!
    await asegurarCategoriaPublicable(categoria)

    const requested = opts.listingType || 'free'
    const tiersToTry: string[] = [requested]
    try {
      const avail = await fetchAvailableListingTypes(categoria)
      for (const t of avail) if (!tiersToTry.includes(t.id)) tiersToTry.push(t.id)
    } catch {
      // Si no se pudo consultar la disponibilidad, caemos al orden estático conocido.
      for (const t of ML_LISTING_TYPES) if (!tiersToTry.includes(t.id)) tiersToTry.push(t.id)
    }

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
        if (created.warnings?.length) {
          console.warn(`[ml.publish] ML devolvió warnings para ${created.id}`, created.warnings)
        }
        return {
          externalId: created.id,
          externalUrl: created.permalink,
          metadata: {
            listingTypeUsed: tier,
            ...(tier !== requested ? { downgradedFrom: requested } : {}),
            ...(created.warnings?.length ? { warnings: created.warnings } : {}),
          },
        }
      } catch (err) {
        lastErr = err
        // OJO: se matchea sobre `paraElLog`, no sobre `err.message`. Desde que
        // los errores de ML se traducen al castellano, el código original
        // ("Not available quota", "listing_type.invalid") ya NO está en el
        // mensaje: vive en el detalle crudo. Matchear contra el mensaje
        // traducido rompería el descenso de tier en silencio.
        const { paraElLog } = mensajeYDetalle(err)
        // Solo reintentamos con el siguiente tier ante errores ESPECÍFICOS de
        // disponibilidad del tier: sin cupo, o el tier no se ofrece para la
        // categoría. Cualquier otro error (incluidos otros de listing_type) se
        // propaga tal cual para no enmascarar la causa real.
        const tierUnavailable =
          /available quota/i.test(paraElLog) ||
          /listing_type\.invalid/i.test(paraElLog) ||
          /listing type was null/i.test(paraElLog)
        if (tierUnavailable) continue
        throw err
      }
    }
    throw lastErr
  }

  async update(): Promise<void> {
    // Reemplazado por el flujo de edición real: leerAviso + armarActualizacionMl
    // (edicion.ts, puro y testeado) + enviarEdicion. Este `update` mandaba la
    // FICHA completa y pisaba lo que alguien haya corregido a mano en el portal.
    throw new Error('update() quedó en desuso: usar leerAviso + armarActualizacionMl + enviarEdicion (ver cambios-ficha.ts)')
  }

  /** Lee el ítem VIVO y su descripción (sub-recurso aparte en ML). */
  async leerAviso(externalId: string): Promise<{ item: MlItemVivo; descripcion: string }> {
    const item = await mlFetch<MlItemVivo>(`/items/${encodeURIComponent(externalId)}`)
    const desc = await mlFetch<{ plain_text?: string }>(`/items/${encodeURIComponent(externalId)}/description`)
      .catch(() => ({ plain_text: '' })) // un ítem sin descripción responde 404
    return { item, descripcion: desc.plain_text ?? '' }
  }

  /** PUT del ítem (cuerpo ya armado por armarActualizacionMl) y, si cambió, la descripción. */
  async enviarEdicion(externalId: string, body: Record<string, unknown>, descripcion?: string): Promise<void> {
    await mlFetch(`/items/${encodeURIComponent(externalId)}`, { method: 'PUT', body: JSON.stringify(body) })
    if (descripcion !== undefined) {
      await mlFetch(`/items/${encodeURIComponent(externalId)}/description`, { method: 'PUT', body: JSON.stringify({ plain_text: descripcion }) })
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
