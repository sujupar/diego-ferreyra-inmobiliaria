import { PortalAdapterError } from '../types'

// Properati fue adquirido por Mudafy/Compass. La API es parte del ecosistema
// Mudafy pero mantiene un endpoint propio para legacy. Base URL a confirmar
// con la doc oficial al recibir credenciales.
const PROPERATI_BASE = process.env.PROPERATI_API_BASE ?? 'https://api.properati.com.ar/v1'

export async function pFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const apiKey = process.env.PROPERATI_API_KEY
  const clientCode = process.env.PROPERATI_CLIENT_CODE
  if (!apiKey || !clientCode) {
    throw new PortalAdapterError(
      'Missing Properati credentials',
      'properati',
      'auth',
      false,
    )
  }
  const res = await fetch(`${PROPERATI_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'x-client-code': clientCode,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    const retryable = res.status >= 500 || res.status === 429
    throw new PortalAdapterError(
      `Properati ${res.status} ${path}: ${text}`,
      'properati',
      res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  return res.json() as Promise<T>
}
