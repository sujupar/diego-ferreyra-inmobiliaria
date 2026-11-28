// Comandos del radar que se corren a mano en la Mac del dueño.
//
//   node --import tsx radar/cli.ts login               → abre Chrome con ventana para iniciar sesión
//   node --import tsx radar/cli.ts capturar <usuario>  → guarda muestras crudas de la API web
//
// SOLO LEE: ningún comando da like, comenta, sigue ni publica.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright-core'
import { abrirContexto, cookieInstagram, pausa, RUTA_PERFIL, tieneSesion } from './instagram/navegador'

const DIR_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'instagram', 'fixtures')
const IG_APP_ID = '936619743392459'

async function login(): Promise<void> {
  console.log(`Abriendo Chrome con el perfil del robot (${RUTA_PERFIL}).`)
  console.log('Iniciá sesión en Instagram en la ventana. Esto espera hasta 10 minutos.')
  const ctx = await abrirContexto({ headless: false })
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' })
    const limite = Date.now() + 10 * 60 * 1000
    while (Date.now() < limite) {
      if (await tieneSesion(ctx)) {
        // Un respiro para que Instagram termine de escribir el resto de las cookies.
        await pausa(3000, 3000)
        console.log('Sesión lista')
        return
      }
      await pausa(2000, 2000)
    }
    throw new Error('Pasaron 10 minutos sin iniciar sesión. Volvé a correr login.')
  } finally {
    await ctx.close()
  }
}

interface RespuestaCruda {
  url: string
  status: number
  cuerpo: string
}

/** Llama a la API web desde adentro de la página, con los mismos headers que usa la web. */
async function llamar(page: Page, ruta: string, csrf: string, init?: { method: 'POST'; body: string }): Promise<RespuestaCruda> {
  return page.evaluate(
    async ({ ruta, csrf, appId, init }) => {
      const headers: Record<string, string> = {
        'x-ig-app-id': appId,
        'x-requested-with': 'XMLHttpRequest',
        'x-csrftoken': csrf,
        accept: '*/*',
      }
      if (init) headers['content-type'] = 'application/x-www-form-urlencoded'
      const r = await fetch(ruta, { credentials: 'include', headers, ...(init ?? {}) })
      return { url: r.url, status: r.status, cuerpo: await r.text() }
    },
    { ruta, csrf, appId: IG_APP_ID, init },
  )
}

// Claves que hablan de la cuenta que mira (la de Julian) o de su relación con la cuenta mirada.
const CLAVE_PRIVADA = /viewer|friendship_status|has_liked|has_viewer_saved|csrf|sessionid|ds_user|fbid_v2/i

function limpiar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpiar)
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor)) {
      if (CLAVE_PRIVADA.test(k)) continue
      out[k] = limpiar(v)
    }
    return out
  }
  return valor
}

/** Quita claves privadas y reemplaza cualquier aparición literal de los secretos de la sesión. */
function sanear(cuerpo: string, secretos: Array<[string, string]>): string {
  let texto = JSON.stringify(limpiar(JSON.parse(cuerpo)), null, 2)
  for (const [valor, marca] of secretos) {
    if (valor.length >= 4) texto = texto.split(valor).join(marca)
  }
  return texto
}

function guardar(nombre: string, r: RespuestaCruda, secretos: Array<[string, string]>): unknown | null {
  if (r.status !== 200) {
    console.log(`  ✗ ${nombre}: HTTP ${r.status} (${r.url}) — no se guarda`)
    return null
  }
  let texto: string
  try {
    texto = sanear(r.cuerpo, secretos)
  } catch {
    console.log(`  ✗ ${nombre}: la respuesta no es JSON (${r.url}) — no se guarda`)
    return null
  }
  // Defensa final: si algún secreto sobrevivió, no se escribe nada.
  for (const [valor] of secretos) {
    if (valor.length >= 4 && texto.includes(valor)) throw new Error(`${nombre}: quedó un secreto en la muestra`)
  }
  writeFileSync(join(DIR_FIXTURES, `${nombre}.json`), texto + '\n')
  console.log(`  ✓ ${nombre}.json (${texto.length} bytes)`)
  return JSON.parse(texto)
}

type Json = Record<string, any>

async function capturar(usuario: string): Promise<void> {
  mkdirSync(DIR_FIXTURES, { recursive: true })
  const ctx = await abrirContexto({ headless: true })
  try {
    if (!(await tieneSesion(ctx))) {
      throw new Error('No hay sesión de Instagram en el perfil del robot. Corré primero: node --import tsx radar/cli.ts login')
    }
    const csrf = (await cookieInstagram(ctx, 'csrftoken')) ?? ''
    const sessionid = (await cookieInstagram(ctx, 'sessionid')) ?? ''
    const dsUserId = (await cookieInstagram(ctx, 'ds_user_id')) ?? ''
    const secretos: Array<[string, string]> = [
      [sessionid, '<SESSIONID>'],
      [decodeURIComponent(sessionid), '<SESSIONID>'],
      [csrf, '<CSRF>'],
      [dsUserId, '<VIEWER_ID>'],
    ]

    const page = ctx.pages()[0] ?? (await ctx.newPage())
    await page.goto(`https://www.instagram.com/${encodeURIComponent(usuario)}/`, { waitUntil: 'domcontentloaded' })
    if (page.url().includes('/accounts/login')) throw new Error('Instagram pidió iniciar sesión otra vez: correr login')
    await pausa(2000, 6000)

    console.log(`Capturando muestras de @${usuario}:`)
    const perfil = guardar(
      'perfil',
      await llamar(page, `/api/v1/users/web_profile_info/?username=${encodeURIComponent(usuario)}`, csrf),
      secretos,
    ) as Json | null
    const userId: string | undefined = perfil?.data?.user?.id
    if (!userId) throw new Error('No se pudo leer el id de la cuenta desde el perfil: no sigo')
    await pausa(2000, 6000)

    // Feed de la cuenta: trae reels Y posts sin video (sirve para probar esReel:false).
    const feed = guardar('reels', await llamar(page, `/api/v1/feed/user/${userId}/?count=12`, csrf), secretos) as Json | null
    await pausa(2000, 6000)

    // Solo reels de la cuenta (pestaña Reels de la web).
    guardar(
      'reels-clips',
      await llamar(page, '/api/v1/clips/user/', csrf, {
        method: 'POST',
        body: new URLSearchParams({ target_user_id: userId, page_size: '12', include_feed_video: 'true' }).toString(),
      }),
      secretos,
    )
    await pausa(2000, 6000)

    guardar(
      'busqueda',
      await llamar(page, `/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent('inmobiliaria')}&include_reel=true`, csrf),
      secretos,
    )
    await pausa(2000, 6000)

    guardar('explorar', await llamar(page, '/api/v1/discover/web/explore_grid/?is_prefetch=false&omit_cover_media=false&module=explore_popular&use_sectional_payload=true', csrf), secretos)
    await pausa(2000, 6000)

    const items: Json[] = Array.isArray(feed?.items) ? feed.items : []
    const conComentarios = items.find((it) => (it.comment_count ?? 0) > 0) ?? items[0]
    if (conComentarios?.pk) {
      const pk = String(conComentarios.pk)
      guardar('comentarios', await llamar(page, `/api/v1/media/${pk}/comments/?can_support_threading=true&permalink_enabled=false`, csrf), secretos)
      await pausa(2000, 6000)
      guardar('media-info', await llamar(page, `/api/v1/media/${pk}/info/`, csrf), secretos)
    } else {
      console.log('  ✗ comentarios / media-info: el feed no trajo publicaciones')
    }
  } finally {
    await ctx.close()
  }
}

async function main(): Promise<void> {
  const [comando, arg] = process.argv.slice(2)
  if (comando === 'login') return login()
  if (comando === 'capturar') {
    if (!arg) throw new Error('Uso: node --import tsx radar/cli.ts capturar <usuario>')
    return capturar(arg.replace(/^@/, ''))
  }
  console.log('Comandos: login | capturar <usuario>')
  process.exitCode = 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
