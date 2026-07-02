/* Verifica que los 48 zonapropSlug del catálogo resuelvan página válida vía proxy.
 * Correr: node --env-file=.env.local --import tsx scripts/verify-zonaprop-slugs.ts
 * Salida: lista OK/FAIL por barrio. Los FAIL se corrigen editando zonapropSlug en
 * lib/market-data/neighborhoods.ts (ej. san-nicolas → centro-microcentro).
 *
 * NOTA (2026-07-01): no se pudo correr todavía — ScraperAPI está sin créditos
 * este ciclo de facturación (403 "exhausted API Credits", confirmado en Task 3).
 * Correr cuando se renueven los créditos; ver el comentario de cabecera en
 * lib/market-data/sources/zonaprop.ts para el resto de los pasos pendientes. */
import { CABA_BARRIOS } from '../lib/market-data/neighborhoods'
import { fetchZonapropTipos } from '../lib/market-data/sources/zonaprop'

async function main() {
    const barrios = CABA_BARRIOS.filter(b => !b.isGeneral)
    const failed: string[] = []
    for (const b of barrios) {
        const r = await fetchZonapropTipos(b.zonapropSlug)
        console.log(r.ok ? `OK   ${b.slug} (deptos=${r.data.departamentos})` : `FAIL ${b.slug} → ${r.error}`)
        if (!r.ok) failed.push(b.slug)
        await new Promise(res => setTimeout(res, 800))  // gentil con el proxy
    }
    console.log(`\n${barrios.length - failed.length}/48 OK. FAILs:`, failed.join(', ') || '(ninguno)')
}
main().catch(e => { console.error(e); process.exit(1) })
