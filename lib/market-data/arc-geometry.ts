/** Geometría de donas/semi-donas para @react-pdf (Svg <Path>). Convención:
 *  0° = 12 en punto, ángulos crecen en sentido horario. */
export function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

/** Path de un segmento de dona (anillo) entre startDeg y endDeg. */
export function donutSlicePath(
    cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number,
): string {
    const so = polarPoint(cx, cy, rOuter, startDeg)
    const eo = polarPoint(cx, cy, rOuter, endDeg)
    const ei = polarPoint(cx, cy, rInner, endDeg)
    const si = polarPoint(cx, cy, rInner, startDeg)
    const large = endDeg - startDeg > 180 ? 1 : 0
    const f = (n: number) => n.toFixed(2)
    return `M ${f(so.x)} ${f(so.y)} A ${f(rOuter)} ${f(rOuter)} 0 ${large} 1 ${f(eo.x)} ${f(eo.y)} L ${f(ei.x)} ${f(ei.y)} A ${f(rInner)} ${f(rInner)} 0 ${large} 0 ${f(si.x)} ${f(si.y)} Z`
}

export interface Arc { startDeg: number; endDeg: number; index: number }

/** Reparte totalDeg entre slices por pct. Omite pct<=0. Clampa a 359.99° (un
 *  arco de 360° exactos degenera: mismo punto inicio/fin). */
export function slicesToArcs(slices: Array<{ pct: number }>, startDeg: number, totalDeg: number): Arc[] {
    const total = slices.reduce((a, s) => a + Math.max(0, s.pct), 0) || 100
    const maxDeg = Math.min(totalDeg, 359.99)
    let acc = startDeg
    const out: Arc[] = []
    slices.forEach((s, index) => {
        if (s.pct <= 0) return
        const sweep = (Math.max(0, s.pct) / total) * maxDeg
        out.push({ startDeg: acc, endDeg: acc + sweep, index })
        acc += sweep
    })
    return out
}

/** Formatos es-AR sin depender de ICU del runtime. */
export const fmtInt = (n: number | null | undefined): string =>
    n === null || n === undefined ? '—' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export const fmtPct = (decimal: number | null | undefined, digits = 1): string =>
    decimal === null || decimal === undefined ? '—'
        : `${decimal > 0 ? '+' : ''}${(decimal * 100).toFixed(digits).replace('.', ',')}%`
