/* Genera lib/market-data/caba-map-paths.ts desde el SVG inline de monitorinmobiliario.com.
 * Correr: node --import tsx scripts/extract-caba-map.ts
 * Re-correr solo si la fuente cambia su mapa (el módulo generado se commitea). */
import { writeFileSync } from 'fs'
import { join } from 'path'

const OUT = join(process.cwd(), 'lib/market-data/caba-map-paths.ts')

function centroid(d: string): { x: number; y: number } {
    const pts = [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)]
    let sx = 0, sy = 0
    for (const p of pts) { sx += parseFloat(p[1]); sy += parseFloat(p[2]) }
    return pts.length ? { x: sx / pts.length, y: sy / pts.length } : { x: 0, y: 0 }
}

async function main() {
    const res = await fetch('https://monitorinmobiliario.com/', { redirect: 'follow' })
    const html = await res.text()
    const tags = html.match(/<path\b[^>]*barrio-path[^>]*>/g) || []
    if (tags.length !== 48) throw new Error(`esperaba 48 paths, hallé ${tags.length}`)

    const attr = (tag: string, name: string) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] || ''
    let entries = tags.map(tag => ({
        id: attr(tag, 'data-id'), name: attr(tag, 'data-n'),
        d: attr(tag, ' d'), fill: attr(tag, 'fill') || '#2b5c7c',
    }))

    // Fix del bug de la fuente: villa-ortuzar duplicado → el más al SUR es villa-general-mitre.
    // (Caso A, según el diseño original del Task 3.)
    const ortuzar = entries.filter(e => e.id === 'villa-ortuzar')
    if (ortuzar.length === 2) {
        const south = ortuzar.reduce((a, b) => centroid(a.d).y > centroid(b.d).y ? a : b)
        south.id = 'villa-general-mitre'
        south.name = 'Villa Gral. Mitre'
        console.log('fix aplicado: villa-ortuzar sur → villa-general-mitre (regla de centroide)')
    } else {
        // Caso B (el que realmente trae la fuente al día de hoy, verificado 2026-07-01):
        // NO hay data-id duplicado — hay 48 ids únicos, pero algunos usan un alias
        // distinto al slug canónico de ALL_CABA_SLUGS. En particular `villa-gral-mitre`
        // es un polígono propio (geometría distinta a `villa-ortuzar`) pero mal
        // etiquetado con data-n="Villa Ortuzar" (bug de datos de la fuente, copy-paste).
        // Se corrige el id Y el nombre. `paternal` solo difiere en el id (el nombre
        // corto ya es correcto). `lugano`/`santa-rita` se incluyen por si la fuente
        // cambia de convención en el futuro; hoy ya llegan como villa-lugano/villa-santa-rita.
        const ALIASES: Record<string, { id: string; name?: string }> = {
            'villa-gral-mitre': { id: 'villa-general-mitre', name: 'Villa Gral. Mitre' },
            'paternal': { id: 'la-paternal' },
            'lugano': { id: 'villa-lugano' },
            'santa-rita': { id: 'villa-santa-rita' },
        }
        for (const e of entries) {
            const alias = ALIASES[e.id]
            if (alias) {
                console.log(`fix aplicado: alias ${e.id} → ${alias.id}`)
                e.id = alias.id
                if (alias.name) e.name = alias.name
            }
        }
    }

    const ids = entries.map(e => e.id)
    if (new Set(ids).size !== 48) throw new Error(`ids duplicados tras el fix: ${ids.filter((v, i) => ids.indexOf(v) !== i).join(',')}`)

    // viewBox del bbox REAL de las coordenadas (+padding), NO del <svg> del documento.
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    for (const e of entries) {
        for (const p of e.d.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)) {
            const x = parseFloat(p[1]), y = parseFloat(p[2])
            if (x < minX) minX = x; if (x > maxX) maxX = x
            if (y < minY) minY = y; if (y > maxY) maxY = y
        }
    }
    const pad = 6
    const viewBox = `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + 2 * pad).toFixed(1)} ${(maxY - minY + 2 * pad).toFixed(1)}`

    const body = `// GENERADO por scripts/extract-caba-map.ts — NO editar a mano.
// Fuente: SVG inline de monitorinmobiliario.com (48 barrios, fix villa-general-mitre aplicado).
export const CABA_MAP_VIEWBOX = '${viewBox}'

export interface CabaMapPath { id: string; name: string; d: string; fill: string }

export const CABA_MAP_PATHS: CabaMapPath[] = ${JSON.stringify(entries, null, 2)}
`
    writeFileSync(OUT, body)
    console.log(`OK: ${entries.length} paths, viewBox=${viewBox} → ${OUT}`)
}
main().catch(e => { console.error(e); process.exit(1) })
