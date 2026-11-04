import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { camposParaAlta, escuchaComentariosDeFacebook, paginaRecibeFeed } from '@/lib/integrations/facebook/suscripcion'
import { urlBase } from '@/lib/publicaciones/servidor/conexiones'

/**
 * Da de alta (POST) o consulta (GET) que Meta nos avise de los comentarios de la Página
 * de Facebook.
 *
 * Por qué es una ruta y no el script `suscribir-webhook-instagram.ts`: el alta exige la
 * clave de verificación del webhook (`INSTAGRAM_WEBHOOK_VERIFY_TOKEN`), que en Netlify
 * es secreta y no se puede copiar. Acá la usa el servidor desde sus propias variables,
 * la misma que ya verifica los avisos de Instagram, y no viaja a ningún lado.
 *
 * Solo toca la suscripción de la APP (objeto `page`, campo `feed`). La de la Página NO
 * se toca: ya tiene `feed,messages` y volver a mandarla con otros campos los reemplaza
 * (se perderían los privados).
 */
const ROLES = ['admin', 'dueno']
const API = 'https://graph.facebook.com/v21.0'
const TECHO_MS = 8_000

async function pedir(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TECHO_MS) })
  const texto = await res.text()
  try {
    return JSON.parse(texto) as Record<string, unknown>
  } catch {
    return { error: { message: `Meta respondió algo que no es JSON (estado ${res.status})` } }
  }
}

function mensajeDeError(r: Record<string, unknown>): string | null {
  const e = r.error as { message?: string; code?: number } | undefined
  return e ? `${e.message ?? 'error de Meta'}${e.code ? ` (código ${e.code})` : ''}` : null
}

async function estado(appId: string, appSecret: string, direccion: string) {
  const app = await pedir(`${API}/${appId}/subscriptions?access_token=${appId}|${appSecret}`)
  const errorApp = mensajeDeError(app)
  if (errorApp) throw new Error(`No pude leer las suscripciones de la app: ${errorApp}`)

  let pagina: boolean | null = null
  const token = process.env.META_ACCESS_TOKEN
  if (token) {
    const cuentas = await pedir(`${API}/me/accounts?fields=id,access_token&access_token=${token}`)
    const primera = (cuentas.data as Array<{ id?: string; access_token?: string }> | undefined)?.[0]
    if (primera?.id && primera.access_token) {
      const apps = await pedir(`${API}/${primera.id}/subscribed_apps?access_token=${primera.access_token}`)
      pagina = paginaRecibeFeed(apps.data, appId)
    }
  }
  return { app: escuchaComentariosDeFacebook(app.data, direccion), pagina, direccion }
}

async function preparar() {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return { respuesta: NextResponse.json({ error: auth.error }, { status: auth.status }) }
  if (!ROLES.includes(auth.user.profile.role)) {
    return { respuesta: NextResponse.json({ error: 'Solo admin o dueño' }, { status: 403 }) }
  }
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN
  if (!appId || !appSecret || !verifyToken) {
    return { respuesta: NextResponse.json({ error: 'Faltan variables de Meta en el servidor' }, { status: 503 }) }
  }
  return { appId, appSecret, verifyToken, direccion: `${urlBase()}/api/webhooks/instagram` }
}

export async function GET() {
  const p = await preparar()
  if ('respuesta' in p) return p.respuesta
  try {
    return NextResponse.json(await estado(p.appId, p.appSecret, p.direccion))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo consultar a Meta' }, { status: 502 })
  }
}

export async function POST() {
  const p = await preparar()
  if ('respuesta' in p) return p.respuesta
  try {
    const actuales = await pedir(`${API}/${p.appId}/subscriptions?access_token=${p.appId}|${p.appSecret}`)
    const errorLectura = mensajeDeError(actuales)
    if (errorLectura) return NextResponse.json({ error: `No pude leer las suscripciones de la app: ${errorLectura}` }, { status: 502 })
    // Ya está: no se vuelve a mandar nada.
    if (escuchaComentariosDeFacebook(actuales.data, p.direccion)) {
      return NextResponse.json({ ok: true, yaEstaba: true, ...(await estado(p.appId, p.appSecret, p.direccion)) })
    }
    // Meta llama a la dirección con el desafío en este mismo momento; la contesta la ruta del webhook.
    // Los campos van unidos con los que ya tenía: Meta REEMPLAZA la lista del objeto.
    const alta = await pedir(`${API}/${p.appId}/subscriptions?access_token=${p.appId}|${p.appSecret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ object: 'page', callback_url: p.direccion, fields: camposParaAlta(actuales.data), verify_token: p.verifyToken }),
    })
    const errorAlta = mensajeDeError(alta)
    if (errorAlta) return NextResponse.json({ error: `Meta rechazó el alta: ${errorAlta}` }, { status: 502 })
    return NextResponse.json({ ok: true, ...(await estado(p.appId, p.appSecret, p.direccion)) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo hablar con Meta' }, { status: 502 })
  }
}
