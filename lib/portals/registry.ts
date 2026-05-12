import type { PortalAdapter, PortalName } from './types'

const registry = new Map<PortalName, PortalAdapter>()

export function registerAdapter(adapter: PortalAdapter): void {
  registry.set(adapter.name, adapter)
}

export function getAdapter(name: PortalName): PortalAdapter | undefined {
  return registry.get(name)
}

export function listAdapters(): PortalAdapter[] {
  return Array.from(registry.values())
}

export function clearRegistry(): void {
  registry.clear()
}
