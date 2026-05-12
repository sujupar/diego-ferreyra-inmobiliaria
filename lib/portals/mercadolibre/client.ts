import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { PortalAdapterError } from '../types'

const ML_BASE = 'https://api.mercadolibre.com'

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Obtiene el access_token de DB. Si está cerca de expirar (<1h), refresca.
 */
async function getAccessToken(): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('portal_credentials')
    .select('*')
    .eq('portal', 'mercadolibre')
    .maybeSingle()

  if (error || !data) {
    throw new PortalAdapterError('No ML credentials in DB', 'mercadolibre', 'auth', false)
  }
  if (!data.enabled) {
    throw new PortalAdapterError('ML disabled', 'mercadolibre', 'auth', false)
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  const expiresSoon = expiresAt - Date.now() < 60 * 60 * 1000 // 1h

  if (!data.access_token || expiresSoon) {
    if (!data.refresh_token) {
      throw new PortalAdapterError('No refresh_token', 'mercadolibre', 'auth', false)
    }
    return refreshToken(data.refresh_token)
  }
  return data.access_token
}

async function refreshToken(refresh: string): Promise<string> {
  const appId = process.env.ML_APP_ID
  const secret = process.env.ML_SECRET_KEY
  if (!appId || !secret) {
    throw new PortalAdapterError('Missing ML env vars', 'mercadolibre', 'auth', false)
  }
  const res = await fetch(`${ML_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: appId,
      client_secret: secret,
      refresh_token: refresh,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new PortalAdapterError(
      `ML refresh failed: ${text}`,
      'mercadolibre',
      'auth',
      false,
    )
  }
  const data = await res.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }
  const supabase = getSupabase()
  await supabase.from('portal_credentials').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq('portal', 'mercadolibre')
  return data.access_token
}

export async function mlFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${ML_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    const retryable = res.status >= 500 || res.status === 429
    throw new PortalAdapterError(
      `ML ${res.status} ${path}: ${text}`,
      'mercadolibre',
      res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  return res.json() as Promise<T>
}
