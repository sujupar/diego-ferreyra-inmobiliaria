/**
 * Espera el deploy de Netlify y verifica en PRODUCCIÓN los marcadores de la
 * landing v2 sobre una landing publicada real: mapa estático OSM, "m² totales".
 * Correr: node --import tsx scripts/verify-deploy-landing.ts <slug>
 */
const slug = process.argv[2] ?? 'casa-martinez-entre-rios-2333-martinez-san-isidro-rhtkob'
const url = `https://inmodf.com.ar/p/${slug}`

async function main() {
  for (let i = 1; i <= 16; i++) {
    let html = ''
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      html = await res.text()
    } catch { /* red: reintentar */ }
    if (html.includes('tile.openstreetmap.org')) {
      console.log(`DEPLOY OK (intento ${i}) — ${url}`)
      console.log('mapa estático:', (html.match(/tile\.openstreetmap\.org\/\d+\/\d+\/\d+/g) ?? []).slice(0, 2))
      console.log('m² totales:', html.includes('m² totales'))
      console.log('área total 180:', /<p[^>]*>180<\/p>/.test(html) || html.includes('>180<'))
      console.log('"Con cita previa" (content viejo, esperable hasta regenerar):', html.includes('Con cita previa'))
      console.log('atribución OSM:', html.includes('© OpenStreetMap'))
      return
    }
    console.log(`intento ${i}: todavía sin mapa (deploy en curso)`)
    await new Promise(r => setTimeout(r, 30_000))
  }
  console.log('TIMEOUT: el deploy no mostró el mapa en ~8 min — revisar Netlify')
  process.exit(1)
}
main()
