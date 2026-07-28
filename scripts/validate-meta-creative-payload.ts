/**
 * Valida contra Meta el payload de creative con 5 textos principales + 5 títulos
 * SIN crear nada (`execution_options: ['validate_only']`).
 *
 * Por qué existe: hasta ahora el `asset_feed_spec` mandaba 1 body + 1 title. Al
 * pasar a 5+5 conviviendo con `asset_customization_rules` (feed 4:5 / story 9:16)
 * había que confirmar que Meta lo acepta — si lo rechazara, fallaría el 100% de
 * las publicaciones. Regla del proyecto: nada de integraciones Meta "completas"
 * sin una prueba real contra la API.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/validate-meta-creative-payload.ts
 */
import { createClient } from '@supabase/supabase-js'

const API = 'https://graph.facebook.com/v21.0'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta ${name}`)
  return v
}

async function main() {
  const accountIdRaw = env('META_AD_ACCOUNT_ID')
  const accountId = accountIdRaw.startsWith('act_') ? accountIdRaw : `act_${accountIdRaw}`
  const token = env('META_ACCESS_TOKEN')
  // META_PAGE_ID vive solo en Netlify; si no está local, se resuelve leyendo las
  // páginas del token (solo lectura).
  let pageId = process.env.META_PAGE_ID ?? ''
  if (!pageId) {
    const r = await fetch(`${API}/me/accounts?fields=id,name&access_token=${encodeURIComponent(token)}`)
    const j = (await r.json()) as { data?: Array<{ id: string; name: string }>; error?: unknown }
    const first = j.data?.[0]
    if (!first) throw new Error(`No se pudo resolver la Página: ${JSON.stringify(j.error ?? j)}`)
    pageId = first.id
    console.log(`Página resuelta desde el token: ${first.name} (${first.id})`)
  }

  // Par real de imágenes ya subidas a Meta (feed 4:5 + story 9:16).
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: assets } = await sb
    .from('property_ad_assets')
    .select('meta_image_hash, format')
    .not('meta_image_hash', 'is', null)
    .in('format', ['feed_vertical', 'story_vertical'])
    .limit(50)

  const feedHash = assets?.find(a => a.format === 'feed_vertical')?.meta_image_hash
  const storyHash = assets?.find(a => a.format === 'story_vertical')?.meta_image_hash
  if (!feedHash || !storyHash) {
    console.error('✗ No hay hashes de imágenes en property_ad_assets para probar. Abortando.')
    process.exit(1)
  }
  console.log(`Usando hashes reales — feed: ${feedHash.slice(0, 12)}… story: ${storyHash.slice(0, 12)}…\n`)

  const mkBodies = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ text: `Texto principal de prueba número ${i + 1}` }))
  const mkTitles = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ text: `Titulo ${i + 1}` }))

  /** Variante SIN reglas de personalización (una sola imagen para todo). */
  const buildNoRules = (nBodies: number, nTitles: number) => ({
    name: `VALIDACION sin reglas ${nBodies}b/${nTitles}t`,
    url_tags: 'utm_source=test&ad_ref=validate-only',
    object_story_spec: { page_id: pageId },
    asset_feed_spec: {
      images: [{ hash: feedHash }],
      bodies: mkBodies(nBodies),
      titles: mkTitles(nTitles),
      descriptions: [{ text: 'Descripcion de prueba' }],
      link_urls: [{ website_url: 'https://inmodf.com.ar/' }],
      call_to_action_types: ['WATCH_MORE'],
      ad_formats: ['SINGLE_IMAGE'],
    },
    execution_options: ['validate_only'],
  })

  const build = (nBodies: number, nTitles: number) => ({
    name: `VALIDACION payload ${nBodies}b/${nTitles}t`,
    url_tags: 'utm_source=test&ad_ref=validate-only',
    object_story_spec: { page_id: pageId },
    asset_feed_spec: {
      images: [
        { hash: feedHash, adlabels: [{ name: 'feed' }] },
        { hash: storyHash, adlabels: [{ name: 'story' }] },
      ],
      bodies: mkBodies(nBodies),
      titles: mkTitles(nTitles),
      descriptions: [{ text: 'Descripcion de prueba' }],
      link_urls: [{ website_url: 'https://inmodf.com.ar/' }],
      call_to_action_types: ['WATCH_MORE'],
      ad_formats: ['SINGLE_IMAGE'],
      asset_customization_rules: [
        {
          customization_spec: {
            publisher_platforms: ['facebook', 'instagram'],
            facebook_positions: ['story', 'facebook_reels'],
            instagram_positions: ['story', 'reels'],
          },
          image_label: { name: 'story' },
        },
        { customization_spec: {}, image_label: { name: 'feed' } },
      ],
    },
    // NO CREA NADA: Meta solo valida y responde.
    execution_options: ['validate_only'],
  })

  const probe = async (label: string, payload: unknown) => {
    const res = await fetch(`${API}/${accountId}/adcreatives?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json()) as Record<string, unknown>
    if (res.ok) {
      console.log(`✅ ${label} → ACEPTA`)
      return true
    }
    const err = (json.error ?? {}) as Record<string, unknown>
    console.log(`❌ ${label} → RECHAZA (subcode ${err.error_subcode}): ${err.error_user_msg ?? err.message}`)
    return false
  }

  console.log('── CON reglas de personalización (feed 4:5 + story 9:16) ──')
  await probe('5 bodies / 5 titles + reglas', build(5, 5))
  await probe('1 body  / 5 titles + reglas', build(1, 5))
  await probe('5 bodies / 1 title  + reglas', build(5, 1))
  await probe('1 body  / 1 title  + reglas', build(1, 1))

  console.log('\n── SIN reglas de personalización (1 sola imagen) ──')
  await probe('5 bodies / 5 titles sin reglas', buildNoRules(5, 5))
}

main().catch(e => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
