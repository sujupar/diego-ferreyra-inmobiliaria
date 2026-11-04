/**
 * La cuenta de Google del canal de YouTube: autorizar, canjear el código y
 * renovar la llave (vence cada hora; la de renovación no vence mientras la app
 * esté "En producción" y nadie revoque el permiso).
 *
 * Permisos: solo subir videos y leer el canal. Nada de Drive: Drive se lee con
 * la clave de API (`drive/cliente.ts`).
 */
const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
export const ALCANCES_GOOGLE = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
]
const TECHO_MS = 8_000

export interface ConfigGoogle {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface TokensGoogle {
  access_token: string
  refresh_token: string
  expira_en: string
  scope?: string
}

/** El permiso se revocó o venció: la única salida es volver a tocar "Conectar YouTube". */
export class ConexionVencida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ConexionVencida'
  }
}

export function urlDeAutorizacionGoogle(c: ConfigGoogle, estado: string): string {
  const u = new URL(AUTORIZAR)
  u.searchParams.set('client_id', c.clientId)
  u.searchParams.set('redirect_uri', c.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', ALCANCES_GOOGLE.join(' '))
  // offline + consent: así Google SIEMPRE devuelve la llave de renovación (sin ella habría que reconectar cada hora).
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', estado)
  return u.toString()
}

async function pedirToken(cuerpo: Record<string, string>, f: typeof fetch): Promise<Record<string, unknown>> {
  const res = await f(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cuerpo).toString(),
    signal: AbortSignal.timeout(TECHO_MS),
  })
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    if (j.error === 'invalid_grant') throw new ConexionVencida('El permiso de YouTube venció o se revocó. Volvé a conectar YouTube.')
    throw new Error(`Google rechazó la conexión (${res.status}${typeof j.error === 'string' ? `: ${j.error}` : ''}).`)
  }
  return j
}

const vence = (ahora: Date, seg: unknown) => new Date(ahora.getTime() + (typeof seg === 'number' ? seg : 3600) * 1000).toISOString()

export async function canjearCodigoGoogle(c: ConfigGoogle, codigo: string, ahora: Date, f: typeof fetch = fetch): Promise<TokensGoogle> {
  let j: Record<string, unknown>
  try {
    j = await pedirToken(
      { code: codigo, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: 'authorization_code' },
      f,
    )
  } catch (e) {
    if (e instanceof ConexionVencida) throw new Error('Google rechazó el código de conexión. Probá conectar de nuevo.')
    throw e
  }
  if (typeof j.access_token !== 'string') throw new Error('Google no devolvió la llave de acceso.')
  if (typeof j.refresh_token !== 'string') {
    throw new Error('Google no devolvió la llave de renovación. Quitá el acceso de la app en tu cuenta de Google y conectá de nuevo.')
  }
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expira_en: vence(ahora, j.expires_in),
    ...(typeof j.scope === 'string' ? { scope: j.scope } : {}),
  }
}

export async function refrescarGoogle(
  c: ConfigGoogle,
  refreshToken: string,
  ahora: Date,
  f: typeof fetch = fetch,
): Promise<{ access_token: string; expira_en: string }> {
  const j = await pedirToken({ refresh_token: refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token' }, f)
  if (typeof j.access_token !== 'string') throw new Error('Google no devolvió la llave de acceso.')
  return { access_token: j.access_token, expira_en: vence(ahora, j.expires_in) }
}

export async function canalDeYoutube(accessToken: string, f: typeof fetch = fetch): Promise<{ id: string; titulo: string }> {
  const res = await f('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TECHO_MS),
  })
  if (!res.ok) throw new Error(`YouTube no dejó leer el canal (${res.status}).`)
  const j = (await res.json()) as { items?: { id?: string; snippet?: { title?: string } }[] }
  const canal = j.items?.[0]
  if (!canal?.id) throw new Error('Esa cuenta de Google no tiene un canal de YouTube. Conectá con la cuenta del canal.')
  return { id: canal.id, titulo: canal.snippet?.title ?? 'Canal de YouTube' }
}
