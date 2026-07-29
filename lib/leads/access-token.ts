/**
 * Token de acceso por persona ("el hash" del flujo de recorrido).
 *
 * Abre `/v/<token>`: muestra el recorrido de la propiedad y permite proponer
 * día y hora SIN volver a pedir los datos (quedan congelados acá al registrarse).
 *
 * No es un mecanismo de seguridad fuerte: expone la media de UNA propiedad y un
 * nombre. Es opaco y no adivinable a la escala de este negocio.
 */
import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'node:crypto'

/** Sin O/0/I/l/1: el link se dicta y se copia a mano. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const TOKEN_LENGTH = 10

export function generateAccessToken(): string {
  let out = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

export function accessUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'
  return `${base.replace(/\/+$/, '')}/v/${token}`
}

export interface AccessTokenRow {
  token: string
  propertyId: string
  name: string
  email: string | null
  phone: string | null
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Crea el token. NUNCA lanza: si falla, el lead ya se guardó igual. */
export async function createAccessToken(input: {
  propertyId: string
  leadId: string | null
  name: string
  email: string | null
  phone: string | null
}): Promise<string | null> {
  try {
    const token = generateAccessToken()
    const { error } = await admin().from('lead_access_tokens').insert({
      token,
      property_id: input.propertyId,
      lead_id: input.leadId,
      name: input.name,
      email: input.email,
      phone: input.phone,
    })
    if (error) {
      console.warn('[access-token] no se pudo crear (continuando):', error.message)
      return null
    }
    return token
  } catch (err) {
    console.warn('[access-token] excepción creando (continuando):', err)
    return null
  }
}

export async function getAccessToken(token: string): Promise<AccessTokenRow | null> {
  try {
    const { data } = await admin()
      .from('lead_access_tokens')
      .select('token, property_id, name, email, phone')
      .eq('token', token)
      .maybeSingle()
    if (!data) return null
    const r = data as { token: string; property_id: string; name: string; email: string | null; phone: string | null }
    return { token: r.token, propertyId: r.property_id, name: r.name, email: r.email, phone: r.phone }
  } catch {
    return null
  }
}

/** Marca la 1ª apertura y suma al contador (medición). Best-effort. */
export async function markTokenOpened(token: string): Promise<void> {
  try {
    const sb = admin()
    const { data } = await sb
      .from('lead_access_tokens')
      .select('opened_at, open_count')
      .eq('token', token)
      .maybeSingle()
    const row = data as { opened_at: string | null; open_count: number } | null
    if (!row) return
    await sb
      .from('lead_access_tokens')
      .update({
        opened_at: row.opened_at ?? new Date().toISOString(),
        open_count: (row.open_count ?? 0) + 1,
      })
      .eq('token', token)
  } catch {
    /* medición: nunca romper la página por esto */
  }
}
