import * as cheerio from 'cheerio'
import type { CompositionSlice, StockComposition, SourceResult } from '../types'

export const INFOGRAM_EMBED_URL = 'https://e.infogram.com/09008d4a-dcf6-4acf-aebe-18cb3cfc2f5c?src=embed'

export type InfogramComposition = Pick<StockComposition, 'tipos' | 'antiguedad' | 'vendedor' | 'antPublicacion' | 'totalInmuebles'>

/**
 * FUENTE DESBLOQUEADA (2026-07-02) — historial breve, ver git log de este
 * archivo para el detalle completo de cada intento:
 *
 * - Intento 1 (Task 4 original): parsear `window.infographicData` del HTML
 *   estático del embed. Descartado: `chartData.data` siempre llega `[[[]]]`
 *   porque son charts "live" (Google Sheets) que Infogram hidrata client-side.
 * - Intento 2: pegarle directo a `GET /api/v1/atlas/getLiveData?id={key}`
 *   (el endpoint que usa el bundle del viewer). Descartado: siempre 401 — esa
 *   API exige sesión de browser real, un `fetch()` plano no la reproduce.
 * - DESBLOQUEO (verificado empíricamente 2026-07-02): pedirle a ScraperAPI
 *   que RENDERICE el embed (`render=true&wait_for_selector=svg`) devuelve el
 *   HTML ya hidratado por el browser real que corre del lado de ScraperAPI
 *   (~350KB, 27 `<svg>`). Ahí los datos SÍ están, en dos formas redundantes:
 *     1. 4 tablas HTML (`<table>` con celdas `.igc-table-cell`) — una es la
 *        tabla de TIPOS (Casa/Departamentos/.../Otros + fila total INMUEBLES).
 *     2. Textos `<text class="igc-graph-pie-label">…Inmobiliaria 98.70%</text>`
 *        agrupados en `<g class="igc-graph-group">` — un grupo por chart de
 *        torta (vendedor, antigüedad, antigüedad de publicación, y también
 *        tipos, aunque para tipos usamos la tabla — ver `parseHydratedInfogram`).
 *   Fixture real capturado ese día: `__fixtures__/infogram-rendered.html`.
 *
 * Plan B (no implementado, documentado para el futuro): si el render por
 * `wait_for_selector` alguna vez deja de alcanzar (ej. Infogram cambia el
 * bundle y tarda más en hidratar), ScraperAPI también expone
 * `&screenshot=true`, que agrega un header de respuesta `sa-screenshot:` con
 * la URL de un PNG de la página ya renderizada. Serviría como fallback visual
 * (ej. mostrar la imagen cruda en el PDF) pero NO como fuente de datos
 * estructurados — no se implementa acá.
 */

const TIPO_LABELS: Record<string, string> = {
    CASA: 'Casa',
    DEPARTAMENTOS: 'Departamentos',
    TERRENOS: 'Terrenos',
    PH: 'PH',
    'LOCAL COMERCIAL': 'Local comercial',
    'OFICINA COMERCIAL': 'Oficina comercial',
    DEPOSITOS: 'Depósitos',
    DEPÓSITOS: 'Depósitos',
    COCHERAS: 'Cocheras',
    OTROS: 'Otros',
}

/** "115,277" / "115.277" → 115277. Infogram renderiza miles con coma en este
 *  embed puntual, pero toleramos también el punto es-AR por si el locale del
 *  renderer cambia. */
const numLoose = (s: string | undefined | null): number | null => {
    if (!s) return null
    const n = parseInt(s.replace(/[.,]/g, ''), 10)
    return Number.isFinite(n) ? n : null
}

const sumPct = (arr: CompositionSlice[]): number => arr.reduce((a, x) => a + x.pct, 0)

const assertSumInRange = (name: string, arr: CompositionSlice[]) => {
    const s = sumPct(arr)
    if (s < 95 || s > 105) {
        throw new Error(`[infogram] serie "${name}": suma de porcentajes fuera de rango (${s.toFixed(1)}%, esperado 95-105%)`)
    }
}

/** "Inmobiliaria 98.70%" → { label: "Inmobiliaria", pct: 98.7 }. Los pie-labels
 *  de este embed a veces traen espacios extra entre label y %% (ej.
 *  "A estrenar   32.50%") — el regex ya los tolera. */
function parsePieLabel(raw: string): CompositionSlice {
    const m = raw.trim().match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*%$/)
    if (!m) throw new Error(`[infogram] pie-label con shape inesperado: "${raw}"`)
    return { label: m[1].trim(), pct: parseFloat(m[2].replace(',', '.')) }
}

/**
 * Parser PURO del HTML ya hidratado (post render+wait de ScraperAPI).
 *
 * Estrategia de clasificación — DELIBERADAMENTE por CONTENIDO, no por orden de
 * aparición en el documento (el orden de los charts en el embed puede cambiar
 * si alguien edita el diseño en Infogram sin tocar el código acá):
 *
 * - TIPOS: se extrae de la tabla HTML (no del pie-chart de tipos, que también
 *   existe pero solo trae % redondeado sin conteo). Identificamos "la" tabla
 *   de tipos buscando, entre las 4 tablas del embed, la que tenga ≥6 filas
 *   cuya primera celda matchee alguno de los 9 labels canónicos de
 *   `TIPO_LABELS` — así no importa en qué posición del documento quede esa
 *   tabla. La fila total ("INMUEBLES") da `totalInmuebles`; si no aparece,
 *   se cae a la suma de counts.
 * - VENDEDOR / ANTIGÜEDAD / ANTIGÜEDAD DE PUBLICACIÓN: cada pie-chart vive en
 *   su propio `<g class="igc-graph-group">` (agrupa sus `<text
 *   class="igc-graph-pie-label">`). Por cada grupo miramos el CONTENIDO de
 *   sus labels: si alguno matchea /inmobiliaria/i → vendedor; si alguno
 *   matchea /estrenar/i → antigüedad; si alguno matchea /d[ií]as/i →
 *   antigüedad de publicación. El grupo de tipos (CASA/DEPARTAMENTOS/...) no
 *   matchea ninguno de los tres y se ignora (ya extraído de la tabla).
 *
 * FALLA RUIDOSO: tira si la tabla de tipos tiene <6 filas reconocidas, si
 * alguna de las 3 series de pie no puede clasificarse, o si el % de alguna
 * serie no suma 95-105 (headroom para redondeo, nunca para datos rotos).
 */
export function parseHydratedInfogram(html: string): InfogramComposition {
    const $ = cheerio.load(html)

    // ---- 1. TIPOS: tabla HTML (label + count + pct) ----
    let tipos: CompositionSlice[] = []
    let totalInmuebles: number | null = null

    $('table').each((_, table) => {
        if (tipos.length) return // ya encontramos la tabla correcta
        const rows: string[][] = []
        $(table).find('tr').each((_, tr) => {
            const cells: string[] = []
            $(tr).find('td').each((_, td) => { cells.push($(td).text().trim()) })
            if (cells.length) rows.push(cells)
        })

        const candidate: CompositionSlice[] = []
        let total: number | null = null
        for (const row of rows) {
            const rawLabel = (row[0] || '').toUpperCase().trim()
            const known = TIPO_LABELS[rawLabel]
            if (known) {
                const count = numLoose(row[1])
                const pctMatch = (row[2] || '').match(/(\d+(?:[.,]\d+)?)/)
                const pct = pctMatch ? parseFloat(pctMatch[1].replace(',', '.')) : NaN
                candidate.push({ label: known, pct, count })
            } else if (/^INMUEBLES?$|^TOTAL$/i.test(rawLabel)) {
                total = numLoose(row[1])
            }
        }
        if (candidate.length >= 6) {
            tipos = candidate
            totalInmuebles = total
        }
    })

    if (tipos.length < 6) {
        throw new Error(`[infogram] tabla de tipos no encontrada o incompleta (${tipos.length} filas reconocidas, esperaba ≥6)`)
    }
    if (tipos.some(t => !Number.isFinite(t.pct))) {
        throw new Error('[infogram] tabla de tipos: alguna fila sin % parseable')
    }
    assertSumInRange('tipos', tipos)

    // ---- 2. vendedor / antigüedad / antPublicacion: grupos de pie-chart ----
    const groups: string[][] = []
    $('g.igc-graph-group').each((_, g) => {
        const labels: string[] = []
        $(g).find('text.igc-graph-pie-label').each((_, t) => {
            const txt = $(t).text().trim()
            if (txt) labels.push(txt)
        })
        if (labels.length) groups.push(labels)
    })

    let vendedor: CompositionSlice[] | null = null
    let antiguedad: CompositionSlice[] | null = null
    let antPublicacion: CompositionSlice[] | null = null

    for (const labels of groups) {
        const joined = labels.join(' | ')
        if (/inmobiliaria/i.test(joined)) vendedor = labels.map(parsePieLabel)
        else if (/estrenar/i.test(joined)) antiguedad = labels.map(parsePieLabel)
        else if (/d[ií]as/i.test(joined)) antPublicacion = labels.map(parsePieLabel)
        // el grupo de tipos (CASA/DEPARTAMENTOS/...) no matchea ninguno → se
        // ignora a propósito, ya extraído de la tabla arriba.
    }

    if (!vendedor) throw new Error('[infogram] no pude clasificar la serie "vendedor" (esperaba un pie-label con /inmobiliaria/i)')
    if (!antiguedad) throw new Error('[infogram] no pude clasificar la serie "antigüedad" (esperaba un pie-label con /estrenar/i)')
    if (!antPublicacion) throw new Error('[infogram] no pude clasificar la serie "antigüedad de publicación" (esperaba un pie-label con /d[ií]as/i)')

    assertSumInRange('vendedor', vendedor)
    assertSumInRange('antigüedad', antiguedad)
    assertSumInRange('antigüedad de publicación', antPublicacion)

    if (totalInmuebles === null) {
        const sum = tipos.reduce((a, x) => a + (x.count ?? 0), 0)
        totalInmuebles = sum > 0 ? sum : null
    }

    return { tipos, antiguedad, vendedor, antPublicacion, totalInmuebles }
}

/**
 * Fetch vía ScraperAPI con render=true (necesario: el embed hidrata sus
 * charts client-side, ver header del archivo). El render es lento — timeout
 * 150s — y se reintenta UNA vez ante fallo transitorio. Costo: ~10 créditos
 * de ScraperAPI por llamada (corre 1×/día vía `refreshCore`, ver
 * `lib/market-data/ingest.ts`) — no llamar desde loops ni jobs de alta
 * frecuencia. Nunca lanza: siempre devuelve SourceResult.
 */
export async function fetchInfogramComposition(): Promise<SourceResult<InfogramComposition>> {
    const key = process.env.SCRAPER_API_KEY
    if (!key) return { ok: false, error: 'infogram: falta SCRAPER_API_KEY (requerido para renderizar el embed con JS)' }

    const proxied = `https://api.scraperapi.com?api_key=${key}&render=true&wait_for_selector=svg&url=${encodeURIComponent(INFOGRAM_EMBED_URL)}`

    let lastError: Error | null = null
    for (let attempt = 0; attempt <= 1; attempt++) {
        try {
            const res = await fetch(proxied, { signal: AbortSignal.timeout(150_000) })
            if (!res.ok) throw new Error(`HTTP ${res.status} (proxy)`)
            const html = await res.text()
            if (html.length < 10_000) throw new Error(`HTML sospechosamente corto (${html.length}b) — ¿no llegó a hidratar?`)
            return { ok: true, data: parseHydratedInfogram(html) }
        } catch (e) {
            lastError = e as Error
        }
    }
    return { ok: false, error: `infogram: ${lastError?.message}` }
}
