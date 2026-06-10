import { apFetch } from './client'
import { propertyToAvisoDto } from './mapping'
import { apCodigo, type AttributeOverride } from './field-schema'
import { resolveCabaBarrioId, CABA_LOCALIDAD_ID } from './catalog'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type { ApCredentials } from '../credentials'
import type {
  PortalAdapter,
  Property,
  PublishResult,
  PortalMetricsPoint,
  ValidationResult,
} from '../types'

export interface ApPublishOptions {
  attributeOverrides?: Record<string, AttributeOverride>
}

/** Estados de aviso (sección 8). 'eliminado' es irreversible. */
export type ApEstado = 'publicado' | 'suspendido' | 'reservado' | 'alquilado' | 'vendido' | 'entasacion' | 'historico' | 'eliminado'

export class ArgenpropAdapter implements PortalAdapter {
  readonly name = 'argenprop' as const

  constructor(
    public readonly enabled: boolean,
    private readonly creds?: ApCredentials,
  ) {}

  validate(property: Property): ValidationResult {
    return validateCommon(property)
  }

  private requireCreds(): ApCredentials {
    if (!this.creds) throw new PortalAdapterError('Argenprop credentials not resolved', 'argenprop', 'auth', false)
    return this.creds
  }

  /** Resuelve localidad + barrio. Hoy soporta CABA (LOCALIDAD_2102 + barrio). */
  private async resolveLocalizacion(property: Property): Promise<{ localidadId: string; barrioId: string | null }> {
    const creds = this.requireCreds()
    const cityRaw = (property.city ?? '').trim()
    const isCaba = !cityRaw || /caba|capital federal|ciudad aut[oó]noma/i.test(cityRaw)
    if (!isCaba) {
      throw new PortalAdapterError(
        `Por ahora la publicación en Argenprop soporta solo CABA (ciudad recibida: "${cityRaw}").`,
        'argenprop', 'validation', false,
      )
    }
    const barrioId = await resolveCabaBarrioId(creds, property.neighborhood)
    if (!barrioId) {
      throw new PortalAdapterError(
        `No se pudo resolver el barrio "${property.neighborhood}" en el catálogo de Argenprop (CABA). Revisá el barrio de la propiedad.`,
        'argenprop', 'validation', false,
      )
    }
    return { localidadId: CABA_LOCALIDAD_ID, barrioId }
  }

  async publish(property: Property, opts: ApPublishOptions = {}): Promise<PublishResult> {
    const v = this.validate(property)
    if (!v.ok) throw new PortalAdapterError(`Validación falló: ${v.errors.join(', ')}`, 'argenprop', 'validation', false)
    const creds = this.requireCreds()
    const codigo = apCodigo(property)
    const { localidadId, barrioId } = await this.resolveLocalizacion(property)
    const dto = propertyToAvisoDto(property, {
      idAnunciante: creds.idAnunciante, codigo, localidadId, barrioId,
      attributeOverrides: opts.attributeOverrides,
    })

    let avisoId: number | undefined
    try {
      const r = await apFetch<number>(creds, '/v1/avisos', { method: 'POST', body: JSON.stringify(dto) })
      avisoId = r.Result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // ENT002 = ya existe un aviso con ese código → es una re-publicación → PUT (update).
      if (/ENT002|ya existe un aviso/i.test(msg)) {
        const r = await apFetch<number>(creds, '/v1/avisos', { method: 'PUT', body: JSON.stringify(dto) })
        avisoId = r.Result
      } else {
        throw err
      }
    }

    return {
      externalId: codigo, // el Codigo es nuestro handle para estados/lecturas
      externalUrl: '',    // la API no devuelve URL pública directa; se completa si GET la expone
      metadata: { avisoId, codigo },
    }
  }

  /** Update = PUT /v1/avisos con el mismo JSON; el aviso se identifica por Codigo. */
  async update(property: Property, _externalId: string, opts: ApPublishOptions = {}): Promise<void> {
    const v = this.validate(property)
    if (!v.ok) throw new PortalAdapterError(`Validación falló: ${v.errors.join(', ')}`, 'argenprop', 'validation', false)
    const creds = this.requireCreds()
    const codigo = apCodigo(property)
    const { localidadId, barrioId } = await this.resolveLocalizacion(property)
    const dto = propertyToAvisoDto(property, {
      idAnunciante: creds.idAnunciante, codigo, localidadId, barrioId,
      attributeOverrides: opts.attributeOverrides,
    })
    await apFetch(creds, '/v1/avisos', { method: 'PUT', body: JSON.stringify(dto) })
  }

  /** Cambia el estado del aviso. `externalId` = Codigo. */
  async setEstado(externalId: string, estado: ApEstado): Promise<void> {
    const creds = this.requireCreds()
    await apFetch(creds, `/v1/avisos/${encodeURIComponent(externalId)}/estado/${estado}`, { method: 'PUT' })
  }

  /** unpublish = suspender (reversible). Para borrar definitivo usar setEstado(.,'eliminado'). */
  async unpublish(externalId: string): Promise<void> {
    await this.setEstado(externalId, 'suspendido')
  }

  /** Re-publica un aviso suspendido (vuelve a Vigente). */
  async republicar(externalId: string): Promise<void> {
    await this.setEstado(externalId, 'publicado')
  }

  async fetchMetrics(_externalId: string, _since: Date): Promise<PortalMetricsPoint[]> {
    return [] // la API v1 no expone métricas de avisos.
  }
}
