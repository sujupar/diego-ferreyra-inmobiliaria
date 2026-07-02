import type { BrynParsed, BrynBarrioRow, NeighborhoodPrice, SourceResult } from '../types'
import { findByText, findBySlug } from '../neighborhoods'

export const BRYN_URL = 'https://script.google.com/macros/s/AKfycbwKtvJPYs-reH0TeR9QLpAtKFdu90HAKY3NeWa5kRUqZ5ViipkGKle8kOPwNMEW4p91Mg/exec?token=bryn-monitor-2026&origen=monitorinmobiliario'
export const MI_HOME_URL = 'https://monitorinmobiliario.com/'

const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
    return Number.isFinite(n) ? n : null
}

/** Parser PURO del JSON de Bryn. FALLA RUIDOSO ante shape inesperado: preferimos
 *  no actualizar el mes (queda el anterior) antes que persistir datos a medias. */
export function parseBrynJson(raw: unknown): BrynParsed {
    const d = raw as { kpis?: Record<string, unknown>; barrios?: unknown[]; _actualizado?: string }
    if (!d || typeof d !== 'object' || !d.kpis || !Array.isArray(d.barrios)) {
        throw new Error('[bryn] shape inesperado: faltan kpis/barrios')
    }
    const barrios: BrynBarrioRow[] = d.barrios.map((b) => {
        const r = b as Record<string, unknown>
        const name = String(r.barrio ?? '')
        const canonical = findByText(name)
        if (!canonical) throw new Error(`[bryn] barrio desconocido: "${name}" — actualizar catálogo`)
        const price: NeighborhoodPrice = {
            prom: num(r.prom), vm: num(r.vm), via: num(r.via),
            usado: num(r.usado), pozo: num(r.pozo), estrenar: num(r.estrenar),
            alq2amb: num(r.alq_2amb), renta: num(r.renta), deptos: num(r.deptos),
        }
        return { slug: canonical.slug, name: canonical.name, price }
    })
    if (barrios.length !== 48) throw new Error(`[bryn] esperaba 48 barrios, llegaron ${barrios.length}`)

    const k = d.kpis
    return {
        actualizado: d._actualizado ?? null,
        cabaPrice: {
            prom: num(k.precio_prom), vm: num(k.precio_vm), via: num(k.precio_via),
            usado: num(k.precio_usado), pozo: num(k.precio_pozo), estrenar: num(k.precio_estrenar),
            alq2amb: num(k.alquiler_2amb), renta: num(k.renta_prom), deptos: num(k.stock_deptos),
        },
        stockKpis: { stockDeptos: num(k.stock_deptos), stockVm: num(k.stock_vm), absorcion: num(k.absorcion) },
        extraOferta: { terrenos: num(k.terrenos_oferta), locales: num(k.locales_oferta), oficinas: num(k.oficinas_oferta) },
        barrios,
    }
}

/** IDs del SVG del mapa que no matchean 1:1 el slug canónico (verificado con
 *  el fixture real 2026-07-01). El resto de los data-id ya SON el slug. */
const MAP_ID_ALIASES: Record<string, string> = {
    'paternal': 'la-paternal',
    'villa-gral-mitre': 'villa-general-mitre',
}

/** FALLBACK: si el JSON muere, los mismos datos básicos viven en los data-* del
 *  SVG del mapa de la home. data-vm/via/renta vienen como "+6.98%" → decimal.
 *  Matcheamos por data-id (slug estructurado, sin ambigüedad) sobre data-n
 *  (display name, a veces abreviado: "Paternal", "Lugano", "Santa Rita") — con
 *  fallback a data-n si data-id faltara en una versión futura del mapa.
 *
 *  Bug conocido del mapa en origen (2026-07-01): el polígono data-id=
 *  "villa-gral-mitre" viene rotulado data-n="Villa Ortuzar" y trae LOS DATOS de
 *  Villa Ortúzar duplicados (prom 2635/deptos 486 vs los reales 1974/255 del
 *  JSON). Cuando el label contradice al id, el barrio entra con precios null:
 *  preferimos un hueco visible antes que números de otro barrio. */
export function parseBarriosFromMapHtml(html: string): BrynBarrioRow[] {
    const tags = html.match(/<path\b[^>]*barrio-path[^>]*>/g) || []
    const pct = (s: string | undefined): number | null => {
        if (!s) return null
        const n = parseFloat(s.replace('%', '').replace('+', ''))
        return Number.isFinite(n) ? n / 100 : null
    }
    const attr = (tag: string, name: string): string | undefined =>
        (tag.match(new RegExp(`data-${name}="([^"]*)"`)) || [])[1]
    const rows: BrynBarrioRow[] = []
    const seen = new Set<string>()
    for (const tag of tags) {
        const name = attr(tag, 'n')
        if (!name) continue
        const rawId = attr(tag, 'id')
        const fromId = rawId ? findBySlug(MAP_ID_ALIASES[rawId] ?? rawId) : undefined
        const fromName = findByText(name)
        const canonical = fromId ?? fromName
        if (!canonical || seen.has(canonical.slug)) continue
        seen.add(canonical.slug)
        // Label vs id: si ambos resuelven pero a barrios DISTINTOS, los data-*
        // son sospechosos (bug del dup villa-gral-mitre) → precios null.
        const untrusted = !!fromId && !!fromName && fromId.slug !== fromName.slug
        rows.push({
            slug: canonical.slug, name: canonical.name,
            price: untrusted
                ? { prom: null, vm: null, via: null, renta: null, deptos: null, usado: null, pozo: null, estrenar: null, alq2amb: null }
                : {
                    prom: parseFloat(attr(tag, 'prom') || '') || null,
                    vm: pct(attr(tag, 'vm')), via: pct(attr(tag, 'via')), renta: pct(attr(tag, 'renta')),
                    deptos: parseFloat(attr(tag, 'deptos') || '') || null,
                    usado: null, pozo: null, estrenar: null, alq2amb: null,
                },
        })
    }
    return rows
}

/** Fetch + parse con fallback. Nunca lanza: devuelve SourceResult. */
export async function fetchBryn(): Promise<SourceResult<BrynParsed>> {
    try {
        const res = await fetch(BRYN_URL, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        let raw: unknown
        try { raw = JSON.parse(text) } catch { throw new Error('respuesta no-JSON (¿token rotado?)') }
        return { ok: true, data: parseBrynJson(raw) }
    } catch (e) {
        // Fallback: data-* del mapa de la home (solo barrios; sin kpis de stock)
        try {
            const res = await fetch(MI_HOME_URL, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const barrios = parseBarriosFromMapHtml(await res.text())
            if (barrios.length < 40) throw new Error(`fallback insuficiente: ${barrios.length} barrios`)
            return {
                ok: true,
                data: {
                    actualizado: null, barrios,
                    cabaPrice: { prom: null, vm: null, via: null, usado: null, pozo: null, estrenar: null, alq2amb: null, renta: null, deptos: null },
                    stockKpis: { stockDeptos: null, stockVm: null, absorcion: null },
                    extraOferta: { terrenos: null, locales: null, oficinas: null },
                },
            }
        } catch (e2) {
            return { ok: false, error: `bryn: ${(e as Error).message}; fallback mapa: ${(e2 as Error).message}` }
        }
    }
}
