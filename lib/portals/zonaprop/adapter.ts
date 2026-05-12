import type {
  PortalAdapter,
  Property,
  PublishResult,
  PortalMetricsPoint,
  ValidationResult,
} from '../types'
import { PortalAdapterError } from '../types'

// Stub temporal — implementación real en M6.
export class ZonapropAdapter implements PortalAdapter {
  readonly name = 'zonaprop' as const
  constructor(public readonly enabled: boolean) {}

  validate(): ValidationResult {
    return { ok: false, errors: ['ZonaProp no implementado aún'], warnings: [] }
  }
  async publish(_p: Property): Promise<PublishResult> {
    throw new PortalAdapterError('ZonaProp no implementado', 'zonaprop', 'unknown', false)
  }
  async update(): Promise<void> {
    throw new PortalAdapterError('ZonaProp no implementado', 'zonaprop', 'unknown', false)
  }
  async unpublish(): Promise<void> {
    throw new PortalAdapterError('ZonaProp no implementado', 'zonaprop', 'unknown', false)
  }
  async fetchMetrics(): Promise<PortalMetricsPoint[]> {
    return []
  }
}
