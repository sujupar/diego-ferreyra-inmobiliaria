import type {
  PortalAdapter,
  Property,
  PublishResult,
  PortalMetricsPoint,
  ValidationResult,
} from '../types'
import { PortalAdapterError } from '../types'

// Stub temporal — la implementación real llega en M5 (ya con mapping + client).
// Existe para que el registry pueda registrar los 3 adapters desde día 1
// y los jobs queden en 'pending' (en vez de fallar) cuando enabled=false.
export class ArgenpropAdapter implements PortalAdapter {
  readonly name = 'argenprop' as const
  constructor(public readonly enabled: boolean) {}

  validate(): ValidationResult {
    return { ok: false, errors: ['Argenprop no implementado aún'], warnings: [] }
  }
  async publish(_p: Property): Promise<PublishResult> {
    throw new PortalAdapterError('Argenprop no implementado', 'argenprop', 'unknown', false)
  }
  async update(): Promise<void> {
    throw new PortalAdapterError('Argenprop no implementado', 'argenprop', 'unknown', false)
  }
  async unpublish(): Promise<void> {
    throw new PortalAdapterError('Argenprop no implementado', 'argenprop', 'unknown', false)
  }
  async fetchMetrics(): Promise<PortalMetricsPoint[]> {
    return []
  }
}
