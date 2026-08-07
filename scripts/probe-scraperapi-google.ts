/**
 * Probe del endpoint estructurado de Google Search de ScraperAPI (Task 1 del
 * plan landing-alta-conversion). Correr:
 *   node --env-file=.env.local --import tsx scripts/probe-scraperapi-google.ts
 */
async function main() {
  const key = process.env.SCRAPER_API_KEY
  if (!key) throw new Error('sin SCRAPER_API_KEY')
  const q = 'subte cerca de Palermo Buenos Aires'
  const url = `https://api.scraperapi.com/structured/google/search?api_key=${key}&query=${encodeURIComponent(q)}&country_code=ar`
  const t0 = Date.now()
  const res = await fetch(url)
  console.log('status', res.status, 'en', ((Date.now() - t0) / 1000).toFixed(1), 's')
  const text = await res.text()
  try {
    const json = JSON.parse(text) as { organic_results?: { title?: string; snippet?: string }[] }
    const n = json.organic_results?.length ?? 0
    console.log('organic_results:', n)
    for (const r of (json.organic_results ?? []).slice(0, 3)) {
      console.log('-', r.title, '—', (r.snippet ?? '').slice(0, 80))
    }
  } catch {
    console.log('NO es JSON. Primeros 500 chars:\n', text.slice(0, 500))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
