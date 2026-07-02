/* Captura/actualiza los fixtures REALES de las fuentes de datos de mercado.
 * Correr: node --env-file=.env.local --import tsx scripts/capture-market-fixtures.ts
 * (No requiere env vars salvo SCRAPER_API_KEY para el fixture de Zonaprop.) */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const DIR = join(process.cwd(), 'lib/market-data/__fixtures__')
const BRYN_URL = 'https://script.google.com/macros/s/AKfycbwKtvJPYs-reH0TeR9QLpAtKFdu90HAKY3NeWa5kRUqZ5ViipkGKle8kOPwNMEW4p91Mg/exec?token=bryn-monitor-2026&origen=monitorinmobiliario'

async function main() {
    mkdirSync(DIR, { recursive: true })

    // 1) JSON Bryn (sigue redirects de Apps Script)
    const bryn = await fetch(BRYN_URL, { redirect: 'follow' })
    writeFileSync(join(DIR, 'bryn.json'), await bryn.text())
    console.log('bryn.json', bryn.status)

    // 2) Home de Monitor Inmobiliario → recortar SOLO los <path barrio-path> (fixture liviano)
    const mi = await fetch('https://monitorinmobiliario.com/', { redirect: 'follow' })
    const html = await mi.text()
    const paths = html.match(/<path\b[^>]*barrio-path[^>]*>/g) || []
    writeFileSync(join(DIR, 'map-sample.html'), paths.join('\n'))
    console.log('map-sample.html paths:', paths.length)

    // 3) Infogram embed (composición del stock)
    const ig = await fetch('https://e.infogram.com/09008d4a-dcf6-4acf-aebe-18cb3cfc2f5c?src=embed', { redirect: 'follow' })
    writeFileSync(join(DIR, 'infogram.html'), await ig.text())
    console.log('infogram.html', ig.status)

    // 4) RSS del Colegio de Escribanos
    const rss = await fetch('https://www.colegio-escribanos.org.ar/category/estadisticas-de-escrituras/feed/', { redirect: 'follow' })
    writeFileSync(join(DIR, 'colegio-feed.xml'), await rss.text())
    console.log('colegio-feed.xml', rss.status)

    // 5) Zonaprop Palermo vía ScraperAPI (si hay key)
    if (process.env.SCRAPER_API_KEY) {
        const url = 'https://www.zonaprop.com.ar/barrios/capital-federal/palermo'
        const proxied = `https://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&country_code=ar&url=${encodeURIComponent(url)}`
        const zp = await fetch(proxied)
        writeFileSync(join(DIR, 'zonaprop-palermo.html'), await zp.text())
        console.log('zonaprop-palermo.html', zp.status)
    } else {
        console.log('SKIP zonaprop (sin SCRAPER_API_KEY)')
    }
}
main().catch(e => { console.error(e); process.exit(1) })
