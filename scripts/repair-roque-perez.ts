/**
 * Parte A — Roque Pérez (Coghlan): corregir tipo (departamento→casa), regenerar
 * las 12 imágenes con el tipo correcto y swapear SOLO las imágenes de los 6 anuncios
 * conservando intactos los 5 textos + 5 titulares que el usuario cargó a mano.
 *
 * Modos (argv[2]):
 *   prep   → snapshot del mapeo ad→(photo,style) ANTES de regenerar (a JSON).
 *   regen  → fija property_type='casa' + regenera las 12 piezas (runBatch).
 *   swap   → por cada ad: lee su creative ACTUAL (copy intacto), clona el copy y
 *            solo reemplaza las 2 imágenes por las nuevas del mismo (photo,style).
 *   all    → prep → regen → swap.
 * Correr: node --env-file=.env.local --import tsx scripts/repair-roque-perez.ts <modo>
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { Client } from 'pg'
import { runBatch } from '../lib/marketing/ad-image-async-runner'

const META = 'https://graph.facebook.com/v21.0'
const PROP = '863b43c5-c107-4b9e-963d-8e9d6f8b4bb9'
const JOB = '6216f09b-5882-4a5b-a3e2-8c6fc6d2847f'
const CAMPAIGN_ID = '120247369302920656'
const ADSET_ID = '120247369303490656'
const SNAP = '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/ac7949b2-002a-4fb2-a997-01cbf673a880/scratchpad/roque-snapshot.json'

const TOKEN = process.env.META_ACCESS_TOKEN!
function pg() {
  return new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
}
async function metaGET(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  return (await fetch(`${META}${path}${sep}access_token=${encodeURIComponent(TOKEN)}`)).json()
}
async function metaPOST(path: string, body: unknown) {
  const res = await fetch(`${META}${path}?access_token=${encodeURIComponent(TOKEN)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
}
function acct() { const r = process.env.META_AD_ACCOUNT_ID!; return r.startsWith('act_') ? r : `act_${r}` }

async function getAdIds(): Promise<string[]> {
  const j = await metaGET(`/${ADSET_ID}/ads?fields=id&limit=30`)
  return (j.data || []).map((a: { id: string }) => a.id)
}

/** Mapa hash → "photo_style" desde los assets ACTUALES (antes de regenerar). */
async function assetHashToPhotoStyle(): Promise<Map<string, string>> {
  const c = pg(); await c.connect()
  const r = await c.query(
    `SELECT meta_image_hash AS hash, photo_source_index AS photo, composition_variant AS style
     FROM property_ad_assets WHERE launch_job_id=$1 AND meta_image_hash IS NOT NULL`, [JOB])
  await c.end()
  const m = new Map<string, string>()
  for (const row of r.rows) m.set(row.hash, `${row.photo}_${row.style}`)
  return m
}

async function prep() {
  const adIds = await getAdIds()
  const hashMap = await assetHashToPhotoStyle()
  const snap: Record<string, string> = {}
  for (const adId of adIds) {
    const j = await metaGET(`/${adId}?fields=creative{asset_feed_spec{images{hash}}}`)
    const imgs = j.creative?.asset_feed_spec?.images || []
    // El primer hash que matchee un asset conocido nos da el (photo,style) del ad.
    let ps: string | undefined
    for (const im of imgs) { const k = hashMap.get(im.hash); if (k) { ps = k; break } }
    snap[adId] = ps ?? ''
    console.log(`ad ${adId} → ${snap[adId] || '??? (no matchea assets)'}`)
  }
  writeFileSync(SNAP, JSON.stringify(snap, null, 1))
  console.log(`✓ snapshot en ${SNAP}`)
  if (Object.values(snap).some(v => !v)) throw new Error('Algún ad no matcheó (photo,style) — abortar antes de regenerar')
}

async function regen() {
  const c = pg(); await c.connect()
  console.log('Fijando property_type=casa…')
  await c.query(`UPDATE properties SET property_type='casa' WHERE id=$1`, [PROP])
  console.log('Borrando assets viejos + job a generating…')
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
  console.log('✓ regeneradas con property_type=casa')
}

/** Mapa "photo_style" → {feedHash, storyHash} desde los assets NUEVOS. */
async function newPairs(): Promise<Map<string, { feedHash: string; storyHash: string }>> {
  const c = pg(); await c.connect()
  const r = await c.query(
    `SELECT photo_source_index AS photo, composition_variant AS style, format, meta_image_hash AS hash
     FROM property_ad_assets WHERE launch_job_id=$1 AND meta_image_hash IS NOT NULL`, [JOB])
  await c.end()
  const m = new Map<string, { feedHash: string; storyHash: string }>()
  for (const row of r.rows) {
    const k = `${row.photo}_${row.style}`
    const e = m.get(k) ?? { feedHash: '', storyHash: '' }
    if (row.format === 'feed_vertical') e.feedHash = row.hash
    if (row.format === 'story_vertical') e.storyHash = row.hash
    m.set(k, e)
  }
  return m
}

async function swap() {
  const snap = JSON.parse(readFileSync(SNAP, 'utf8')) as Record<string, string>
  const pairs = await newPairs()
  for (const [adId, ps] of Object.entries(snap)) {
    const pair = pairs.get(ps)
    if (!pair || !pair.feedHash || !pair.storyHash) { console.log(`✗ ad ${adId}: sin par nuevo para ${ps}`); continue }
    // Leer el creative ACTUAL del ad (copy intacto).
    const j = await metaGET(`/${adId}?fields=creative{object_story_spec{page_id,instagram_user_id},asset_feed_spec{bodies,titles,descriptions,link_urls,call_to_action_types,asset_customization_rules{image_label,customization_spec}}}`)
    const cur = j.creative
    const afs = cur?.asset_feed_spec
    if (!afs) { console.log(`✗ ad ${adId}: sin asset_feed_spec`); continue }
    // Clonar TODO el copy; solo cambiar images. Reconstruimos las reglas de ubicación
    // (story→9:16, default {}), matcheando los adlabels de las imágenes.
    const creative = {
      name: `Roque Pérez ${ps} (casa)`.slice(0, 80),
      object_story_spec: {
        page_id: cur.object_story_spec.page_id,
        ...(cur.object_story_spec.instagram_user_id ? { instagram_user_id: cur.object_story_spec.instagram_user_id } : {}),
      },
      asset_feed_spec: {
        images: [
          { hash: pair.feedHash, adlabels: [{ name: 'feed' }] },
          { hash: pair.storyHash, adlabels: [{ name: 'story' }] },
        ],
        bodies: afs.bodies,                 // ← 5 textos INTACTOS
        titles: afs.titles,                 // ← 5 titulares INTACTOS
        descriptions: afs.descriptions ?? [],
        link_urls: afs.link_urls,
        call_to_action_types: afs.call_to_action_types ?? ['WATCH_MORE'],
        ad_formats: ['SINGLE_IMAGE'],
        asset_customization_rules: [
          { customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'story' } },
          { customization_spec: {}, image_label: { name: 'feed' } },
        ],
      },
    }
    const rc = await metaPOST(`/${acct()}/adcreatives`, creative)
    if (!rc.ok) { console.log(`✗ ad ${adId}: creative falló ${JSON.stringify(rc.json).slice(0, 300)}`); continue }
    const ru = await metaPOST(`/${adId}`, { creative: { creative_id: rc.json.id } })
    console.log(ru.ok
      ? `✓ ad ${adId} (${ps}) → imagen nueva, ${afs.bodies.length} textos + ${afs.titles.length} titulares conservados`
      : `✗ ad ${adId}: update falló ${JSON.stringify(ru.json).slice(0, 250)}`)
  }
  console.log('✓ swap completo — copy intacto, solo cambió la imagen')
}

/**
 * Arregla los ads con VARIOS textos (5+5) que el swap normal no pudo (Meta prohíbe
 * multi-body + reglas de ubicación, subcode 1885878). Recrea el creative conservando
 * TODOS los bodies/titles + la imagen NUEVA de feed (4:5), SIN reglas (imagen única).
 * Se sacrifica la personalización por ubicación en esos ads, pero se preserva el copy.
 */
async function fixmulti() {
  const snap = JSON.parse(readFileSync(SNAP, 'utf8')) as Record<string, string>
  const pairs = await newPairs()
  for (const [adId, ps] of Object.entries(snap)) {
    const j = await metaGET(`/${adId}?fields=creative{object_story_spec{page_id,instagram_user_id},asset_feed_spec{bodies,titles,descriptions,link_urls,call_to_action_types,images{hash}}}`)
    const afs = j.creative?.asset_feed_spec
    if (!afs) { console.log(`- ad ${adId}: sin asset_feed_spec, skip`); continue }
    const nBodies = (afs.bodies || []).length
    const imgs = (afs.images || []).map((i: { hash: string }) => i.hash)
    const yaNueva = imgs.length > 0 && imgs.some((h: string) => {
      const p = pairs.get(ps); return p && (h === p.feedHash || h === p.storyHash)
    })
    if (nBodies <= 1) { console.log(`- ad ${adId}: ${nBodies} texto(s), ya lo maneja swap, skip`); continue }
    if (yaNueva) { console.log(`- ad ${adId}: ya tiene imagen nueva, skip`); continue }
    const pair = pairs.get(ps)
    if (!pair?.feedHash) { console.log(`✗ ad ${adId}: sin feedHash para ${ps}`); continue }
    // Imagen ÚNICA (feed 4:5) + todos los bodies/titles, SIN reglas.
    const creative = {
      name: `Roque Pérez ${ps} (casa, multi-texto)`.slice(0, 80),
      object_story_spec: {
        page_id: j.creative.object_story_spec.page_id,
        ...(j.creative.object_story_spec.instagram_user_id ? { instagram_user_id: j.creative.object_story_spec.instagram_user_id } : {}),
      },
      asset_feed_spec: {
        images: [{ hash: pair.feedHash }],
        bodies: afs.bodies,     // ← TODOS los textos INTACTOS
        titles: afs.titles,     // ← TODOS los titulares INTACTOS
        descriptions: afs.descriptions ?? [],
        link_urls: afs.link_urls,
        call_to_action_types: afs.call_to_action_types ?? ['WATCH_MORE'],
        ad_formats: ['SINGLE_IMAGE'],
      },
    }
    const rc = await metaPOST(`/${acct()}/adcreatives`, creative)
    if (!rc.ok) { console.log(`✗ ad ${adId}: creative falló ${JSON.stringify(rc.json).slice(0, 300)}`); continue }
    const ru = await metaPOST(`/${adId}`, { creative: { creative_id: rc.json.id } })
    console.log(ru.ok
      ? `✓ ad ${adId} (${ps}) → imagen nueva (feed 4:5, sin split), ${afs.bodies.length} textos + ${afs.titles.length} titulares INTACTOS`
      : `✗ ad ${adId}: update falló ${JSON.stringify(ru.json).slice(0, 250)}`)
  }
}

async function main() {
  const mode = process.argv[2] ?? 'prep'
  if (mode === 'fixmulti') { await fixmulti(); return }
  if (mode === 'prep' || mode === 'all') await prep()
  if (mode === 'regen' || mode === 'all') await regen()
  if (mode === 'swap' || mode === 'all') await swap()
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
