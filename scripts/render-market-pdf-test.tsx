/* Render de verificación de las páginas de mercado — AMBOS caminos (legacy y
 * data-driven). Correr: node --import tsx scripts/render-market-pdf-test.tsx
 * Salida: /tmp/market-legacy.pdf y /tmp/market-data.pdf + PNGs por página.
 * Precedente de render script en node: scripts/render-meta-audit-pdf.tsx */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToFile } from '@react-pdf/renderer'
import { PDFReportDocument } from '../components/appraisal/pdf/PDFReport'
import { calculateValuation, ValuationProperty } from '../lib/valuation/calculator'
import type { MarketDataForReport } from '../lib/market-data/types'
import { execSync } from 'child_process'

// PDFReport.tsx usa `src="/pdf-assets/..."` porque en el browser Next.js resuelve
// esas rutas relativas al folder `public/`. Corriendo standalone en Node (fuera de
// Next), @react-pdf/image trata cualquier `/algo` como ruta ABSOLUTA de filesystem
// (`path.resolve('/pdf-assets/...')` → raíz del disco), así que da ENOENT. Fix
// SOLO en este script de verificación (no se toca PDFReport.tsx ni lib/): parchear
// `fs.readFile` para redirigir `/pdf-assets/...` a `<repo>/public/pdf-assets/...`
// cuando exista ahí. @react-pdf/image importa `fs` como el módulo completo y llama
// `fs.readFile(...)` en cada request (no desestructura al cargar), así que mutar
// la propiedad alcanza.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(REPO_ROOT, 'public')
const originalReadFile = fs.readFile.bind(fs)
// @ts-expect-error — override deliberadamente laxo: solo redirige rutas /algo que
// existan bajo public/; para cualquier otro caso delega al fs.readFile real.
fs.readFile = (p: any, ...rest: any[]) => {
    if (typeof p === 'string' && p.startsWith('/')) {
        // Los <Image src> con espacios llegan URL-encoded (%20) — decodificar antes
        // de buscar en disco, igual que haría un fetch real a /public.
        const decoded = decodeURIComponent(p)
        for (const candidate of [path.join(PUBLIC_DIR, decoded), path.join(PUBLIC_DIR, p)]) {
            if (fs.existsSync(candidate)) return (originalReadFile as any)(candidate, ...rest)
        }
    }
    return (originalReadFile as any)(p, ...rest)
}

// NOTA: el mock del brief (Step 6) traía un `valuationResult: any` a mano que
// solo cubría los campos usados en páginas 3-4. El documento tiene ~15 páginas
// (comparables, semáforo, costos, estrategia) que leen MUCHOS más campos de
// ValuationResult (subjectSurface, coeficientes, comparableAnalysis[].* etc.).
// Completamos el mock usando la función real `calculateValuation` — así el
// shape queda 100% correcto sin tocar PDFReport.tsx para acomodar el mock.
const subject: ValuationProperty = {
    title: 'Miranda 5211', location: 'Miranda 5211, Palermo, Ciudad Autónoma de Buenos Aires',
    price: 120000, currency: 'USD', images: [], description: '', url: '',
    features: { coveredArea: 50, totalArea: 54, uncoveredArea: 4, rooms: 2, bedrooms: 1, bathrooms: 1, garages: 1, age: 6, floor: 3 },
}
const comparable: ValuationProperty = { ...subject, title: 'Comparable 1', price: 115000 }
const valuationResult = calculateValuation({ subject, comparables: [comparable] })
if (!valuationResult) throw new Error('calculateValuation devolvió null — revisar el mock de subject/comparable')
const marketData: MarketDataForReport = {
    period: '2026-07-01', resolvedPeriod: '2026-07-01', cabaResolvedPeriod: '2026-07-01',
    neighborhood: { slug: 'palermo', name: 'Palermo', isGeneral: false },
    caba: {
        stock: {
            stockDeptos: 79624, stockVm: 0.0297, absorcion: 21.2, totalInmuebles: 115277,
            tipos: [
                { label: 'Casa', pct: 4.87, count: 5611 }, { label: 'Departamentos', pct: 69.07, count: 79624 },
                { label: 'Terrenos', pct: 4.96, count: 5713 }, { label: 'PH', pct: 6.92, count: 7979 },
                { label: 'Local comercial', pct: 4.9, count: 5651 }, { label: 'Oficina comercial', pct: 4.0, count: 4628 },
                { label: 'Depósitos', pct: 0.54, count: 624 }, { label: 'Cocheras', pct: 3.2, count: 3691 },
                { label: 'Otros', pct: 1.52, count: 1756 },
            ],
            antiguedad: [
                { label: 'En construcción', pct: 1.81 }, { label: 'A estrenar', pct: 32.5 }, { label: 'Hasta 5 años', pct: 5.35 },
                { label: 'Entre 5 y 10', pct: 5.2 }, { label: 'Entre 10 y 20', pct: 7.27 }, { label: 'Entre 20 y 50', pct: 27.67 },
                { label: 'Más de 50', pct: 20.2 },
            ],
            vendedor: [{ label: 'Inmobiliaria', pct: 98.7 }, { label: 'Dueño directo', pct: 1.3 }],
            antPublicacion: [{ label: 'Menos de 45 días', pct: 41.04 }, { label: '45 días o más', pct: 59.0 }],
        },
        escrituras: {
            mesLabel: 'Mayo 2026', cantidad: 5435, varInteranual: -0.031, montoTexto: '$848.932 millones', hipotecas: 584,
            articleUrl: 'https://www.colegio-escribanos.org.ar/', imageUrl: null,
            summary: 'En Mayo 2026 se registraron 5.435 escrituras de compraventa en CABA (-3,1% interanual) por un monto total de $848.932 millones. Se firmaron 584 escrituras con hipoteca.',
        },
        price: { prom: 2462, vm: 0.0008, via: 0.019, usado: 2318, pozo: 3086, estrenar: 2939, alq2amb: 634679, renta: 0.0449, deptos: 79624 },
    },
    barrio: {
        price: { prom: 3403, vm: 0.0035, via: 0.0059, usado: 3051, pozo: 4225, estrenar: 3934, alq2amb: 943809, renta: 0.0552, deptos: 13892 },
        propertyTypes: { departamentos: 15983, terrenos: 339, locales: 734, casas: 251, ph: 465, oficinas: 588, total: 18360 },
    },
}

async function main() {
    // 1) LEGACY (sin marketData) — regresión: no debe tirar
    await renderToFile(
        <PDFReportDocument subject={subject} comparables={[comparable]} valuationResult={valuationResult} />,
        '/tmp/market-legacy.pdf',
    )
    console.log('OK legacy → /tmp/market-legacy.pdf')
    // 2) DATA-DRIVEN
    await renderToFile(
        <PDFReportDocument subject={subject} comparables={[comparable]} valuationResult={valuationResult}
            marketData={marketData} neighborhoodName="Palermo" />,
        '/tmp/market-data.pdf',
    )
    console.log('OK data-driven → /tmp/market-data.pdf')
    execSync('pdftoppm -png -r 60 -f 3 -l 6 /tmp/market-data.pdf /tmp/market-page && pdftoppm -png -r 60 -f 3 -l 4 /tmp/market-legacy.pdf /tmp/legacy-page')
    console.log('PNGs: /tmp/market-page-*.png /tmp/legacy-page-*.png')
}
main().catch(e => { console.error(e); process.exit(1) })
