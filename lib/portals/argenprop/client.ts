import { PortalAdapterError } from '../types'

// Base URL — confirmar con la doc oficial al recibir credenciales.
const AP_BASE = process.env.ARGENPROP_API_BASE ?? 'https://api.argenprop.com/v1'

export async function apFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const apiKey = process.env.ARGENPROP_API_KEY
  const clientCode = process.env.ARGENPROP_CLIENT_CODE
  if (!apiKey || !clientCode) {
    throw new PortalAdapterError(
      'Missing AP credentials',
      'argenprop',
      'auth',
      false,
    )
  }
  const res = await fetch(`${AP_BASE}${path}`, {
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
      `AP ${res.status} ${path}: ${text}`,
      'argenprop',
      res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  return res.json() as Promise<T>
}
