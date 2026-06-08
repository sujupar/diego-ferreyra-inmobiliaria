import { apPublish } from './client'
import { propertyToApForm } from './mapping'
import { apAvisoId } from './field-schema'
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
  attributeOverrides?: Record<string, { value_name?: string; value_id?: string }>
}

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
    if (!this.creds) {
      throw new PortalAdapterError('Argenprop credentials not resolved', 'argenprop', 'auth', false)
    }
    return this.creds
  }

  async publish(property: Property, opts: ApPublishOptions = {}): Promise<PublishResult> {
    const v = this.validate(property)
    if (!v.ok) {
      throw new PortalAdapterError(`Validación falló: ${v.errors.join(', ')}`, 'argenprop', 'validation', false)
    }
    const creds = this.requireCreds()
    const idOrigen = apAvisoId(property)
    const form = propertyToApForm(property, { creds, idOrigen, estado: 'Activo', attributeOverrides: opts.attributeOverrides })
    const res = await apPublish(form, creds)
    // CONTRACT ASSUMPTION: el aviso público no devuelve URL directa en v4.0. Guardamos
    // los visibilidadIds; la URL pública se resuelve/ajusta en el probe. Best-effort:
    const externalUrl = res.visibilidadIds[0]
      ? `https://www.argenprop.com/${res.visibilidadIds[0]}`
      : ''
    return {
      externalId: idOrigen,
      externalUrl,
      metadata: { visibilidadIds: res.visibilidadIds },
    }
  }

  /** Update = re-POST con el mismo IdOrigen (upsert idempotente). */
  async update(property: Property, _externalId: string): Promise<void> {
    const creds = this.requireCreds()
    const idOrigen = apAvisoId(property)
    const form = propertyToApForm(property, { creds, idOrigen, estado: 'Activo' })
    await apPublish(form, creds)
  }

  /**
   * Baja = re-POST con Estado=Baja. Necesita reconstruir el form mínimo con el
   * mismo IdOrigen. `externalId` ES el idOrigen que guardamos al publicar.
   */
  async unpublish(externalId: string): Promise<void> {
    const creds = this.requireCreds()
    // Para la baja Argenprop solo necesita identificar el aviso por IdOrigen + vendedor.
    // CONTRACT ASSUMPTION: alcanza con un form mínimo. Si el probe muestra que exige
    // el aviso completo, reconstruir desde la propiedad (el worker/route tienen el row).
    const form = {
      usr: creds.usr,
      psd: creds.psd,
      'aviso.IdOrigen': externalId,
      'aviso.Estado': 'Baja',
      'aviso.Vendedor.SistemaOrigen.Id': creds.idSistema,
      'aviso.Vendedor.IdOrigen': creds.idVendedor,
    }
    await apPublish(form, creds)
  }

  async fetchMetrics(_externalId: string, _since: Date): Promise<PortalMetricsPoint[]> {
    // CONTRACT ASSUMPTION: PublicarIntranet no expone métricas. Devolvemos vacío.
    return []
  }
}
