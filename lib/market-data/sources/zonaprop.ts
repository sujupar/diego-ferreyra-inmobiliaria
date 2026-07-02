/* ⚠️ NO VERIFICADO CONTRA HTML REAL DE ZONAPROP (2026-07-01).
 * ScraperAPI se quedó sin créditos este ciclo de facturación (403 "exhausted
 * API Credits", confirmado durante Task 3) — no hubo forma de alcanzar Zonaprop
 * para hacer el discovery del Step 1 del brief ni capturar el fixture real
 * (`lib/market-data/__fixtures__/zonaprop-palermo.html`). El parser de abajo
 * implementa la estrategia por capas del brief (JSON embebido → DOM visible)
 * pero sus selectores/regex son UNA HIPÓTESIS, no un hallazgo confirmado.
 * Por diseño FALLA RUIDOSO (throws) si no logra extraer al menos departamentos
 * + 2 tipos más — así un shape real distinto NUNCA devuelve conteos silenciosamente
 * incorrectos; `fetchZonapropTipos` atrapa ese throw y lo convierte en
 * `{ok:false}`, que el ingest (Task 7) acumula como error de barrio ('partial')
 * y el PDF cubre con fallback a imagen legacy — falla segura.
 *
 * Pendiente cuando se renueven los créditos de ScraperAPI:
 *   1. node --env-file=.env.local --import tsx scripts/capture-market-fixtures.ts
 *      (baja lib/market-data/__fixtures__/zonaprop-palermo.html)
 *   2. Correr el test con fixture (hoy SKIPPED vía it.skipIf) y ver si pasa.
 *   3. Si falla, inspeccionar el HTML real y adaptar Capa 1 (regex JSON) y/o
 *      Capa 2 (regex DOM) de abajo — mantener firma y el throw ruidoso.
 *   4. node --env-file=.env.local --import tsx scripts/verify-zonaprop-slugs.ts
 *      para corregir zonapropSlug de los 48 barrios en neighborhoods.ts. */
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

/** Extrae los 6 conteos. Capa 1: pares label/número en el/los blobs JSON embebidos
 *  (__NEXT_DATA__ / preloadedState). Capa 2: texto del DOM ("15.983 Departamentos").
 *  FALLA RUIDOSO si no encuentra al menos departamentos + otros 2 tipos. */
export function parseZonapropBarrioHtml(html: string): PropertyTypesCounts {
    const out: PropertyTypesCounts = {
        departamentos: null, terrenos: null, locales: null, casas: null, ph: null, oficinas: null, total: null,
    }
    const assign = (key: keyof Omit<PropertyTypesCounts, 'total'>, n: number) => {
        if (out[key] === null && Number.isFinite(n) && n >= 0) out[key] = n
    }

    // Capa 1: pares en JSON embebido — busca "label":"Departamentos"..."count":15983 y variantes.
    for (const [key, re] of LABELS) {
        const m = html.match(new RegExp(`"(?:label|name|title)"\\s*:\\s*"[^"]*${re.source}[^"]*"[^}]{0,120}?"(?:count|value|total|amount)"\\s*:\\s*(\\d+)`, 'i'))
            || html.match(new RegExp(`(\\d[\\d.]{1,9})\\s*(?:</[a-z]+>\\s*)*${re.source}`, 'i'))
        if (m) assign(key, parseInt(String(m[1]).replace(/\./g, ''), 10))
    }

    // Capa 2: DOM visible ("• 15.983 Departamentos")
    if (out.departamentos === null) {
        const $ = cheerio.load(html)
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
