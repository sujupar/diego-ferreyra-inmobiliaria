/**
 * Las cuentas conectadas (YouTube, TikTok) y sus llaves. Las llaves viven en
 * `publicacion_conexiones`, con RLS y SIN políticas: solo este código (clave de
 * servicio) las lee, y nunca viajan al navegador ni a los registros.
 */
import { publicacionesDb } from '../db'
import { ConexionVencida, refrescarGoogle, type ConfigGoogle, type TokensGoogle } from '../oauth/google'

export type RedConectable = 'youtube' | 'tiktok'

/** La cookie con el nonce del `state` (ver `oauth/estado.ts`): una por red, para que no se pisen. */
export const cookieNonce = (red: RedConectable) => `pub_oauth_${red}`

export interface ResumenConexion {
  plataforma: RedConectable
  conectada: boolean
  cuenta: string | null
  desde: string | null
}

export function urlBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar').replace(/\/+$/, '')
}

/** `null` si faltan las variables: la pantalla dice "no configurado" en vez de mandar a un error de Google. */
export function configGoogle(): ConfigGoogle | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, redirectUri: `${urlBase()}/api/oauth/google/callback` }
}

export interface ConfigTiktok {
  clientKey: string
  clientSecret: string
  redirectUri: string
}

export function configTiktok(): ConfigTiktok | null {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim()
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim()
  if (!clientKey || !clientSecret) return null
  return { clientKey, clientSecret, redirectUri: `${urlBase()}/api/oauth/tiktok/callback` }
}

export async function guardarConexion(plataforma: RedConectable, cuenta: string, tokens: object, usuarioId: string): Promise<void> {
  const { error } = await publicacionesDb()
    .from('publicacion_conexiones')
    .upsert({ plataforma, cuenta, tokens, conectada_por: usuarioId, updated_at: new Date().toISOString() }, { onConflict: 'plataforma' })
  if (error) throw new Error(`DB: ${error.message}`)
}

export async function desconectar(plataforma: RedConectable): Promise<void> {
  const { error } = await publicacionesDb().from('publicacion_conexiones').delete().eq('plataforma', plataforma)
  if (error) throw new Error(`DB: ${error.message}`)
}

export async function resumenConexiones(): Promise<ResumenConexion[]> {
  const { data, error } = await publicacionesDb()
    .from('publicacion_conexiones')
    .select('plataforma, cuenta, updated_at, tokens')
    .in('plataforma', ['youtube', 'tiktok'])
  if (error) throw new Error(`DB: ${error.message}`)
  const filas = new Map((data ?? []).map((f) => [f.plataforma as string, f]))
  return (['youtube', 'tiktok'] as const).map((p) => {
    const f = filas.get(p)
    // Se informa SI hay llave, nunca la llave.
    return { plataforma: p, conectada: !!f?.tokens, cuenta: (f?.cuenta as string | null) ?? null, desde: (f?.updated_at as string | null) ?? null }
  })
}

/** Margen para no mandar una llave que vence en medio de una subida. */
const MARGEN_MS = 2 * 60_000

/**
 * La llave vigente de YouTube, renovándola si vence pronto. Tira `ConexionVencida`
 * si no hay cuenta conectada o si Google revocó el permiso: el publicador lo
 * muestra como "Conectá YouTube" en la fila del video.
 */
export async function llaveDeYoutube(ahora: Date): Promise<string> {
  const config = configGoogle()
  if (!config) throw new ConexionVencida('Falta configurar la conexión con Google. Avisale al administrador.')
  const db = publicacionesDb()
  const { data, error } = await db.from('publicacion_conexiones').select('tokens').eq('plataforma', 'youtube').maybeSingle()
  if (error) throw new Error(`DB: ${error.message}`)
  const t = data?.tokens as TokensGoogle | null | undefined
  if (!t?.refresh_token) throw new ConexionVencida('YouTube no está conectado. Conectalo en Ajustes de Publicaciones.')
  if (t.access_token && Date.parse(t.expira_en) - ahora.getTime() > MARGEN_MS) return t.access_token
  const nueva = await refrescarGoogle(config, t.refresh_token, ahora)
  const { error: e2 } = await db
    .from('publicacion_conexiones')
    .update({ tokens: { ...t, ...nueva }, updated_at: ahora.toISOString() })
    .eq('plataforma', 'youtube')
  if (e2) console.error('[publicaciones] no se pudo guardar la llave renovada de YouTube', e2.message)
  return nueva.access_token
}
