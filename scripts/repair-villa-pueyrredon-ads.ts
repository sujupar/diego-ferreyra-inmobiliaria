/**
 * Reparación de la campaña Meta de Villa Pueyrredón (job c317c14d).
 * Arma 6 anuncios con personalización por ubicación (feed 4:5 + historias 9:16),
 * Instagram asociado y CTA "Ver más" (WATCH_MORE), a partir de las 12 piezas ya
 * generadas y subidas a Meta. Reusa el adset existente.
 *
 * Modos (argv[2]):
 *   test   → crea 1 creative de prueba, imprime la respuesta de Meta y verifica
 *            el creative (IG + CTA + asset customization). NO crea el ad todavía.
 *   test-ad→ crea 1 creative + 1 ad (PAUSED) y verifica el ad. (Deja 1 ad de prueba.)
 *   build  → crea los 6 ads (PAUSED) + archiva el ad roto. NO activa nada.
 *   inspect→ imprime el estado actual de la campaña/adset/ads.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/repair-villa-pueyrredon-ads.ts <modo>
 */
import { Client } from 'pg'

const META = 'https://graph.facebook.com/v21.0'
const JOB = 'c317c14d-2fa0-49d7-adbd-fc4a5e9a21be'
const PROP = '74d1772d-e572-4b4e-b3f0-08bbc52b14ce'
const CAMPAIGN_ID = '120246778756390656'
const ADSET_ID = '120246778756880656'
const BROKEN_AD_ID = '120246778758130656'
const PAGE_ID = '103823292484521'
const IG_ID = '17841421542114621' // @inmobiliariadiegoferreyra
const CTA = 'WATCH_MORE' // "Ver más" (pedido por el usuario)

function acct(): string {
  const raw = process.env.META_AD_ACCOUNT_ID!
  return raw.startsWith('act_') ? raw : `act_${raw}`
}
const TOKEN = process.env.META_ACCESS_TOKEN!

async function metaPOST(path: string, body: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${META}${path}?access_token=${encodeURIComponent(TOKEN)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}
async function metaGET(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${META}${path}${sep}access_token=${encodeURIComponent(TOKEN)}`)
  return res.json()
}

interface Pair { photo: number; style: number; feedHash: string; storyHash: string }

async function loadData() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const assets = await c.query(
    `SELECT photo_source_index AS photo, composition_variant AS style, format, meta_image_hash AS hash
     FROM property_ad_assets WHERE launch_job_id=$1 AND meta_image_hash IS NOT NULL
     ORDER BY photo_source_index, composition_variant`, [JOB],
  )
  const camp = await c.query(
    `SELECT landing_url, copy FROM property_meta_campaigns WHERE property_id=$1 AND status<>'archived' LIMIT 1`, [PROP],
  )
  await c.end()

  // Agrupar en 6 pares (photo,style) → {feedHash, storyHash}
  const map = new Map<string, Pair>()
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
  return { pairs, copy, landing }
}

/** Creative con personalización por ubicación: feed=4:5, historias/reels=9:16. */
function buildCreative(pair: Pair, idx: number, copy: { primaryTexts: string[]; headlines: string[]; description: string }, landing: string) {
  const primary = copy.primaryTexts[idx] ?? copy.primaryTexts[0]
  const headline = copy.headlines[idx] ?? copy.headlines[0]
  return {
    name: `VP pieza ${idx + 1} (foto ${pair.photo} estilo ${pair.style})`.slice(0, 80),
    object_story_spec: { page_id: PAGE_ID, instagram_user_id: IG_ID },
    asset_feed_spec: {
      images: [
        { hash: pair.feedHash, adlabels: [{ name: 'feed' }] },
        { hash: pair.storyHash, adlabels: [{ name: 'story' }] },
      ],
      bodies: [{ text: primary }],
      titles: [{ text: headline }],
      descriptions: [{ text: copy.description }],
      link_urls: [{ website_url: landing }],
      call_to_action_types: [CTA],
      ad_formats: ['SINGLE_IMAGE'],
      asset_customization_rules: [
        {
          // Regla específica: historias/reels → imagen 9:16.
          customization_spec: {
            publisher_platforms: ['facebook', 'instagram'],
            facebook_positions: ['story', 'facebook_reels'],
            instagram_positions: ['story', 'reels'],
          },
          image_label: { name: 'story' },
        },
        {
          // Regla POR DEFECTO (menor prioridad): spec VACÍO → captura todo el resto
          // (feed, etc.) con la imagen 4:5. Meta exige esta regla default con {}.
          customization_spec: {},
          image_label: { name: 'feed' },
        },
      ],
    },
  }
}

async function main() {
  const mode = process.argv[2] ?? 'inspect'
  const { pairs, copy, landing } = await loadData()
  console.log(`Pares cargados: ${pairs.length} (esperado 6)`)

  if (mode === 'inspect') {
    const ads = await metaGET(`/${ADSET_ID}/ads?fields=id,name,status,creative{id,call_to_action_type}`)
    console.log(JSON.stringify(ads, null, 1))
    return
  }

  if (mode === 'test') {
    const creative = buildCreative(pairs[0], 0, copy, landing)
    console.log('=== creative que se manda ===')
    console.log(JSON.stringify(creative, null, 1).slice(0, 900))
    const r = await metaPOST(`/${acct()}/adcreatives`, creative)
    console.log(`\n=== respuesta Meta (status ${r.status}) ===`)
    console.log(JSON.stringify(r.json, null, 1).slice(0, 1500))
    if (r.ok && r.json.id) {
      const verify = await metaGET(`/${r.json.id}?fields=id,name,object_story_spec,asset_feed_spec,call_to_action_type`)
      console.log('\n=== creative creado (verificación IG/CTA/assets) ===')
      console.log(JSON.stringify(verify, null, 1).slice(0, 1800))
    }
    return
  }

  if (mode === 'test-ad') {
    const creative = buildCreative(pairs[0], 0, copy, landing)
    const rc = await metaPOST(`/${acct()}/adcreatives`, creative)
    if (!rc.ok) { console.log('creative falló', JSON.stringify(rc.json)); return }
    const ra = await metaPOST(`/${acct()}/ads`, {
      name: `Ad prueba VP`, adset_id: ADSET_ID, creative: { creative_id: rc.json.id }, status: 'PAUSED',
    })
    console.log(`ad status ${ra.status}:`, JSON.stringify(ra.json, null, 1).slice(0, 600))
    if (ra.ok) {
      const v = await metaGET(`/${ra.json.id}?fields=id,name,status,creative{id,object_story_spec{page_id,instagram_user_id},call_to_action_type}`)
      console.log('=== ad verificado ==='); console.log(JSON.stringify(v, null, 1))
    }
    return
  }

  if (mode === 'build') {
    const created: string[] = []
    for (let i = 0; i < pairs.length; i++) {
      const rc = await metaPOST(`/${acct()}/adcreatives`, buildCreative(pairs[i], i, copy, landing))
      if (!rc.ok) { console.log(`creative ${i} FALLÓ`, JSON.stringify(rc.json).slice(0, 400)); continue }
      const ra = await metaPOST(`/${acct()}/ads`, {
        name: `Ad ${i + 1}: ${copy.headlines[i] ?? ''}`.slice(0, 80),
        adset_id: ADSET_ID, creative: { creative_id: rc.json.id }, status: 'PAUSED',
      })
      if (ra.ok) { created.push(ra.json.id); console.log(`✓ ad ${i + 1}: ${ra.json.id}`) }
      else console.log(`ad ${i} FALLÓ`, JSON.stringify(ra.json).slice(0, 400))
    }
    console.log(`\nCreados ${created.length}/6 ads:`, created)
    // Archivar el ad roto (foto cruda)
    const arch = await metaPOST(`/${BROKEN_AD_ID}`, { status: 'ARCHIVED' })
    console.log(`Archivado ad roto ${BROKEN_AD_ID}: status ${arch.status}`, arch.ok ? '' : JSON.stringify(arch.json).slice(0, 200))
    // Persistir los nuevos ad_ids en la DB (el panel de la app los lee de ahí)
    if (created.length > 0) {
      const c = new Client({
        host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
        user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
        database: 'postgres', ssl: { rejectUnauthorized: false },
      })
      await c.connect()
      await c.query(`UPDATE property_meta_campaigns SET ad_ids=$1 WHERE campaign_id=$2`, [created, CAMPAIGN_ID])
      await c.end()
      console.log('DB actualizada: ad_ids =', JSON.stringify(created))
    }
    return
  }
}
main().catch(e => { console.error(e); process.exit(1) })
