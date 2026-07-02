/* ✅ VERIFICADO CONTRA HTML REAL DE ZONAPROP (2026-07-02).
 * Con los créditos de ScraperAPI recargados se capturó el fixture real
 * (`lib/market-data/__fixtures__/zonaprop-palermo.html`, HTTP 200 vía proxy,
 * ~60KB). Estructura REAL confirmada:
 *
 * - La página `/barrios/capital-federal/{slug}` es HTML server-rendered
 *   PLANO (JSP/Spring, no SPA) — NO hay `__NEXT_DATA__`, `preloadedState` ni
 *   ningún blob JSON con pares label/count. La hipótesis "Capa 1: JSON
 *   embebido" del diseño original era incorrecta — se eliminó.
 * - Los 6 conteos viven en un bloque DOM bien delimitado:
 *     <div class="row en-numeros">
 *       <div class="col-... custom-chart-legend">
 *         <span class="custom-chart-point custom-chart-legend-blue"></span>
 *         <span class="number">15.983</span>
 *         <span>Departamentos</span>
 *       </div>
 *       ... (6 divs .custom-chart-legend en total, repartidos en 2 filas
 *            .en-numeros: Departamentos/Terrenos/Locales Comerciales,
 *            Casas/PH/Oficinas)
 *     </div>
 *   El número está en `.number`, la etiqueta es el ÚLTIMO `<span>` del div
 *   (sin clase). Selector CSS específico → muy robusto ante cambios de copy.
 * - Ojo: el párrafo intro ("El barrio de Palermo ... cuenta con 251 casas y
 *   15.983 departamentos en Zonaprop") repite los valores de Departamentos y
 *   Casas en texto libre ANTES del bloque `.en-numeros` — coincide con el
 *   widget (misma fuente de datos) pero por eso el fallback Capa 2 (texto
 *   plano de toda la página) NO se usa como capa 1: el selector DOM
 *   específico es preferible porque apunta exactamente al widget de los 6
 *   tipos y no depende de que el copy narrativo siga mencionando los mismos
 *   valores en el futuro.
 *
 * Por diseño sigue FALLANDO RUIDOSO (throws) si no logra extraer al menos
 * departamentos + 2 tipos más — así un shape real distinto NUNCA devuelve
 * conteos silenciosamente incorrectos; `fetchZonapropTipos` atrapa ese throw
 * y lo convierte en `{ok:false}`, que el ingest acumula como error de barrio
 * ('partial') y el PDF cubre con fallback a imagen legacy — falla segura. */
import * as cheerio from 'cheerio'
import type { PropertyTypesCounts, SourceResult } from '../types'

export const ZONAPROP_BARRIO_URL = (zonapropSlug: string) =>
    `https://www.zonaprop.com.ar/barrios/capital-federal/${zonapropSlug}`

const LABELS: Array<[keyof Omit<PropertyTypesCounts, 'total'>, RegExp]> = [
    ['departamentos', /departamentos?/i],
    ['terrenos', /terrenos?/i],
    ['locales', /locales(?:\s+comerciales)?/i],
    ['casas', /casas?/i],
    ['ph', /\bph\b/i],
    ['oficinas', /oficinas?/i],
]

/** Extrae los 6 conteos. Capa 1: bloque DOM `.en-numeros .custom-chart-legend`
 *  (verificado contra HTML real, ver header). Capa 2 (fallback): texto plano
 *  de todo el documento, por si el markup cambia pero el patrón
 *  "15.983 Departamentos" se mantiene en algún lado de la página.
 *  FALLA RUIDOSO si no encuentra al menos departamentos + otros 2 tipos. */
export function parseZonapropBarrioHtml(html: string): PropertyTypesCounts {
    const out: PropertyTypesCounts = {
        departamentos: null, terrenos: null, locales: null, casas: null, ph: null, oficinas: null, total: null,
    }
    const assign = (key: keyof Omit<PropertyTypesCounts, 'total'>, n: number) => {
        if (out[key] === null && Number.isFinite(n) && n >= 0) out[key] = n
    }
    const matchLabel = (label: string): (keyof Omit<PropertyTypesCounts, 'total'>) | null => {
        for (const [key, re] of LABELS) if (re.test(label)) return key
        return null
    }

    const $ = cheerio.load(html)

    // Capa 1: bloque específico de "Tipos de propiedades" — un <div class="custom-chart-legend">
    // por tipo, con el número en .number y la etiqueta en el último <span>.
    $('.en-numeros .custom-chart-legend').each((_, el) => {
        const $el = $(el)
        const numTxt = $el.find('.number').first().text().trim()
        const labelTxt = $el.find('span').last().text().trim()
        const key = labelTxt ? matchLabel(labelTxt) : null
        if (key && numTxt) assign(key, parseInt(numTxt.replace(/\./g, ''), 10))
    })

    // Capa 2 (fallback): texto plano de toda la página ("15.983 Departamentos").
    if (out.departamentos === null) {
        const text = $.root().text().replace(/\s+/g, ' ')
        for (const [key, re] of LABELS) {
            const m = text.match(new RegExp(`([\\d.]{1,9})\\s+${re.source}`, 'i'))
            if (m) assign(key, parseInt(m[1].replace(/\./g, ''), 10))
        }
    }

    const found = LABELS.filter(([k]) => out[k] !== null).length
    if (out.departamentos === null || found < 3) {
        throw new Error(`[zonaprop] no pude extraer los conteos (hallados: ${found}/6) — revisar shape/bloqueo`)
    }
    out.total = LABELS.reduce((a, [k]) => a + (out[k] ?? 0), 0)
    return out
}

/** Fetch de UN barrio vía ScraperAPI (Zonaprop bloquea IPs cloud). */
export async function fetchZonapropTipos(zonapropSlug: string): Promise<SourceResult<PropertyTypesCounts>> {
    const key = process.env.SCRAPER_API_KEY
    if (!key) return { ok: false, error: 'zonaprop: falta SCRAPER_API_KEY' }
    const target = ZONAPROP_BARRIO_URL(zonapropSlug)
    const proxied = `https://api.scraperapi.com?api_key=${key}&country_code=ar&url=${encodeURIComponent(target)}`
    try {
        const res = await fetch(proxied, { signal: AbortSignal.timeout(45_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status} (proxy)`)
        const html = await res.text()
        if (html.length < 1000) throw new Error(`HTML sospechosamente corto (${html.length}b)`)
        return { ok: true, data: parseZonapropBarrioHtml(html) }
    } catch (e) {
        return { ok: false, error: `zonaprop[${zonapropSlug}]: ${(e as Error).message}` }
    }
}
