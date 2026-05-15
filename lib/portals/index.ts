import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { registerAdapter, listAdapters, getAdapter, clearRegistry } from './registry'
import { resolveCredentials } from './credentials'
import { MercadoLibreAdapter } from './mercadolibre/adapter'
import { ArgenpropAdapter } from './argenprop/adapter'
import { ZonapropAdapter } from './zonaprop/adapter'

let initialized = false

/**
 * Inicializa el registry con los 3 adapters. Cada uno resuelve su flag
 * `enabled` desde env vars + DB. Re-llamar es no-op.
 *
 * El worker scheduled function llama a esto en cada tick (idempotente).
 */
export async function initPortals(force = false): Promise<void> {
  if (initialized && !force) return
  if (force) clearRegistry()

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [mlCreds, apCreds, zpCreds] = await Promise.all([
    resolveCredentials('mercadolibre', { env: process.env, supabase }),
    resolveCredentials('argenprop', { env: process.env, supabase }),
    resolveCredentials('zonaprop', { env: process.env, supabase }),
  ])

  registerAdapter(new MercadoLibreAdapter(mlCreds.enabled))
  registerAdapter(new ArgenpropAdapter(apCreds.enabled))
  registerAdapter(new ZonapropAdapter(zpCreds.enabled))

  initialized = true
}

export { listAdapters, getAdapter }
