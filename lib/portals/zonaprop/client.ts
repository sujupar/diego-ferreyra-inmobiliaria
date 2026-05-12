import { PortalAdapterError } from '../types'

// Base URL del "nuevo sistema sincrónico" — confirmar al recibir credenciales.
const ZP_BASE = process.env.ZONAPROP_API_BASE ?? 'https://api.zonaprop.com.ar/v2'

export async function zpFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const apiKey = process.env.ZONAPROP_API_KEY
  const clientCode = process.env.ZONAPROP_CLIENT_CODE
  if (!apiKey || !clientCode) {
    throw new PortalAdapterError(
      'Missing ZP credentials',
      'zonaprop',
      'auth',
      false,
    )
  }
  const res = await fetch(`${ZP_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'x-client-code': clientCode,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    const retryable = res.status >= 500 || res.status === 429
    throw new PortalAdapterError(
      `ZP ${res.status} ${path}: ${text}`,
      'zonaprop',
      res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  return res.json() as Promise<T>
}
