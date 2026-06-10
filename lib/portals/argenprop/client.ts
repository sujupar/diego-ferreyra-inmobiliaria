import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { PortalAdapterError } from '../types'
import type { ApCredentials } from '../credentials'

/**
 * Cliente de la API REST de Argenprop (integradores.api.sosiva451.com, v1).
 *
 * Auth doble (sección 3 de la doc oficial):
 *   - X-Token-CRM: token fijo del integrador, en TODAS las llamadas (incluido login).
 *   - Authorization: Bearer <AuthenticationToken>: token del usuario, obtenido vía
 *     POST /v1/auth/login. NO vence → se cachea en portal_credentials.access_token.
 *
 * La mayoría de las respuestas usan el envoltorio ApiResult { Status, Result, Detail,
 * ErrorCode, Errors, Title, TraceId }. `apFetch` devuelve el body parseado entero;
 * cada caller extrae `.Result`. El login responde { AuthenticationToken } sin envoltorio.
 */

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Cache en memoria por proceso (evita pegar a DB en cada llamada dentro del mismo runtime).
let memoToken: string | null = null

interface ApiResult<T> {
  Status?: number
  Result?: T
  Detail?: string
  ErrorCode?: string
  Title?: string
  TraceId?: string
  Errors?: Record<string, string> | null
}

/** POST /v1/auth/login → AuthenticationToken (no vence). */
export async function login(creds: ApCredentials): Promise<string> {
  const res = await fetch(`${creds.apiBase}/v1/auth/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-Token-CRM': creds.tokenCrm,
    },
    body: JSON.stringify({ Usuario: creds.usr, Password: creds.psd }),
  })
  const text = await res.text()
  let json: { AuthenticationToken?: string } & ApiResult<unknown>
  try { json = JSON.parse(text) } catch { json = {} }
  const token = json.AuthenticationToken
  if (!res.ok || !token) {
    throw new PortalAdapterError(
      `Argenprop login falló (${res.status}): ${json.ErrorCode ?? ''} ${json.Detail ?? text.slice(0, 200)}`.trim(),
      'argenprop', 'auth', res.status >= 500,
    )
  }
  return token
}

/** Token de usuario cacheado (memoria → DB → login). */
export async function getAuthToken(creds: ApCredentials, forceRefresh = false): Promise<string> {
  if (!forceRefresh && memoToken) return memoToken
  const supabase = getSupabase()
  if (!forceRefresh) {
    const { data } = await supabase
      .from('portal_credentials').select('access_token')
      .eq('portal', 'argenprop').maybeSingle()
    if (data?.access_token) {
      memoToken = data.access_token
      return data.access_token
    }
  }
  const token = await login(creds)
  memoToken = token
  await supabase.from('portal_credentials').upsert(
    { portal: 'argenprop', access_token: token, updated_at: new Date().toISOString() },
    { onConflict: 'portal' },
  )
  return token
}

function clearAuthToken(): void {
  memoToken = null
}

/**
 * Llamada autenticada a la API. Setea X-Token-CRM + Bearer. Ante 401 (token de
 * usuario invalidado) reintenta UNA vez con login fresco. Lanza PortalAdapterError
 * con ErrorCode/Detail de la API ante !ok. Devuelve el body parseado (el caller
 * extrae `.Result`).
 */
export async function apFetch<T = unknown>(
  creds: ApCredentials,
  path: string,
  init: RequestInit = {},
  _isRetry = false,
): Promise<ApiResult<T>> {
  const token = await getAuthToken(creds)
  const res = await fetch(`${creds.apiBase}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-Token-CRM': creds.tokenCrm,
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let json: ApiResult<T>
  try { json = text ? JSON.parse(text) : {} } catch { json = {} as ApiResult<T> }

  if (res.status === 401 && !_isRetry) {
    // Token de usuario expirado/invalidado → relogin y reintento único.
    clearAuthToken()
    await getAuthToken(creds, true)
    return apFetch<T>(creds, path, init, true)
  }
  if (!res.ok) {
    const code = json.ErrorCode ?? ''
    const detail = json.Detail ?? json.Title ?? text.slice(0, 300)
    const errors = json.Errors ? ` ${JSON.stringify(json.Errors)}` : ''
    throw new PortalAdapterError(
      `Argenprop ${res.status} ${code} ${path}: ${detail}${errors}`.trim(),
      'argenprop',
      res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      res.status >= 500 || res.status === 429,
    )
  }
  return json
}

/** Helper: GET y devuelve el `.Result` (catálogos, localización, lecturas). */
export async function apGet<T = unknown>(creds: ApCredentials, path: string): Promise<T> {
  const json = await apFetch<T>(creds, path)
  return (json.Result ?? json) as T
}
