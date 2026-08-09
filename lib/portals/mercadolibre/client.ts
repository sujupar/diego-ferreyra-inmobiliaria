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
  const res = await fetchConTraduccion(path, init, token)
  return res as Promise<T>
}

/**
 * Traduce el error de ML a una frase que un asesor pueda entender.
 *
 * ML devuelve algo como
 *   {"cause":[{"code":"item.category_id.invalid","message":"Is not allowed to post
 *     in category MLA1472. Make sure you're posting in a leaf category"}],...}
 * y eso llegaba CRUDO hasta el toast de la pantalla. El 2026-08-06 el dueño vio
 * ese JSON en vivo durante una demo. El texto original se conserva entre
 * corchetes al final para poder diagnosticar.
 */
export function explicarErrorMl(status: number, cuerpo: string): string {
  if (status === 401 || status === 403) {
    return 'MercadoLibre rechazó las credenciales. Hay que volver a conectar la cuenta.'
  }
  if (status === 429) {
    return 'MercadoLibre está limitando la cantidad de pedidos. Reintentá en unos minutos.'
  }
  if (status >= 500) {
    return 'MercadoLibre tuvo un problema de su lado. Reintentá en unos minutos.'
  }

  let causas: { code?: string; message?: string }[] = []
  try {
    const j = JSON.parse(cuerpo) as { cause?: unknown; message?: string }
    causas = Array.isArray(j.cause) ? (j.cause as typeof causas) : []
    if (causas.length === 0 && j.message) causas = [{ message: j.message }]
  } catch {
    return `MercadoLibre rechazó el aviso (error ${status}).`
  }

  const traducidas = causas.map(c => {
    const code = c.code ?? ''
    if (code.includes('category_id')) {
      return 'La categoría de MercadoLibre no es válida para este tipo de propiedad. ' +
             'Avisale al equipo técnico: hay que revisar el mapeo de categorías.'
    }
    if (code.includes('listing_type')) {
      return 'El tipo de publicación elegido no está disponible para esta categoría o no quedan cupos.'
    }
    if (code.includes('picture')) return 'Hay un problema con las fotos del aviso.'
    if (code.includes('price')) return 'El precio del aviso no es válido para MercadoLibre.'
    if (code.includes('title')) return 'El título del aviso no cumple con lo que pide MercadoLibre.'
    if (code.includes('location') || code.includes('address')) {
      return 'La ubicación de la propiedad está incompleta o MercadoLibre no la reconoce.'
    }
    if (code.includes('attribute')) {
      return `Falta o está mal un campo que MercadoLibre exige${c.message ? ` (${c.message})` : ''}.`
    }
    return c.message ?? 'MercadoLibre rechazó el aviso.'
  })

  const unicas = [...new Set(traducidas)]
  return unicas.join(' ')
}

async function fetchConTraduccion(path: string, init: RequestInit, token: string): Promise<unknown> {
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
    // El `message` es lo que ve el asesor: castellano, sin JSON. El detalle
    // crudo va en `original` — se persiste en last_error para diagnosticar,
    // pero no se le muestra a nadie en una pantalla.
    throw new PortalAdapterError(
      explicarErrorMl(res.status, text),
      'mercadolibre',
      res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
      `ML ${res.status} ${path}: ${text}`,
    )
  }
  return res.json()
}
