/**
 * Regenera las 12 piezas de Villa Pueyrredón con el overlay NUEVO (badge "En venta"
 * + tipo capitalizado) y actualiza los 6 anuncios existentes con las imágenes nuevas.
 * Reusa el pipeline runBatch (reaprovecha las fotos mejoradas cacheadas → sin OpenAI).
 *
 * Modos (argv[2]): regen | update-ads | all
 * Correr: node --env-file=.env.local --import tsx scripts/regenerate-villa-pueyrredon.ts all
 */
import { Client } from 'pg'
import { runBatch } from '../lib/marketing/ad-image-async-runner'

const META = 'https://graph.facebook.com/v21.0'
const JOB = 'c317c14d-2fa0-49d7-adbd-fc4a5e9a21be'
const CAMPAIGN_ID = '120246778756390656'
const PAGE_ID = '103823292484521'
const IG_ID = '17841421542114621'
const CTA = 'WATCH_MORE'

function acct(): string {
  const raw = process.env.META_AD_ACCOUNT_ID!
  return raw.startsWith('act_') ? raw : `act_${raw}`
}
const TOKEN = process.env.META_ACCESS_TOKEN!

function pg() {
  return new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
}
async function metaPOST(path: string, body: unknown) {
  const res = await fetch(`${META}${path}?access_token=${encodeURIComponent(TOKEN)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
}

async function regen() {
  const c = pg(); await c.connect()
  console.log('Borrando 12 assets viejos + poniendo el job en generating…')
  await c.query(`DELETE FROM property_ad_assets WHERE launch_job_id=$1`, [JOB])
  await c.query(`UPDATE meta_launch_jobs SET status='generating', progress_percent=0 WHERE id=$1`, [JOB])
  await c.end()

  let done = false, guard = 0
  try {
    while (!done && guard++ < 15) {
      const r = await runBatch({ jobId: JOB, batchSize: 4 })
      console.log(`  batch: ${r.totalGenerated}/${r.totalPieces} done=${r.done} fails=${r.failures}`)
      done = r.done
    }
  } finally {
    const c2 = pg(); await c2.connect()
    await c2.query(`UPDATE meta_launch_jobs SET status='published', progress_percent=100 WHERE id=$1`, [JOB])
    await c2.end()
  }
  if (!done) throw new Error('No se regeneraron las 12 piezas')
  console.log('✓ 12 piezas regeneradas con el overlay nuevo, job restaurado a published')
}

async function updateAds() {
  const c = pg(); await c.connect()
  const assets = await c.query(
    `SELECT photo_source_index AS photo, composition_variant AS style, format, meta_image_hash AS hash
     FROM property_ad_assets WHERE launch_job_id=$1 AND meta_image_hash IS NOT NULL
     ORDER BY photo_source_index, composition_variant`, [JOB])
  const camp = await c.query(
    `SELECT landing_url, copy, ad_ids FROM property_meta_campaigns WHERE campaign_id=$1`, [CAMPAIGN_ID])
  await c.end()

  const map = new Map<string, { photo: number; style: number; feedHash: string; storyHash: string }>()
  for (const r of assets.rows) {
    const key = `${r.photo}_${r.style}`
    const p = map.get(key) ?? { photo: r.photo, style: r.style, feedHash: '', storyHash: '' }
    if (r.format === 'feed_vertical') p.feedHash = r.hash
    if (r.format === 'story_vertical') p.storyHash = r.hash
    map.set(key, p)
  }
  const pairs = [...map.values()].filter(p => p.feedHash && p.storyHash)
  const copy = camp.rows[0].copy as { primaryTexts: string[]; headlines: string[]; description: string }
  const landing = camp.rows[0].landing_url as string
  const adIds = camp.rows[0].ad_ids as string[]
  console.log(`Pares nuevos: ${pairs.length} | ads a actualizar: ${adIds.length}`)
  if (pairs.length !== adIds.length) {
    console.warn(`OJO: ${pairs.length} pares vs ${adIds.length} ads — se actualizan los primeros ${Math.min(pairs.length, adIds.length)}`)
  }

  const n = Math.min(pairs.length, adIds.length)
  for (let i = 0; i < n; i++) {
    const pair = pairs[i]
    const creative = {
      name: `VP pieza ${i + 1} (foto ${pair.photo} estilo ${pair.style})`.slice(0, 80),
      object_story_spec: { page_id: PAGE_ID, instagram_user_id: IG_ID },
      asset_feed_spec: {
        images: [
          { hash: pair.feedHash, adlabels: [{ name: 'feed' }] },
          { hash: pair.storyHash, adlabels: [{ name: 'story' }] },
        ],
        bodies: [{ text: copy.primaryTexts[i] ?? copy.primaryTexts[0] }],
        titles: [{ text: copy.headlines[i] ?? copy.headlines[0] }],
        descriptions: [{ text: copy.description }],
        link_urls: [{ website_url: landing }],
        call_to_action_types: [CTA],
        ad_formats: ['SINGLE_IMAGE'],
        asset_customization_rules: [
          { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'story' } },
          { customization_spec: {}, image_label: { name: 'feed' } },
        ],
      },
    }
    const rc = await metaPOST(`/${acct()}/adcreatives`, creative)
    if (!rc.ok) { console.log(`  ✗ creative ${i + 1} falló:`, JSON.stringify(rc.json).slice(0, 300)); continue }
    // Swap del creative en el ad existente (mismo ad_id, nueva imagen)
    const ru = await metaPOST(`/${adIds[i]}`, { creative: { creative_id: rc.json.id } })
    console.log(ru.ok ? `  ✓ ad ${i + 1} (${adIds[i]}) actualizado → creative ${rc.json.id}` : `  ✗ ad ${i + 1} update falló: ${JSON.stringify(ru.json).slice(0, 200)}`)
  }
  console.log('✓ anuncios actualizados con las imágenes nuevas (vuelven a revisión de Meta)')
}

async function main() {
  const mode = process.argv[2] ?? 'all'
  if (mode === 'regen' || mode === 'all') await regen()
  if (mode === 'update-ads' || mode === 'all') await updateAds()
}
main().catch(e => { console.error(e); process.exit(1) })
