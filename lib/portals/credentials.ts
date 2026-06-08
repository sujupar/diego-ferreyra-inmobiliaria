import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { PortalName } from './types'

export interface ApCredentials {
  publishUrl: string
  usr: string
  psd: string
  idSistema: string
  idVendedor: string
  idOrigen: string
  userAgent: string
}

export interface ResolvedCredentials {
  portal: PortalName
  enabled: boolean
  appId?: string
  secretKey?: string
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  clientCode?: string
  ap?: ApCredentials            // <-- nuevo
  metadata: Record<string, unknown>
}

interface ResolveOpts {
  env: Record<string, string | undefined>
  supabase: SupabaseClient<Database>
}

const ENV_MAP: Record<
  PortalName,
  { appId?: string; secret?: string; apiKey?: string; clientCode?: string; ap?: true }
> = {
  mercadolibre: { appId: 'ML_APP_ID', secret: 'ML_SECRET_KEY' },
  argenprop: { ap: true },
  zonaprop: { apiKey: 'ZONAPROP_API_KEY', clientCode: 'ZONAPROP_CLIENT_CODE' },
}

/**
 * Resuelve credenciales para un portal mezclando env vars (prioridad) + DB.
 * Un portal está enabled si:
 *  - tiene flag enabled=true en DB, O
 *  - tiene las env vars mínimas para ese portal.
 *
 * Las env vars siempre tienen prioridad sobre los valores de DB (ej. para
 * rotar tokens manualmente).
 */
export async function resolveCredentials(
  portal: PortalName,
  opts: ResolveOpts,
): Promise<ResolvedCredentials> {
  const envKeys = ENV_MAP[portal]
  const env = opts.env

  const fromEnv = {
    appId: envKeys.appId ? env[envKeys.appId] : undefined,
    secretKey: envKeys.secret ? env[envKeys.secret] : undefined,
    apiKey: envKeys.apiKey ? env[envKeys.apiKey] : undefined,
    clientCode: envKeys.clientCode ? env[envKeys.clientCode] : undefined,
  }

  const { data: row } = await opts.supabase
    .from('portal_credentials')
    .select('*')
    .eq('portal', portal)
    .maybeSingle()

  const accessToken = row?.access_token ?? undefined
  const refreshToken = row?.refresh_token ?? undefined
  const metadata = (row?.metadata as Record<string, unknown>) ?? {}

  const ap: ApCredentials | undefined = portal === 'argenprop'
    ? {
        publishUrl: env.ARGENPROP_PUBLISH_URL ?? '',
        usr: env.ARGENPROP_USR ?? '',
        psd: env.ARGENPROP_PSD ?? '',
        idSistema: env.ARGENPROP_ID_SISTEMA ?? '',
        idVendedor: env.ARGENPROP_ID_VENDEDOR ?? '',
        idOrigen: env.ARGENPROP_ID_ORIGEN ?? '',
        userAgent: env.ARGENPROP_USER_AGENT ?? 'diego-ferreyra-crm',
      }
    : undefined

  const envEnabled =
    portal === 'mercadolibre'
      ? Boolean(fromEnv.appId && fromEnv.secretKey)
      : portal === 'argenprop'
        ? Boolean(ap?.usr && ap?.psd && ap?.publishUrl)
        : Boolean(fromEnv.apiKey && fromEnv.clientCode)

  // Para ML necesitamos además que haya access_token en DB (después del OAuth flow)
  const mlReady = portal === 'mercadolibre' ? Boolean(accessToken) : true
  const enabled = (Boolean(row?.enabled) || envEnabled) && mlReady

  return {
    portal,
    enabled,
    appId: fromEnv.appId,
    secretKey: fromEnv.secretKey,
    accessToken,
    refreshToken,
    apiKey: fromEnv.apiKey,
    clientCode: fromEnv.clientCode,
    ap,
    metadata,
  }
}
