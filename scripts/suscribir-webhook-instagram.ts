/**
 * Da de alta (o verifica) el webhook de Instagram en Meta.
 *
 * Sin esto, cuando alguien comenta un reel, Meta no nos avisa y NADA de la
 * automatización ocurre. Comprobado el 2026-09-22: la app no tenía ninguna
 * suscripción (`/{app}/subscriptions` vacío) y la página tampoco
 * (`subscribed_apps` vacío).
 *
 * Son DOS altas distintas y hacen falta las dos:
 *   1. La APP se suscribe al objeto `instagram` y declara la dirección de
 *      destino. Meta la llama en ese mismo momento con `hub.challenge`: si la
 *      ruta todavía no está deployada, RECHAZA el alta.
 *   2. La CUENTA (a través de su página) se suscribe a la app. Esta llamada
 *      exige el TOKEN DE LA PÁGINA — con el de usuario de sistema devuelve
 *      error 190: "en la nueva experiencia para páginas se necesita un token de
 *      acceso a la página". Verificado.
 *
 * Correr:
 *   node --env-file=.env.local --import tsx scripts/suscribir-webhook-instagram.ts --verificar
 *   node --env-file=.env.local --import tsx scripts/suscribir-webhook-instagram.ts
 *   node --env-file=.env.local --import tsx scripts/suscribir-webhook-instagram.ts --con-mensajes   (con pages_messaging)
 */

const API = 'https://graph.facebook.com/v21.0'
/** Lo que la APP escucha del objeto `instagram`. El toque del botón es una respuesta rápida: llega por `messages`. */
const CAMPOS = 'comments,messages'
/**
 * La PÁGINA no tiene campo `comments`: Meta lo rechaza con (#100) "Param
 * subscribed_fields[0] must be one of {feed, …, messages, …}". Para Instagram
 * alcanza con que la página tenga la app instalada, suscripta a un campo
 * cualquiera: `feed`.
 *
 * `messages` exige `pages_messaging` — sin él Meta responde (#200) "To subscribe
 * to the messages field, one of these permissions is needed: pages_messaging".
 * Por eso va aparte, con `--con-mensajes`, cuando el token lo tenga. Las dos
 * cosas verificadas el 2026-09-22.
 */
const CAMPOS_PAGINA = process.argv.includes('--con-mensajes') ? 'feed,messages' : 'feed'

interface RespuestaMeta {
  error?: { message?: string; code?: number; error_subcode?: number }
  [clave: string]: unknown
}

async function pedir(url: string, init?: RequestInit): Promise<RespuestaMeta> {
  const res = await fetch(url, init)
  const texto = await res.text()
  try {
    return JSON.parse(texto) as RespuestaMeta
  } catch {
    return { error: { message: `respuesta que no es JSON: ${texto.slice(0, 200)}` } }
  }
}

function exigir(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`falta ${nombre} (va en .env.local y en Netlify)`)
  return valor
}

async function tokenDePagina(token: string): Promise<{ pageId: string; pageToken: string }> {
  const r = await pedir(`${API}/me/accounts?fields=id,name,access_token&access_token=${token}`)
  const paginas = (r.data ?? []) as Array<{ id?: string; name?: string; access_token?: string }>
  const pagina = paginas[0]
  if (!pagina?.id || !pagina.access_token) {
    throw new Error(`no pude obtener el token de la página: ${JSON.stringify(r).slice(0, 300)}`)
  }
  console.log(`página: ${pagina.name} (${pagina.id})`)
  return { pageId: pagina.id, pageToken: pagina.access_token }
}

async function verificar(appId: string, appSecret: string, token: string): Promise<void> {
  const app = await pedir(`${API}/${appId}/subscriptions?access_token=${appId}|${appSecret}`)
  console.log('\nsuscripciones de la APP:', JSON.stringify(app.data ?? app.error ?? app))

  const { pageId, pageToken } = await tokenDePagina(token)
  const pag = await pedir(`${API}/${pageId}/subscribed_apps?access_token=${pageToken}`)
  console.log('apps suscritas a la PÁGINA:', JSON.stringify(pag.data ?? pag.error ?? pag))
}

async function main() {
  const soloVerificar = process.argv.includes('--verificar')

  const appId = exigir('META_APP_ID')
  const appSecret = exigir('META_APP_SECRET')
  const token = exigir('META_ACCESS_TOKEN')

  if (soloVerificar) {
    await verificar(appId, appSecret, token)
    return
  }

  const verifyToken = exigir('INSTAGRAM_WEBHOOK_VERIFY_TOKEN')
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar').replace(/\/+$/, '')
  const callback = `${base}/api/webhooks/instagram`

  // Se comprueba que la ruta esté viva ANTES de pedirle el alta a Meta: si no lo
  // está, Meta rechaza el alta y el mensaje de error no dice que el problema era
  // el deploy.
  const prueba = await fetch(
    `${callback}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=prueba123`,
  )
  const cuerpo = await prueba.text()
  if (!prueba.ok || cuerpo.trim() !== 'prueba123') {
    throw new Error(
      `${callback} no contesta el desafío (estado ${prueba.status}, cuerpo "${cuerpo.slice(0, 120)}").\n` +
      '¿Está deployado el código? ¿Coincide INSTAGRAM_WEBHOOK_VERIFY_TOKEN con el de Netlify?',
    )
  }
  console.log(`la ruta ${callback} contesta el desafío correctamente`)

  // 1) La app.
  const alta = await pedir(`${API}/${appId}/subscriptions?access_token=${appId}|${appSecret}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      object: 'instagram',
      callback_url: callback,
      fields: CAMPOS,
      verify_token: verifyToken,
    }),
  })
  if (alta.error) throw new Error(`alta de la app: ${JSON.stringify(alta.error)}`)
  console.log('app suscrita al objeto instagram ✓')

  // 2) La página (con SU token, no el de usuario de sistema).
  const { pageId, pageToken } = await tokenDePagina(token)
  const altaPagina = await pedir(
    `${API}/${pageId}/subscribed_apps?subscribed_fields=${CAMPOS_PAGINA}&access_token=${pageToken}`,
    { method: 'POST' },
  )
  if (altaPagina.error) throw new Error(`alta de la página: ${JSON.stringify(altaPagina.error)}`)
  console.log('página suscrita a la app ✓')

  await verificar(appId, appSecret, token)
  console.log('\n✅ webhook dado de alta')
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
