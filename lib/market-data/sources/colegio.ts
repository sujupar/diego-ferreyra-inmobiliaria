import * as cheerio from 'cheerio'
import type { EscriturasData, SourceResult } from '../types'

export const COLEGIO_FEED_URL = 'https://www.colegio-escribanos.org.ar/category/estadisticas-de-escrituras/feed/'

export type ColegioParsed = Omit<EscriturasData, 'imageUrl'> & { imageSourceUrl: string | null }

const stripCdata = (s: string) => s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()

/** Número argentino "5.435" → 5435; "848.932" → 848932. */
const numAr = (s: string | undefined | null): number | null => {
    if (!s) return null
    const n = parseInt(s.replace(/\./g, ''), 10)
    return Number.isFinite(n) ? n : null
}

/** Parser PURO del RSS: item[0] = artículo del mes más reciente (el feed de la
 *  categoría lista SOLO los posts mensuales de escrituras, ya ordenados). */
export function parseColegioFeed(xml: string): ColegioParsed {
    const $ = cheerio.load(xml, { xmlMode: true })
    const item = $('item').first()
    if (!item.length) throw new Error('[colegio] el feed no trae items')

    const title = stripCdata(item.find('title').text())
    const articleUrl = stripCdata(item.find('link').text())
    const contentHtml = stripCdata(item.find('content\\:encoded').text() || item.find('encoded').text())
    if (!articleUrl || !contentHtml) throw new Error('[colegio] item sin link o sin content:encoded')

    // "Cantidad de escrituras de compraventa realizadas en Mayo 2026" → "Mayo 2026"
    const mesLabel = (title.match(/en\s+(.+?)\s*$/i) || [])[1] || title

    const $c = cheerio.load(contentHtml)
    const imageSourceUrl = $c('img').first().attr('src') || null
    const bodyText = $c.root().text().replace(/\s+/g, ' ').trim()

    // Cifras clave (regexes verificadas contra el fixture real 2026-07-01, ver
    // lib/market-data/sources/colegio.test.ts para los valores esperados exactos
    // del mes de Mayo 2026: cantidad=5435, varInteranual≈-0.031, hipotecas=587).
    //
    // "Actos de escrituras de compraventa 5435" — línea destacada en negrita al
    // inicio del cuerpo, estable en los 10 artículos del fixture. Fallback a
    // "al sumar 5435 registros" (párrafo siguiente) por si cambia el fraseo.
    const cantidad = numAr((bodyText.match(/escrituras de compraventa\s+([\d.]{3,})/i) || [])[1])
        ?? numAr((bodyText.match(/al sumar\s+([\d.]{3,})/i) || [])[1])
    // "una baja del 3,1% respecto del nivel de un año antes" / "una suba de 17,8%
    // respecto del nivel de un año antes". OJO: el fraseo del Colegio NO usa la
    // palabra "interanual" en este párrafo (solo aparece, ambiguamente, dentro
    // de citas textuales de otros meses) — el ancla confiable es "respecto del
    // nivel de un año antes". Meses de "empate técnico" (sin %) devuelven null.
    const viaMatch = bodyText.match(/(baja|suba)\s+del?\s+(-?\d+(?:,\d+)?)\s*%[^.]{0,40}respecto del nivel de un año antes/i)
    const varInteranual = viaMatch
        ? (viaMatch[1].toLowerCase() === 'baja' ? -1 : 1) * parseFloat(viaMatch[2].replace(',', '.')) / 100
        : null
    const montoTexto = (bodyText.match(/\$\s?[\d.]+ (?:millones|mil millones)/i) || [])[0] || null
    // "En mayo, hubo 587 escrituras formalizadas con hipoteca" — estable en los
    // 10 artículos del fixture. Fallback al fraseo genérico original por si un
    // mes futuro lo simplifica.
    const hipotecas = numAr((bodyText.match(/hubo\s+([\d.]{2,})\s+escrituras[^.]{0,60}hipoteca/i) || [])[1])
        ?? numAr((bodyText.match(/([\d.]{2,})\s+(?:escrituras\s+)?(?:de\s+)?hipotecas?/i) || [])[1])

    const partes: string[] = []
    if (cantidad) partes.push(`En ${mesLabel} se registraron ${cantidad.toLocaleString('es-AR')} escrituras de compraventa en CABA`)
    if (varInteranual !== null) partes.push(`(${varInteranual > 0 ? '+' : ''}${(varInteranual * 100).toFixed(1).replace('.', ',')}% interanual)`)
    if (montoTexto) partes.push(`por un monto total de ${montoTexto}`)
    // Resumen SIEMPRE compuesto por nosotros a partir de las cifras extraídas
    // (nunca un párrafo copiado del artículo — ver CLAUDE.md / disciplina de
    // copyright). Si la extracción de cifras falla por completo, el fallback es
    // una línea corta y factual (no un recorte del cuerpo del artículo).
    const summary = partes.length
        ? partes.join(' ') + '.' + (hipotecas ? ` Se firmaron ${hipotecas.toLocaleString('es-AR')} escrituras con hipoteca.` : '')
        : `El Colegio de Escribanos publicó el informe de ${mesLabel}. Ver informe original.`

    return { mesLabel, cantidad, varInteranual, montoTexto, hipotecas, articleUrl, imageSourceUrl, summary }
}

export async function fetchColegio(): Promise<SourceResult<ColegioParsed>> {
    try {
        const res = await fetch(COLEGIO_FEED_URL, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return { ok: true, data: parseColegioFeed(await res.text()) }
    } catch (e) {
        return { ok: false, error: `colegio: ${(e as Error).message}` }
    }
}
