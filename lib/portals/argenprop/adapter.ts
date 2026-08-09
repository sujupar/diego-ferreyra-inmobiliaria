import { apFetch } from './client'
import { propertyToAvisoDto } from './mapping'
import { apCodigo, apPublicUrl, type AttributeOverride } from './field-schema'
import {
  resolveCabaBarrioId,
  resolveBarrioId,
  matchLocalizacion,
  getProvincias,
  getPartidos,
  getLocalidadesDePartido,
  CABA_LOCALIDAD_ID,
} from './catalog'
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

  /**
   * Resuelve localidad + barrio contra el catálogo de localización de AP.
   *
   * CABA: localidad fija 2102 y el barrio es OBLIGATORIO (regla de la API).
   * Resto del país: provincia → partido → localidad, matcheando los campos de
   * la ficha contra el catálogo real (jerarquía verificada en vivo 2026-08-06);
   * el barrio ahí es opcional. Antes esto lanzaba "solo CABA".
   *
   * Cada paso que no resuelve tira un error en castellano que nombra el CAMPO
   * de la ficha y el valor recibido — nunca IDs internos del catálogo.
   */
  private async resolveLocalizacion(property: Property): Promise<{ localidadId: string; barrioId: string | null }> {
    const creds = this.requireCreds()
    const prov = (property.province ?? '').trim()
    const cityRaw = (property.city ?? '').trim()

    // ── Camino CABA ──
    // Se decide por lo que DICE la ficha (provincia/ciudad). El fallback "el
    // barrio resuelve en el catálogo de CABA" solo aplica si la provincia está
    // vacía: una ficha de provincia con un barrio homónimo a uno porteño no
    // debe terminar publicada en Capital.
    // OJO: "caba" con límites de palabra (\b) — como substring pelado matchea
    // "Cabana" y "Cabalango" (localidades reales de Córdoba) y las mandaba al
    // camino CABA. "Ciudad de Buenos Aires" también es CABA: sin esta entrada
    // caía al camino provincial y el matcher la resolvía como PROVINCIA de
    // Buenos Aires. Ambos hallazgos del review adversarial 2026-08-06.
    const dicenCaba =
      /^caba$/i.test(prov) ||
      /\bcaba\b|capital federal|ciudad aut[oó]noma|ciudad de buenos aires/i.test(`${prov} ${cityRaw}`)
    const barrioCaba = dicenCaba || !prov ? await resolveCabaBarrioId(creds, property.neighborhood) : null
    if (dicenCaba || (!prov && barrioCaba)) {
      if (!barrioCaba) {
        throw new PortalAdapterError(
          `No se pudo resolver el barrio "${property.neighborhood ?? '—'}" en el catálogo de Argenprop (en CABA el barrio es obligatorio). Revisá el barrio de la propiedad.`,
          'argenprop', 'validation', false,
        )
      }
      return { localidadId: CABA_LOCALIDAD_ID, barrioId: barrioCaba }
    }

    if (!prov) {
      throw new PortalAdapterError(
        `Cargá la provincia en la ficha para publicar en Argenprop fuera de CABA (ciudad recibida: "${cityRaw || '—'}").`,
        'argenprop', 'validation', false,
      )
    }

    // ── Camino provincial: provincia → partido → localidad ──
    const provincias = await getProvincias(creds)
    const provincia = matchLocalizacion(provincias, prov)
    if (!provincia) {
      throw new PortalAdapterError(
        `No se encontró la provincia "${prov}" en el catálogo de Argenprop. Revisá el campo Provincia de la ficha.`,
        'argenprop', 'validation', false,
      )
    }

    if (!cityRaw) {
      throw new PortalAdapterError(
        `Cargá la ciudad en la ficha para publicar en Argenprop (provincia: "${provincia.Nombre ?? prov}").`,
        'argenprop', 'validation', false,
      )
    }

    const partidos = await getPartidos(creds, provincia.Id)
    const partido = matchLocalizacion(partidos, cityRaw)
    if (!partido) {
      throw new PortalAdapterError(
        `No se encontró el partido/ciudad "${cityRaw}" en ${provincia.Nombre ?? prov} según el catálogo de Argenprop. Revisá el campo Ciudad de la ficha.`,
        'argenprop', 'validation', false,
      )
    }

    const localidades = await getLocalidadesDePartido(creds, partido.Id)
    // La localidad suele llamarse igual que la ciudad ("Roque Pérez" dentro de
    // "Partido de Roque Pérez"). Si no matchea pero el partido tiene UNA sola
    // localidad, esa es; con varias y sin match, error con el dato recibido.
    const localidad = matchLocalizacion(localidades, cityRaw)
      ?? (localidades.length === 1 ? localidades[0] : null)
    if (!localidad) {
      throw new PortalAdapterError(
        `La ciudad "${cityRaw}" no aparece como localidad de ${partido.Nombre ?? cityRaw} en el catálogo de Argenprop. Revisá el campo Ciudad de la ficha.`,
        'argenprop', 'validation', false,
      )
    }

    // Fuera de CABA el barrio es opcional: si no resuelve, se publica sin barrio.
    const barrioId = await resolveBarrioId(creds, localidad.Id, property.neighborhood)
    return { localidadId: localidad.Id, barrioId }
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
      externalUrl: avisoId ? apPublicUrl(property, avisoId) : '',
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
