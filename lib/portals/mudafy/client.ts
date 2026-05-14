import { PortalAdapterError } from '../types'

// Mudafy: real estate tech argentina (post-fusion con Properati/Compass).
// Tienen API moderna. Endpoint a confirmar con doc oficial al recibir creds.
const MUDAFY_BASE = process.env.MUDAFY_API_BASE ?? 'https://api.mudafy.com/v1'

export async function mFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const apiKey = process.env.MUDAFY_API_KEY
  const clientCode = process.env.MUDAFY_CLIENT_CODE
  if (!apiKey || !clientCode) {
    throw new PortalAdapterError(
      'Missing Mudafy credentials',
      'mudafy',
      'auth',
      false,
    )
  }
  const res = await fetch(`${MUDAFY_BASE}${path}`, {
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
      `Mudafy ${res.status} ${path}: ${text}`,
      'mudafy',
      res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  return res.json() as Promise<T>
}
