/** Estado real de los 6 anuncios de Roque Pérez: copy (bodies/titles) + imágenes. */
import { Client } from 'pg'

const ADSET_ID = '120247369303490656'
const JOB = '6216f09b-5882-4a5b-a3e2-8c6fc6d2847f'
const TOKEN = process.env.META_ACCESS_TOKEN!
const META = 'https://graph.facebook.com/v21.0'
async function metaGET(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  return (await fetch(`${META}${path}${sep}access_token=${encodeURIComponent(TOKEN)}`)).json()
}

async function main() {
  // Hashes NUEVOS (casa) para saber qué ad quedó con imagen nueva
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const r = await c.query(`SELECT meta_image_hash AS hash FROM property_ad_assets WHERE launch_job_id=$1 AND meta_image_hash IS NOT NULL`, [JOB])
  await c.end()
  const newHashes = new Set(r.rows.map((x: { hash: string }) => x.hash))

  const ads = await metaGET(`/${ADSET_ID}/ads?fields=id,name&limit=30`)
  for (const ad of ads.data || []) {
    const j = await metaGET(`/${ad.id}?fields=name,creative{asset_feed_spec{bodies,titles,images{hash},asset_customization_rules{image_label}},object_story_spec{link_data{message,name,image_hash}}}`)
    const afs = j.creative?.asset_feed_spec
    const ld = j.creative?.object_story_spec?.link_data
    let imgs: string[] = []
    if (afs?.images) imgs = afs.images.map((i: { hash: string }) => i.hash)
    else if (ld?.image_hash) imgs = [ld.image_hash]
    const imgNueva = imgs.length > 0 && imgs.every(h => newHashes.has(h))
    console.log(`\n${ad.name} (${ad.id})`)
    console.log(`  bodies: ${afs?.bodies?.length ?? (ld?.message ? 1 : 0)} | titles: ${afs?.titles?.length ?? (ld?.name ? 1 : 0)} | reglas: ${afs?.asset_customization_rules?.length ?? 0}`)
    console.log(`  imagen NUEVA (casa): ${imgNueva ? 'SÍ' : 'NO (vieja/depto)'} | nº imágenes: ${imgs.length}`)
    const sample = afs?.bodies?.[0]?.text ?? ld?.message
    if (sample) console.log(`  1er texto: "${sample.slice(0, 55)}"`)
  }
}
main().catch((e) => { console.error(e.message); process.exit(1) })
