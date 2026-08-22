/**
 * Exporta las imágenes NUEVAS (casa) de Roque Pérez a una carpeta accesible,
 * nombradas por anuncio + formato, para que el usuario las cambie a mano en Meta.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { Client } from 'pg'

const JOB = '6216f09b-5882-4a5b-a3e2-8c6fc6d2847f'
const ADSET_ID = '120247369303490656'
const SNAP = '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/ac7949b2-002a-4fb2-a997-01cbf673a880/scratchpad/roque-snapshot.json'
const OUT = '/Users/apple/Downloads/roque-perez-casa-imagenes'
const TOKEN = process.env.META_ACCESS_TOKEN!

async function metaGET(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  return (await fetch(`https://graph.facebook.com/v21.0${path}${sep}access_token=${encodeURIComponent(TOKEN)}`)).json()
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const snap = JSON.parse(readFileSync(SNAP, 'utf8')) as Record<string, string> // adId -> "photo_style"
  // Nombres de los ads
  const adsJ = await metaGET(`/${ADSET_ID}/ads?fields=id,name&limit=30`)
  const adName: Record<string, string> = {}
  for (const a of adsJ.data || []) adName[a.id] = a.name

  // Assets nuevos: photo_style + format -> storage_url
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const r = await c.query(
    `SELECT photo_source_index AS photo, composition_variant AS style, format, storage_url
     FROM property_ad_assets WHERE launch_job_id=$1 AND storage_url IS NOT NULL`, [JOB])
  await c.end()
  const url: Record<string, string> = {}
  for (const row of r.rows) url[`${row.photo}_${row.style}_${row.format}`] = row.storage_url

  const lines: string[] = ['CARPETA DE IMÁGENES NUEVAS (CASA) — Roque Pérez', '']
  for (const [adId, ps] of Object.entries(snap)) {
    const name = (adName[adId] || adId).replace(/[^\w\s.-]/g, '').replace(/\s+/g, '-').slice(0, 40)
    for (const [fmt, label] of [['feed_vertical', 'feed-4x5'], ['story_vertical', 'historias-9x16']] as const) {
      const u = url[`${ps}_${fmt}`]
      if (!u) { console.log(`sin url ${ps} ${fmt}`); continue }
      const res = await fetch(u)
      if (!res.ok) { console.log(`no baja ${ps} ${fmt}`); continue }
      const buf = Buffer.from(await res.arrayBuffer())
      const fname = `${name}__${label}.jpg`
      writeFileSync(`${OUT}/${fname}`, buf)
      lines.push(`${fname}  →  ${adName[adId] || adId}  (${label})`)
    }
  }
  writeFileSync(`${OUT}/_LEEME.txt`, lines.join('\n') + '\n\nEl "feed-4x5" es la imagen del feed; el "historias-9x16" es la de historias/reels.\nEspecialmente para "Ad 4" (tu anuncio con los 5 textos): cambiá su imagen por estas.\n')
  console.log(`\n✓ Imágenes en: ${OUT}`)
  console.log(lines.join('\n'))
}
main().catch((e) => { console.error(e.message); process.exit(1) })
