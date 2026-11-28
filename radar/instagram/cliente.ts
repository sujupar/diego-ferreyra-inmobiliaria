// Cliente de Instagram del radar: SOLO LEE, con la sesión del perfil propio del robot.
//
// Dos maneras de leer, según lo que la web de Instagram sigue sirviendo (verificado 2026-11-28):
// - Perfil, publicaciones de la cuenta y búsqueda: la web ya NO responde las rutas v1
//   (`web_profile_info`, `feed/user`, `topsearch` dan 404). Se navega a la página como una
//   persona y se leen las respuestas GraphQL que pide la propia web (por su "friendly name").
// - Explorar, comentarios y un media puntual: la web sí usa la API v1; se llama con
//   `fetch` desde la página con los mismos headers que manda la web.
// Toda respuesta pasa por `detectarBloqueo` antes del parser, y entre llamadas se espera
// la pausa aleatoria de Global Constraints.

import { writeFileSync } from 'node:fs'
import type { BrowserContext, Page, Response } from 'playwright-core'
import type { CuentaPerfil, ReelCrudo } from '../tipos'
import { BloqueoInstagram, detectarBloqueo, ErrorHttpInstagram } from './bloqueo'
import { abrirContexto, cookieInstagram, pausa, tieneSesion } from './navegador'
import {
  haySiguientePaginaGrilla,
  parsearBusqueda,
  parsearComentarios,
  parsearExplorar,
  parsearPerfil,
  parsearPestanaReels,
  parsearReels,
  shortcodeAPk,
  type ReelDePestana,
} from './parsers'
import { cruzarReels } from './cruce'

const IG = 'https://www.instagram.com'
const IG_APP_ID = '936619743392459'
const ASBD_ID = '359341'
/** Cuánto se espera la respuesta GraphQL de una página antes de darla por perdida. */
const ESPERA_RESPUESTA_MS = 20_000
/** Cuánto se espera la página siguiente después de un scroll. */
const ESPERA_SCROLL_MS = 10_000
/** Tope de scrolls por página: el radar mira, no recorre cuentas enteras. */
const MAX_SCROLLS = 4
/**
 * La grilla mezcla reels con carruseles y fotos: para fechar 24 reels puede hacer falta
 * recorrer ~50–60 publicaciones (en la corrida en vivo con 4 scrolls quedaron 4 sin fecha).
 */
const MAX_SCROLLS_GRILLA = 6
/** Reels de la pestaña sin fecha en la grilla que se completan con media/info. */
const MAX_COMPLETAR = 4

/** Cada respuesta cruda leída, por si alguien quiere guardarla (comando `capturar`). */
export type AlLeerCrudo = (nombre: string, json: unknown) => void

const pausaCorta = () => pausa(2000, 6000)

export class InstagramCliente {
  private constructor(
    private readonly ctx: BrowserContext,
    private readonly page: Page,
    private readonly alLeerCrudo?: AlLeerCrudo,
  ) {}

  static async abrir(opts: { headless: boolean; alLeerCrudo?: AlLeerCrudo }): Promise<InstagramCliente> {
    const ctx = await abrirContexto({ headless: opts.headless })
    try {
      if (!(await tieneSesion(ctx))) {
        throw new BloqueoInstagram('login', 'No hay sesión de Instagram en el perfil del robot: correr `radar/cli.ts login`')
      }
      const page = ctx.pages()[0] ?? (await ctx.newPage())
      return new InstagramCliente(ctx, page, opts.alLeerCrudo)
    } catch (e) {
      await ctx.close()
      throw e
    }
  }

  /** Pausa larga entre una cuenta y la siguiente (8–20 s). */
  static pausaEntreCuentas(): Promise<void> {
    return pausa(8000, 20000)
  }

  // ---------- lectura por navegación (GraphQL de la propia web) ----------

  /**
   * Navega a `url` y junta el cuerpo de las respuestas GraphQL cuyo friendly name empieza
   * con alguno de `prefijos`. Hace scroll mientras `seguir()` diga que hace falta más.
   */
  private async navegarYLeer(
    url: string,
    prefijos: string[],
    seguir: (leidas: Array<{ nombre: string; json: unknown }>) => boolean = () => false,
    requeridos: string[] = prefijos,
    maxScrolls = MAX_SCROLLS,
  ): Promise<Array<{ nombre: string; json: unknown }>> {
    const leidas: Array<{ nombre: string; json: unknown }> = []
    const pendientes: Array<Promise<void>> = []
    let error: unknown = null

    const alResponder = (res: Response) => {
      const req = res.request()
      const nombre =
        req.headers()['x-fb-friendly-name'] ?? (req.postData() ?? '').match(/fb_api_req_friendly_name=([^&]+)/)?.[1] ?? ''
      if (!nombre || !prefijos.some((p) => nombre.startsWith(p))) return
      pendientes.push(
        res.text().then(
          (cuerpo) => {
            // Un 401/403 pelado en UNA respuesta GraphQL no prueba que la sesión venció (pasa con
            // perfiles restringidos): sin URL o cuerpo que confirme el login, es un error de esta
            // cuenta y la corrida sigue con la próxima. Si la sesión cayó de verdad, la próxima
            // lectura termina en /accounts/login y eso sí frena todo.
            const tipo = detectarBloqueo({ url: res.url(), status: res.status(), cuerpo })
            if (tipo) error ??= new BloqueoInstagram(tipo, `Instagram frenó la lectura (${tipo}) en ${nombre}`)
            else if (res.status() !== 200) error ??= new ErrorHttpInstagram(res.status(), `forma inesperada: ${nombre} (HTTP ${res.status()})`)
            else {
              try {
                const json: unknown = JSON.parse(cuerpo)
                leidas.push({ nombre, json })
                this.alLeerCrudo?.(nombre, json)
              } catch {
                error ??= new Error(`forma inesperada: ${nombre} (no es JSON)`)
              }
            }
          },
          () => undefined, // la página navegó antes de leer el cuerpo: no cuenta
        ),
      )
    }

    this.page.on('response', alResponder)
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' })
      this.verificarUrl()
      const limite = Date.now() + ESPERA_RESPUESTA_MS
      const faltaAlguno = () => requeridos.some((p) => !leidas.some((l) => l.nombre.startsWith(p)))
      while (faltaAlguno() && !error && Date.now() < limite) {
        // Una redirección del lado del cliente a /challenge o /accounts/login pasa DURANTE la espera.
        this.verificarUrl()
        await pausa(500, 500)
      }
      await Promise.all(pendientes)
      if (error) throw error
      this.verificarUrl()
      if (faltaAlguno()) throw new Error(`forma inesperada: ${url} no trajo ${requeridos.join('/')}`)
      for (let i = 0; i < maxScrolls && seguir(leidas); i++) {
        const antes = leidas.length
        await this.page.mouse.wheel(0, 2500)
        // Se espera la página siguiente hasta ESPERA_SCROLL_MS: una pausa fija cortaba la
        // paginación cuando la respuesta tardaba más que la pausa.
        const limiteScroll = Date.now() + ESPERA_SCROLL_MS
        while (leidas.length === antes && !error && Date.now() < limiteScroll) {
          this.verificarUrl()
          await pausa(500, 500)
        }
        await Promise.all(pendientes)
        if (error) throw error
        this.verificarUrl()
        if (leidas.length === antes) break // no cargó nada más
        await pausaCorta()
      }
      await pausaCorta()
      await Promise.all(pendientes)
      if (error) throw error
      return leidas
    } finally {
      this.page.off('response', alResponder)
    }
  }

  private verificarUrl(): void {
    const tipo = detectarBloqueo({ url: this.page.url(), status: 200, cuerpo: '' })
    if (tipo) throw new BloqueoInstagram(tipo, `Instagram mandó a ${this.page.url()}`)
  }

  // ---------- lectura por la API v1 (la que la web sigue usando) ----------

  private async v1(ruta: string, nombre: string): Promise<{ status: number; json: unknown }> {
    if (!this.page.url().startsWith(IG)) {
      await this.page.goto(`${IG}/`, { waitUntil: 'domcontentloaded' })
      this.verificarUrl()
      await pausaCorta()
    }
    const csrf = (await cookieInstagram(this.ctx, 'csrftoken')) ?? ''
    const r = await this.page.evaluate(
      async ({ ruta, csrf, appId, asbd }) => {
        const res = await fetch(ruta, {
          credentials: 'include',
          headers: {
            accept: '*/*',
            'x-ig-app-id': appId,
            'x-asbd-id': asbd,
            'x-requested-with': 'XMLHttpRequest',
            'x-csrftoken': csrf,
            'x-ig-www-claim': sessionStorage.getItem('www-claim-v2') ?? '0',
          },
        })
        return { url: res.url, status: res.status, cuerpo: await res.text() }
      },
      { ruta, csrf, appId: IG_APP_ID, asbd: ASBD_ID },
    )
    await pausaCorta()
    const tipo = detectarBloqueo(r)
    if (tipo) throw new BloqueoInstagram(tipo, `Instagram frenó la lectura (${tipo}) en ${nombre}`)
    let json: unknown = null
    try {
      json = JSON.parse(r.cuerpo)
    } catch {
      // 404 de la web es HTML: el que llama decide si eso es "no existe" o un error.
    }
    if (json !== null && r.status === 200) this.alLeerCrudo?.(nombre, json)
    return { status: r.status, json }
  }

  private async v1Obligatorio(ruta: string, nombre: string): Promise<unknown> {
    const { status, json } = await this.v1(ruta, nombre)
    if (status !== 200 || json === null) throw new ErrorHttpInstagram(status, `forma inesperada: ${nombre} (HTTP ${status})`)
    return json
  }

  // ---------- API pública ----------

  /** Grilla capturada en la última visita al perfil, para no volver a pedirla. */
  private grillaCache: { usuario: string; respuestas: unknown[] } | null = null

  async perfil(usuario: string): Promise<CuentaPerfil> {
    const leidas = await this.navegarYLeer(
      `${IG}/${encodeURIComponent(usuario)}/`,
      ['PolarisProfilePageContentQuery', 'PolarisProfilePosts'],
      undefined,
      ['PolarisProfilePageContentQuery'],
    )
    const crudo = leidas.find((l) => l.nombre === 'PolarisProfilePageContentQuery')
    if (!crudo) throw new Error('forma inesperada: perfil (sin PolarisProfilePageContentQuery)')
    this.grillaCache = {
      usuario,
      respuestas: leidas.filter((l) => l.nombre.startsWith('PolarisProfilePosts')).map((l) => l.json),
    }
    return parsearPerfil(crudo.json)
  }

  /**
   * Los últimos `n` reels de la cuenta. Las vistas salen de la pestaña Reels; la fecha y el
   * texto, de la grilla del perfil (se cruzan por shortcode). Los pocos que no aparezcan en
   * la grilla se completan con media/info; si aun así faltan, se dejan afuera (nunca fecha inventada).
   */
  async reelsDeCuenta(perfil: CuentaPerfil, n: number): Promise<ReelCrudo[]> {
    const usuario = perfil.usuario
    const pestana: ReelDePestana[] = []
    let hayMas = true
    const leer = (l: { nombre: string; json: unknown }) => {
      if (!l.nombre.startsWith('PolarisProfileReelsTab')) return
      const p = parsearPestanaReels(l.json)
      for (const r of p.reels) if (!pestana.some((x) => x.shortcode === r.shortcode)) pestana.push(r)
      hayMas = p.hayMas
    }
    let procesadas = 0
    const ponerAlDia = (leidas: Array<{ nombre: string; json: unknown }>) => {
      for (; procesadas < leidas.length; procesadas++) leer(leidas[procesadas])
    }
    ponerAlDia(
      await this.navegarYLeer(`${IG}/${encodeURIComponent(usuario)}/reels/`, ['PolarisProfileReelsTab'], (leidas) => {
        ponerAlDia(leidas)
        return hayMas && pestana.length < n
      }),
    )
    const elegidos = pestana.slice(0, n)
    if (elegidos.length === 0) return []

    // Fecha y texto desde la grilla (la de la visita al perfil, y si falta, scrolleando).
    const detalle = new Map<string, ReelCrudo>()
    const sumarGrilla = (json: unknown) => {
      for (const r of parsearReels(json, usuario)) detalle.set(r.shortcode, r)
    }
    const faltan = () => elegidos.filter((r) => !detalle.has(r.shortcode)).length
    if (this.grillaCache?.usuario === usuario) this.grillaCache.respuestas.forEach(sumarGrilla)
    let paginasGrilla = 0
    if (faltan() > MAX_COMPLETAR) {
      let grillaHayMas = true
      let vistas = 0
      paginasGrilla = 0
      const alDia = (leidas: Array<{ nombre: string; json: unknown }>) => {
        for (; vistas < leidas.length; vistas++) {
          sumarGrilla(leidas[vistas].json)
          paginasGrilla++
          grillaHayMas = haySiguientePaginaGrilla(leidas[vistas].json)
        }
      }
      alDia(
        await this.navegarYLeer(`${IG}/${encodeURIComponent(usuario)}/`, ['PolarisProfilePosts'], (leidas) => {
          alDia(leidas)
          return grillaHayMas && faltan() > MAX_COMPLETAR
        }, undefined, MAX_SCROLLS_GRILLA),
      )
    }
    let completados = 0
    for (const r of elegidos) {
      if (detalle.has(r.shortcode) || completados >= MAX_COMPLETAR) continue
      completados++
      const info = await this.reelPorShortcode(r.shortcode)
      if (info) detalle.set(r.shortcode, info)
    }

    const { reels, sinFecha } = cruzarReels(elegidos, detalle, usuario)
    if (reels.length < n) {
      console.warn(
        `[radar] @${usuario}: ${reels.length} de ${n} reels pedidos (pestaña Reels: ${pestana.length}; páginas de grilla leídas: ${paginasGrilla}; sin fecha, descartados: ${sinFecha.length})`,
      )
    }
    return reels
  }

  /** Cuentas que publican sobre `termino` (autores de la búsqueda por palabra de la web). */
  async buscarCuentas(termino: string, n: number): Promise<string[]> {
    const usuarios: string[] = []
    let procesadas = 0
    const leer = (leidas: Array<{ json: unknown }>) => {
      for (; procesadas < leidas.length; procesadas++) {
        for (const u of parsearBusqueda(leidas[procesadas].json)) if (!usuarios.includes(u)) usuarios.push(u)
      }
    }
    const leidas = await this.navegarYLeer(
      `${IG}/explore/search/keyword/?q=${encodeURIComponent(termino)}`,
      ['PolarisKeywordSearchExplorePage'],
      (l) => {
        leer(l)
        return usuarios.length < n
      },
    )
    leer(leidas)
    return usuarios.slice(0, n)
  }

  async explorar(n: number): Promise<ReelCrudo[]> {
    const json = await this.v1Obligatorio(
      '/api/v1/discover/topical_explore/?is_nonpersonalized_explore=false&is_prefetch=false&omit_cover_media=false&module=explore_popular&use_sectional_payload=true&cluster_id=explore_all%3A0&include_fixed_destinations=true',
      'explorar',
    )
    return parsearExplorar(json).slice(0, n)
  }

  async comentarios(pk: string, n: number): Promise<string[]> {
    if (!/^\d+$/.test(pk)) throw new Error(`pk inválido: ${pk}`)
    const json = await this.v1Obligatorio(
      `/api/v1/media/${pk}/comments/?can_support_threading=true&permalink_enabled=false`,
      'comentarios',
    )
    return parsearComentarios(json).slice(0, n)
  }

  async reelPorShortcode(shortcode: string): Promise<ReelCrudo | null> {
    const pk = shortcodeAPk(shortcode)
    const { status, json } = await this.v1(`/api/v1/media/${pk}/info/`, 'media-info')
    if (status === 404 || status === 400) return null
    if (status !== 200 || json === null) throw new ErrorHttpInstagram(status, `forma inesperada: media-info (HTTP ${status})`)
    const item = (json as { items?: Array<{ user?: { username?: string } }> }).items?.[0]
    const cuenta = item?.user?.username
    if (!cuenta) throw new Error('forma inesperada: media-info (sin autor)')
    return parsearReels(json, cuenta)[0] ?? null
  }

  /** Cookies de Instagram en formato Netscape, para yt-dlp. Archivo solo legible por el usuario. */
  async cookiesNetscape(destino: string): Promise<void> {
    const cookies = await this.ctx.cookies(IG)
    const lineas = ['# Netscape HTTP Cookie File', '# Generado por el radar. NO versionar.', '']
    for (const c of cookies) {
      if (!c.domain.endsWith('instagram.com')) continue
      lineas.push(
        [
          c.domain,
          c.domain.startsWith('.') ? 'TRUE' : 'FALSE',
          c.path,
          c.secure ? 'TRUE' : 'FALSE',
          String(c.expires > 0 ? Math.floor(c.expires) : 0),
          c.name,
          c.value,
        ].join('\t'),
      )
    }
    writeFileSync(destino, lineas.join('\n') + '\n', { mode: 0o600 })
  }

  /** Valor de una cookie de la sesión (para sanear muestras; nunca se imprime). */
  cookie(nombre: string): Promise<string | null> {
    return cookieInstagram(this.ctx, nombre)
  }

  async cerrar(): Promise<void> {
    await this.ctx.close()
  }
}
