/**
 * La cuenta de TikTok: autorizar, canjear el código y renovar.
 *
 * Permisos: `video.upload` (mandar videos a la bandeja de borradores de la app,
 * desde donde se terminan de publicar) y `user.info.basic` (el nombre, para
 * mostrar qué cuenta quedó conectada). La llave vence a las 24 h; la de
 * renovación dura un año y TikTok la cambia en cada renovación.
 *
 * Trampa: TikTok responde algunos errores con HTTP 200 y un campo `error`.
 */
import { ConexionVencida } from './google'

const AUTORIZAR = 'https://www.tiktok.com/v2/auth/authorize/'
const TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/'
const TECHO_MS = 8_000

export interface ConfigTiktokOAuth {
  clientKey: string
  clientSecret: string
  redirectUri: string
}

export interface TokensTiktok {
  access_token: string
  refresh_token: string
  expira_en: string
  refresh_expira_en: string
  open_id: string
  scope?: string
}

export function urlDeAutorizacionTiktok(c: ConfigTiktokOAuth, estado: string): string {
  const u = new URL(AUTORIZAR)
  u.searchParams.set('client_key', c.clientKey)
  u.searchParams.set('scope', 'user.info.basic,video.upload')
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('redirect_uri', c.redirectUri)
  u.searchParams.set('state', estado)
  return u.toString()
}

const vence = (ahora: Date, seg: unknown, porDefecto: number) =>
  new Date(ahora.getTime() + (typeof seg === 'number' ? seg : porDefecto) * 1000).toISOString()

async function pedirToken(cuerpo: Record<string, string>, ahora: Date, f: typeof fetch): Promise<TokensTiktok> {
  const res = await f(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cuerpo).toString(),
    signal: AbortSignal.timeout(TECHO_MS),
  })
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof j.error === 'string') {
    if (j.error === 'invalid_grant') throw new ConexionVencida('El permiso de TikTok venció o se revocó. Volvé a conectar TikTok.')
    throw new Error(`TikTok rechazó la conexión (${res.status}${typeof j.error === 'string' ? `: ${j.error}` : ''}).`)
  }
  if (typeof j.access_token !== 'string' || typeof j.refresh_token !== 'string' || typeof j.open_id !== 'string') {
    throw new Error('TikTok no devolvió las llaves completas.')
  }
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expira_en: vence(ahora, j.expires_in, 86_400),
    refresh_expira_en: vence(ahora, j.refresh_expires_in, 31_536_000),
    open_id: j.open_id,
    ...(typeof j.scope === 'string' ? { scope: j.scope } : {}),
  }
}

export async function canjearCodigoTiktok(c: ConfigTiktokOAuth, codigo: string, ahora: Date, f: typeof fetch = fetch): Promise<TokensTiktok> {
  let t: TokensTiktok
  try {
    t = await pedirToken(
      { client_key: c.clientKey, client_secret: c.clientSecret, code: codigo, grant_type: 'authorization_code', redirect_uri: c.redirectUri },
      ahora,
      f,
    )
  } catch (e) {
    if (e instanceof ConexionVencida) throw new Error('TikTok rechazó el código de conexión. Probá conectar de nuevo.')
    throw e
  }
  // Si la persona destildó "subir videos" en la pantalla de TikTok, la conexión no sirve para nada.
  if (t.scope && !t.scope.split(',').includes('video.upload')) {
    throw new Error('Falta el permiso para subir videos. Conectá de nuevo y dejá marcado ese permiso.')
  }
  return t
}

export async function refrescarTiktok(c: ConfigTiktokOAuth, refreshToken: string, ahora: Date, f: typeof fetch = fetch): Promise<TokensTiktok> {
  return pedirToken({ client_key: c.clientKey, client_secret: c.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }, ahora, f)
}

export async function usuarioDeTiktok(accessToken: string, f: typeof fetch = fetch): Promise<string> {
  const res = await f('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TECHO_MS),
  })
  const j = (await res.json().catch(() => ({}))) as { data?: { user?: { display_name?: string } } }
  return j.data?.user?.display_name?.trim() || 'Cuenta de TikTok'
}
