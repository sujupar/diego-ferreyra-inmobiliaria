/**
 * Lectura de las páginas de resultados de Argenprop y MercadoLibre (HTML real guardado en __fixtures__). Puro:
 * recibe el HTML. Si la página no tiene ninguna tarjeta reconocible, FALLA: un portal que cambió su HTML no puede
 * verse como "no hay competencia".
 */
import * as cheerio from 'cheerio'
import type { AvisoDeListado } from './puntaje'
import { TOPES_COMPETIDORA } from '../sanear'

/**
 * El link de una candidata sale del HTML del portal (contenido de terceros) y termina en "Ver en el portal", en el
 * PDF que recibe el propietario y en el scraper. Solo https, host EXACTO (nunca `includes`: `evil.com/argenprop.com`
 * pasaría) y dentro del largo que acepta una competidora (si no, "Agregar al informe" fallaría al guardar).
 */
export function esLinkDelPortal(portal: 'argenprop' | 'mercadolibre', link: string): boolean {
  if (link.length > TOPES_COMPETIDORA.link) return false
  let u: URL
  try { u = new URL(link) } catch { return false }
  if (u.protocol !== 'https:') return false
  if (portal === 'argenprop') return u.hostname === 'www.argenprop.com'
  return u.hostname === 'mercadolibre.com.ar' || u.hostname.endsWith('.mercadolibre.com.ar')
}

const texto = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim()

/** "220.000" → 220000; "1.190.000" → 1190000. */
function entero(s: string | undefined | null): number | null {
  const d = (s ?? '').replace(/[^\d]/g, '')
  return d ? Number(d) : null
}

/** El primer número de un texto como "60 m² cubie." o "3 ambientes". */
function primerNumero(s: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(s)
  return m ? Math.round(Number(m[1].replace(',', '.'))) : null
}

function moneda(s: string): 'USD' | 'ARS' | null {
  if (/US\$|USD|U\$S/i.test(s)) return 'USD'
  if (/\$/.test(s)) return 'ARS'
  return null
}

/**
 * Qué página llegó, para el mensaje de error: sin esto, "no reconoce ningún aviso" no distingue un portal que
 * cambió su HTML de una página de bloqueo o de un listado vacío (pasó en la vista previa del 2026-10-22).
 */
function queLlego($: cheerio.CheerioAPI, html: string): string {
  const titulo = texto($('title').first().text()).slice(0, 80) || 'sin título'
  return `[llegó una página de ${Math.round(html.length / 1024)} KB: «${titulo}»]`
}

const httpsONull = (u: string | undefined) => (u && u.startsWith('https://') ? u : null)

export function parsearListadoArgenprop(html: string): AvisoDeListado[] {
  const $ = cheerio.load(html)
  const avisos: AvisoDeListado[] = []
  $('div.listing__item').each((_, el) => {
    const c = $(el)
    const href = c.find('a[href*="--"]').first().attr('href')
    if (!href || !/--\d+$/.test(href.split('?')[0])) return
    const precioTxt = texto(c.find('.card__price').text())
    const rasgo = (icono: string) => {
      const li = c.find(`.card__main-features i[class*="${icono}"]`).closest('li')
      return li.length ? primerNumero(texto(li.text())) : null
    }
    const fotos = c.find('img').map((__, img) => $(img).attr('data-src') ?? $(img).attr('src')).get()
    let url: string
    try { url = new URL(href.split('?')[0], 'https://www.argenprop.com').toString() } catch { return }
    if (!esLinkDelPortal('argenprop', url)) return
    avisos.push({
      portal: 'argenprop',
      url,
      titulo: texto(c.find('.card__title').text()) || null,
      direccion: texto(c.find('.card__address').text()),
      precio: /consultar/i.test(precioTxt) ? null : entero(precioTxt),
      moneda: moneda(precioTxt),
      m2: rasgo('superficie'),
      ambientes: rasgo('cantidad_ambientes'),
      dormitorios: rasgo('cantidad_dormitorios'),
      banos: rasgo('cantidad_banos'),
      cocheras: rasgo('cochera'),
      antiguedad: rasgo('antiguedad'),
      foto: fotos.map(httpsONull).find(Boolean) ?? null,
      vistas: entero(c.find('.card__points').first().text()),
      inmobiliaria: texto(c.find('.card__agent-name').text()) || null,
    })
  })
  if (!avisos.length) throw new Error(`La plataforma no reconoce ningún aviso en la página de Argenprop (¿cambió el portal?) ${queLlego($, html)}`)
  return avisos
}

export function parsearListadoMercadoLibre(html: string): AvisoDeListado[] {
  const $ = cheerio.load(html)
  const avisos: AvisoDeListado[] = []
  let tarjetas = 0
  $('li.ui-search-layout__item').each((_, el) => {
    const c = $(el)
    const href = c.find('a[href*="MLA"]').first().attr('href')
    if (!href) return
    tarjetas++
    const todo = texto(c.text())
    const atributos = c.find('.poly-attributes_list__item').map((__, li) => texto($(li).text())).get()
    // Emprendimientos en pozo: "Desde US$ …", "1 a 4 ambs.", "13 unidades disponibles". No compiten con una usada.
    // Tampoco una unidad suelta "en pozo": todavía no existe, el comprador la compara distinto.
    const titulo = texto(c.find('.poly-component__title').first().text())
    if (/desde\s*(?:US\$|U\$S|\$)/i.test(todo) || /unidades disponibles/i.test(todo) || atributos.some(a => /\d+\s+a\s+\d+/.test(a)) || /\bpozo\b/i.test(titulo)) return
    const attr = (re: RegExp) => { const a = atributos.find(x => re.test(x)); return a ? primerNumero(a) : null }
    const simbolo = texto(c.find('.andes-money-amount__currency-symbol').first().text())
    const url = href.split('#')[0]
    if (!esLinkDelPortal('mercadolibre', url)) return
    avisos.push({
      portal: 'mercadolibre',
      url,
      titulo: texto(c.find('.poly-component__title').first().text()) || null,
      direccion: texto(c.find('.poly-component__location').first().text()),
      precio: entero(c.find('.andes-money-amount__fraction').first().text()),
      moneda: moneda(simbolo),
      m2: attr(/m²/),
      ambientes: attr(/amb/),
      dormitorios: attr(/dorm/),
      banos: attr(/baño/),
      cocheras: null,
      antiguedad: null,
      foto: httpsONull(c.find('img').first().attr('src')) ?? httpsONull(c.find('img').first().attr('data-src')),
      vistas: null,
      inmobiliaria: texto(c.find('.poly-component__seller').first().text()) || null,
    })
  })
  if (!tarjetas) throw new Error(`La plataforma no reconoce ningún aviso en la página de MercadoLibre (¿cambió el portal?) ${queLlego($, html)}`)
  return avisos
}
