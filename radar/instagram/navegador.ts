// Navegador del robot: su PROPIO perfil persistente de Chrome, fuera del repo y de iCloud.
// Nunca abre ni toca el perfil de Arc de Julian.

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext } from 'playwright-core'

export const RUTA_BASE = join(homedir(), '.radar-referencias')
export const RUTA_PERFIL = join(RUTA_BASE, 'perfil-navegador')
/** El user agent real de Chrome, guardado en el login (con ventana) para reusarlo sin ventana. */
const RUTA_UA = join(RUTA_BASE, 'user-agent.txt')

const CHROME_MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export function asegurarCarpetas(): void {
  for (const dir of [RUTA_BASE, RUTA_PERFIL]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  // Ahí adentro viven las cookies de la sesión: que solo las lea este usuario.
  chmodSync(RUTA_BASE, 0o700)
  chmodSync(RUTA_PERFIL, 0o700)
}

function opcionesBase(headless: boolean, userAgent?: string) {
  return {
    headless,
    // Preferimos el Chrome instalado: se ve como un navegador común, no como un Chromium de pruebas.
    ...(existsSync(CHROME_MAC) ? { channel: 'chrome' as const } : {}),
    viewport: { width: 1440, height: 900 },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    ...(userAgent ? { userAgent } : {}),
  }
}

/**
 * Abre el perfil persistente. Sin ventana, Chrome se anuncia como "HeadlessChrome"
 * en el user agent: eso delata al robot, así que se reemplaza por el UA real.
 */
export async function abrirContexto(opts: { headless: boolean }): Promise<BrowserContext> {
  asegurarCarpetas()
  if (!opts.headless) {
    const ctx = await chromium.launchPersistentContext(RUTA_PERFIL, opcionesBase(false))
    try {
      const ua = await uaDe(ctx)
      if (ua && !ua.includes('HeadlessChrome')) writeFileSync(RUTA_UA, ua, { mode: 0o600 })
    } catch {
      // Si no se pudo leer el UA no pasa nada: la próxima sin ventana lo deriva.
    }
    return ctx
  }

  let ua = existsSync(RUTA_UA) ? readFileSync(RUTA_UA, 'utf8').trim() : ''
  if (!ua) {
    const sonda = await chromium.launchPersistentContext(RUTA_PERFIL, opcionesBase(true))
    ua = (await uaDe(sonda)).replace('HeadlessChrome', 'Chrome')
    await sonda.close()
  }
  return chromium.launchPersistentContext(RUTA_PERFIL, opcionesBase(true, ua))
}

async function uaDe(ctx: BrowserContext): Promise<string> {
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  return page.evaluate(() => navigator.userAgent)
}

export async function cookieInstagram(ctx: BrowserContext, nombre: string): Promise<string | null> {
  const cookies = await ctx.cookies('https://www.instagram.com/')
  const c = cookies.find((x) => x.name === nombre && x.domain.endsWith('instagram.com'))
  return c?.value ?? null
}

export async function tieneSesion(ctx: BrowserContext): Promise<boolean> {
  return (await cookieInstagram(ctx, 'sessionid')) !== null
}

/** Pausa aleatoria entre llamadas (Global Constraints: 2–6 s entre llamadas, 8–20 s entre cuentas). */
export function pausa(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs + 1))
  return new Promise((r) => setTimeout(r, ms))
}
