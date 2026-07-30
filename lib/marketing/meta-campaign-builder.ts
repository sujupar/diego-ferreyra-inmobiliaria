/**
 * Constructor de campañas Meta Ads para propiedades.
 *
 * Flow:
 *   1. createCampaignForProperty(property) →
 *      - Crea Campaign (OUTCOME_LEADS, PAUSED)
 *      - Sube imagen hero → adimages
 *      - Crea AdCreative (link a la landing /p/[slug])
 *      - Crea AdSet (targeting + budget + optimization_goal LEAD_GENERATION)
 *      - Crea Ad linkeando adset + creative
 *      - Smoke test de landing → si 200, activa la campaign
 *      - Persiste todo en property_meta_campaigns
 *   2. pauseCampaign(campaignId) → PUT status=PAUSED
 *   3. activateCampaign(campaignId) → PUT status=ACTIVE
 *   4. fetchCampaignInsights(campaignId, since) → GET /insights
 *
 * Meta Marketing API v21.0. Reusa el access token del módulo meta-ads.ts.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { Property } from '@/lib/portals/types'
import { decideBudget } from './budget-rules'
import { META_ABSOLUTE_CEILING_ARS } from './budget-limits'
import { decideTargeting } from './targeting-rules'
import { generateAdCopyVariations, variationsToPrimary } from './copy-ai-generator'
import { getUsdToArs } from './usd-rate'
import { analyzePropertyPhotos, type PropertyHighlight } from './property-vision-analyzer'
import { generateAdImage } from './ad-image-generator'
import { runWithConcurrency } from '@/lib/util/concurrency'
import { isCampaignComplete } from './campaign-completeness'

const META_API = 'https://graph.facebook.com/v21.0'

function getMeta() {
  const accountIdRaw = process.env.META_AD_ACCOUNT_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  const pageId = process.env.META_PAGE_ID
  if (!accountIdRaw || !accessToken) {
    throw new Error('META_AD_ACCOUNT_ID o META_ACCESS_TOKEN faltantes')
  }
  if (!pageId) {
    throw new Error('META_PAGE_ID faltante (necesario para vincular ads a la página)')
  }
  const accountId = accountIdRaw.startsWith('act_') ? accountIdRaw : `act_${accountIdRaw}`
  return { accountId, accessToken, pageId }
}

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Lee los audience_ids de las etapas marcadas `exclude_from_prospecting=true`
 * (Captado/Perdido) en `funnel_meta_audiences`, para excluirlos del targeting
 * de prospecting (no re-impactar a quien ya captamos o perdimos).
 *
 * Best-effort: si la tabla no existe (migración Fase 4 sin aplicar todavía),
 * la query falla, o no hay públicos marcados, devuelve [] y la campaña se
 * arma SIN exclusión (no rompe el flow). Cliente admin SIN tipar: la tabla
 * `funnel_meta_audiences` no está en types/database.types.ts.
 */
async function getProspectingExclusionAudienceIds(): Promise<string[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data, error } = await supabase
      .from('funnel_meta_audiences')
      .select('audience_id')
      .eq('exclude_from_prospecting', true)
    if (error) {
      console.warn('[meta-builder] no se pudieron leer públicos a excluir (continuando):', error.message)
      return []
    }
    return ((data ?? []) as { audience_id: string | null }[])
      .map((r) => r.audience_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch (err) {
    console.warn('[meta-builder] excepción leyendo públicos a excluir (continuando):', err)
    return []
  }
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'
}

class MetaApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryable: boolean) {
    super(message)
  }
}

async function metaFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { accessToken } = getMeta()
  const url = path.startsWith('http') ? path : `${META_API}${path}`
  const separator = url.includes('?') ? '&' : '?'
  const fullUrl = `${url}${separator}access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(fullUrl, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    const retryable = res.status >= 500 || res.status === 429
    throw new MetaApiError(`Meta ${res.status} ${path}: ${text}`, res.status, retryable)
  }
  return res.json() as Promise<T>
}

export interface CampaignResult {
  campaignId: string
  adsetId: string
  adIds: string[]
  budgetDailyArs: number
  landingUrl: string
  /** Anuncios que se esperaba crear (= piezas disponibles). */
  expectedAds: number
  /** Variantes que no se pudieron crear ni en el reintento (índice 0-based + motivo). */
  failedVariants: Array<{ index: number; error: string }>
}

/**
 * Sube bytes a Meta como ad image. Devuelve el hash.
 *
 * Estrategia: multipart bytes (NO el modo `?url=` que requiere capability
 * avanzada que la mayoría de apps no tienen). Funciona con permisos básicos
 * de ads_management.
 */
async function uploadAdImageBytes(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const { accountId, accessToken } = getMeta()
  const form = new FormData()
  form.set('access_token', accessToken)
  form.set(filename, new Blob([new Uint8Array(buffer)], { type: mimeType }), filename)

  const res = await fetch(`${META_API}/${accountId}/adimages`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new MetaApiError(
      `Meta adimages ${res.status}: ${text}`,
      res.status,
      res.status >= 500 || res.status === 429,
    )
  }
  const data = (await res.json()) as { images?: Record<string, { hash: string }> }
  const first = Object.values(data.images ?? {})[0]
  if (!first?.hash) throw new MetaApiError('No image hash en respuesta', 500, true)
  return first.hash
}

/**
 * Wrapper que acepta una URL pública de foto. Descarga y sube los bytes.
 */
async function uploadAdImage(photoUrl: string): Promise<string> {
  const imgRes = await fetch(photoUrl)
  if (!imgRes.ok) {
    throw new MetaApiError(
      `No se pudo descargar la foto ${photoUrl}: ${imgRes.status}`,
      imgRes.status,
      imgRes.status >= 500,
    )
  }
  const buf = Buffer.from(await imgRes.arrayBuffer())
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const mimeType = allowedTypes.find(t => contentType.startsWith(t)) ?? 'image/jpeg'
  const rawName = photoUrl.split('/').pop()?.split('?')[0] ?? 'image'
  const ext = mimeType.split('/')[1] ?? 'jpg'
  const filename = rawName.includes('.') ? rawName : `${rawName}.${ext}`
  return uploadAdImageBytes(buf, mimeType, filename)
}

/**
 * Obtiene o genera la imagen del anuncio para un highlight específico.
 *
 * Flow con cache:
 *  1. Mirar `property_ad_assets` si ya hay meta_image_hash para
 *     (property, highlight, format). Si sí → reusar.
 *  2. Si no, generar con Gemini 2.5 Flash Image.
 *  3. Si Gemini falla → fallback a la foto original (sin texto/overlay).
 *  4. Subir bytes a Meta /adimages.
 *  5. Persistir hash en property_ad_assets.
 *
 * Devuelve el meta_image_hash listo para usar en el AdCreative.
 */
async function getOrGenerateAdImageHash(input: {
  property: Property
  highlight: PropertyHighlight
  copyHeadline: string
  format?: 'feed_square' | 'feed_vertical' | 'story_vertical'
  compositionStyle?:
    | 'hero_full_bleed'
    | 'split_photo_info'
    | 'editorial_magazine'
    | 'minimalist_whitespace'
    | 'color_overlay_solid'
    | 'typography_dominant'
  /** Sobreescribe la foto base que va a usar Gemini (no usa la del highlight). */
  overridePhotoUrl?: string
  /** Sufijo extra para el cache key — útil para distinguir estilos distintos
   *  del mismo highlight. Si se setea, la cache key efectiva es
   *  highlight_id + cacheKeySuffix. */
  cacheKeySuffix?: string
}): Promise<string> {
  const format = input.format ?? 'feed_square'
  const supabase = getSupabase()
  const cacheHighlightKey = input.highlight.id + (input.cacheKeySuffix ?? '')

  // 1. Cache hit?
  // Cast porque property_ad_assets no está en types/database.types.ts todavía
  // (la migración 20260523000001 la ejecuta el usuario manualmente en SQL Editor).
  type AdAssetRow = { meta_image_hash: string | null }
  const cacheRes = await (supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (a: string, b: string) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => {
              maybeSingle: () => Promise<{ data: AdAssetRow | null }>
            }
          }
        }
      }
    }
  })
    .from('property_ad_assets')
    .select('meta_image_hash')
    .eq('property_id', input.property.id)
    .eq('highlight_id', cacheHighlightKey)
    .eq('format', format)
    .maybeSingle()
  if (cacheRes.data?.meta_image_hash) {
    return cacheRes.data.meta_image_hash
  }

  // 2. Intentar generar con Gemini
  const generated = await generateAdImage({
    property: input.property,
    highlight: input.highlight,
    copyHeadline: input.copyHeadline,
    format,
    compositionStyle: input.compositionStyle,
    overridePhotoUrl: input.overridePhotoUrl,
  })

  let metaHash: string
  let promptHash: string | null = null
  if (generated) {
    promptHash = generated.promptHash
    metaHash = await uploadAdImageBytes(
      generated.buffer,
      generated.mimeType,
      `${input.property.public_slug ?? input.property.id}_${input.highlight.id}_${format}.jpg`,
    )
  } else {
    // 3. Fallback: foto rotada (no la #0 por default — eso causaba 10 ads
    //    con la misma foto).
    const photoUrl =
      input.overridePhotoUrl ??
      input.property.photos[input.highlight.photoIndex] ??
      input.property.photos[0]
    metaHash = await uploadAdImage(photoUrl)
  }

  // 5. Persistir cache (best-effort, no fallar si el insert falla)
  try {
    await (supabase as unknown as {
      from: (t: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string },
        ) => Promise<unknown>
      }
    })
      .from('property_ad_assets')
      .upsert(
        {
          property_id: input.property.id,
          highlight_id: cacheHighlightKey,
          format,
          prompt_hash: promptHash ?? 'fallback_original_photo',
          meta_image_hash: metaHash,
        },
        { onConflict: 'property_id,highlight_id,format' },
      )
  } catch (err) {
    console.warn('[ad-image cache] upsert failed (continuing):', err)
  }

  return metaHash
}

/**
 * CTA de los anuncios. "Ver más" (WATCH_MORE) — decisión del usuario 2026-07-25:
 * muestra más del título del aviso. Verificado empíricamente que Meta lo ACEPTA para
 * link ads con imagen vía asset_feed_spec (el viejo temor "solo video" quedó obsoleto).
 */
const AD_CTA_TYPE = 'WATCH_MORE'

/** url_tags a nivel creative (macros de Meta → atribución en el CRM). */
const AD_URL_TAGS =
  'utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&fb_campaign_id={{campaign.id}}&fb_adset_id={{adset.id}}&fb_ad_id={{ad.id}}&fb_placement={{placement}}'

/**
 * ID de la cuenta de Instagram Business conectada a la Página, para ASOCIAR el perfil
 * de IG a los anuncios. Sin esto el ad queda "Selecciona una cuenta de Instagram".
 * Resuelto una vez (cache de módulo): env META_INSTAGRAM_ACTOR_ID si está, si no se
 * consulta a la Página (fields=instagram_business_account). null → no se asocia.
 */
let _igActorCache: string | null = null
async function getInstagramActorId(): Promise<string | null> {
  if (_igActorCache) return _igActorCache // solo cacheamos éxito (no null)
  const envIg = process.env.META_INSTAGRAM_ACTOR_ID
  if (envIg) { _igActorCache = envIg; return envIg }
  try {
    const { pageId } = getMeta()
    const data = await metaFetch<{ instagram_business_account?: { id: string } }>(
      `/${pageId}?fields=instagram_business_account`,
    )
    const id = data.instagram_business_account?.id ?? null
    if (id) _igActorCache = id
    return id
  } catch {
    return null // fallo transitorio → reintentar la próxima, no fijar null
  }
}

/**
 * Arma el body del AdCreative. Con `pair` (feed 4:5 + story 9:16) usa
 * asset_feed_spec con PERSONALIZACIÓN POR UBICACIÓN (feed → 4:5, historias/reels →
 * 9:16; regla default con spec vacío = obligatoria por Meta). Sin pair, cae al link
 * ad clásico de una sola imagen. Ambos asocian Instagram y usan el CTA configurado.
 */
/**
 * Máximo de textos principales (`bodies`) y títulos (`titles`) por creative.
 *
 * VERIFICADO CONTRA META (validate_only, 2026-07-27 — `scripts/validate-meta-creative-payload.ts`):
 * el multi-texto y la personalización por ubicación son EXCLUYENTES.
 *   - CON `asset_customization_rules` (feed 4:5 + story 9:16) → SOLO 1 body y 1
 *     title. Con más, Meta responde 400 subcode 1885878 ("No se pueden aplicar
 *     varios activos bodies a la regla N").
 *   - SIN reglas (una sola imagen para todos los placements) → acepta 5 y 5.
 * Como la personalización por ubicación es la decisión de producto vigente
 * (E2.5: cada pieza tiene su 4:5 y su 9:16), el camino con par usa 1+1 y la
 * variedad de copy se logra con textos DISTINTOS por anuncio (6 ads = 6 textos).
 */
const MAX_ASSET_TEXTS = 5
/** Límite real del camino con personalización por ubicación (subcode 1885878). */
const MAX_TEXTS_WITH_CUSTOMIZATION = 1

/**
 * Toma `count` elementos de `arr` arrancando en `start`, con wrap-around.
 * Cada anuncio recibe así una ventana DISTINTA del pool de copy (con 10 textos
 * y 6 anuncios, ninguno queda con el mismo conjunto) sin recortar anuncios.
 */
export function pickWindow(arr: string[], start: number, count: number): string[] {
  if (arr.length === 0) return []
  const n = Math.min(count, arr.length)
  return Array.from({ length: n }, (_, k) => arr[(start + k) % arr.length])
}

/** Resultado de intentar crear UNA variante de anuncio (creative + ad). */
export type VariantOutcome<T> =
  | { ok: true; index: number; value: T }
  | { ok: false; index: number; error: string }

/**
 * Combina la pasada inicial con la de reintentos y separa éxitos de fallos,
 * PRESERVANDO el orden de `indices` (el orden de los ads importa: es el que se
 * persiste en `ad_ids` y el que ve el asesor). El reintento pisa al 1er intento.
 */
export function mergeVariantOutcomes<T>(
  indices: number[],
  firstPass: VariantOutcome<T>[],
  retryPass: VariantOutcome<T>[],
): {
  succeeded: Array<{ index: number; value: T }>
  failed: Array<{ index: number; error: string }>
} {
  const byIndex = new Map<number, VariantOutcome<T>>()
  for (const r of firstPass) byIndex.set(r.index, r)
  for (const r of retryPass) byIndex.set(r.index, r) // el reintento manda
  const succeeded: Array<{ index: number; value: T }> = []
  const failed: Array<{ index: number; error: string }> = []
  for (const i of indices) {
    const r = byIndex.get(i)
    if (r?.ok) succeeded.push({ index: i, value: r.value })
    else if (r) failed.push({ index: i, error: r.error })
  }
  return { succeeded, failed }
}

function buildCreativePayload(input: {
  name: string
  pageId: string
  igActorId: string | null
  landingUrl: string
  /** Hasta 5 títulos (asset_feed_spec). El link ad de 1 imagen usa solo el 1º. */
  headlines: string[]
  /** Hasta 5 textos principales (asset_feed_spec). El link ad usa solo el 1º. */
  primaryTexts: string[]
  description: string
  /** url_tags con el `ad_ref` único de esta variante (anti-duplicado). */
  urlTags: string
  pair?: { feedHash: string; storyHash: string }
  imageHash?: string
}): Record<string, unknown> {
  const objectStorySpec: Record<string, unknown> = { page_id: input.pageId }
  if (input.igActorId) objectStorySpec.instagram_user_id = input.igActorId

  // Con par (personalización por ubicación) Meta SOLO admite 1 body y 1 title
  // (subcode 1885878, verificado); sin par, hasta 5 que Meta rota.
  const maxTexts = input.pair ? MAX_TEXTS_WITH_CUSTOMIZATION : MAX_ASSET_TEXTS
  const bodies = input.primaryTexts.slice(0, maxTexts).map(text => ({ text }))
  const titles = input.headlines.slice(0, maxTexts).map(text => ({ text }))
  // Meta rechaza un creative sin texto o sin título. Fallar acá (con mensaje
  // claro) es mucho mejor que mandarle a Meta `bodies: []` y comerse un 400.
  if (bodies.length === 0 || titles.length === 0) {
    throw new Error('buildCreativePayload: se requiere al menos 1 texto principal y 1 título')
  }

  if (input.pair) {
    return {
      name: input.name,
      url_tags: input.urlTags,
      object_story_spec: objectStorySpec,
      asset_feed_spec: {
        images: [
          { hash: input.pair.feedHash, adlabels: [{ name: 'feed' }] },
          { hash: input.pair.storyHash, adlabels: [{ name: 'story' }] },
        ],
        bodies,
        titles,
        descriptions: [{ text: input.description }],
        link_urls: [{ website_url: input.landingUrl }],
        call_to_action_types: [AD_CTA_TYPE],
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
          // Regla default OBLIGATORIA (menor prioridad, spec VACÍO): captura el resto
          // (feed, etc.) con la 4:5. Sin esto Meta rechaza (subcode 1885923).
          { customization_spec: {}, image_label: { name: 'feed' } },
        ],
      },
    }
  }

  // Link ad de 1 imagen (fallback sin par feed/story): Meta solo admite UN
  // texto y UN título acá — la rotación de 5 es exclusiva de asset_feed_spec.
  return {
    name: input.name,
    url_tags: input.urlTags,
    object_story_spec: {
      ...objectStorySpec,
      link_data: {
        image_hash: input.imageHash,
        link: input.landingUrl,
        message: input.primaryTexts[0] ?? '',
        name: input.headlines[0] ?? '',
        description: input.description,
        call_to_action: { type: AD_CTA_TYPE, value: { link: input.landingUrl } },
      },
    },
  }
}

export interface CampaignOverrides {
  /** Budget diario en ARS — override del decideBudget automático */
  dailyBudgetArs?: number
  /** Índice de la variante de copy a usar (0..N-1) — override del default 0 */
  copyVariantIdx?: number
  /** Hashes de imágenes pre-generadas (wizard v2) — si se pasan, el builder
   *  los usa directamente en lugar de generar/subir nuevas piezas. Permite
   *  que las 27 piezas generadas por el async runner se conviertan en los
   *  10 Ads de la campaña sin regenerar. */
  preGeneratedImageHashes?: string[]
  /** Pares de imágenes pre-generadas (E2.5): feed 4:5 + story 9:16 por pieza. Si se
   *  pasan, el builder crea creatives con PERSONALIZACIÓN POR UBICACIÓN (asset_feed_spec:
   *  feed → 4:5, historias/reels → 9:16). Es el camino preferido desde E2.5. */
  preGeneratedPairs?: Array<{ feedHash: string; storyHash: string }>
  /** Spec de targeting completa — override del decideTargeting automático.
   *  Si se pasa, ignora geo automático y usa el preset que eligió el asesor. */
  targetingOverride?: Record<string, unknown>
  /** URL específica de foto a usar como hero (por defecto property.photos[0]) */
  heroPhotoUrl?: string
  /** Highlights del análisis de visión (si el wizard los pasa, se reusan;
   *  si no, el builder llama a analyzePropertyPhotos de nuevo). */
  highlights?: PropertyHighlight[]
  /** Cuántos ads variants generar (default 3). Cap a min(highlights.length, copy.length). */
  variantCount?: number
}

export async function createCampaignForProperty(
  property: Property,
  options: { dryRun?: boolean; overrides?: CampaignOverrides } = {},
): Promise<CampaignResult> {
  if (!property.public_slug) {
    throw new Error('Property sin public_slug — asignar antes de crear campaign')
  }
  if (!property.photos || property.photos.length === 0) {
    throw new Error('Property sin fotos — no se puede crear ad creative')
  }
  if (property.latitude == null || property.longitude == null) {
    throw new Error('Property sin lat/lng — no se puede armar targeting')
  }

  // Idempotencia: si ya existe una campaña no archivada para esta propiedad…
  //
  // USAMOS isCampaignComplete (lib/marketing/campaign-completeness.ts), el
  // predicado canónico ÚNICO compartido por page.tsx, confirm/route y cleanup.
  // Antes del fix 2026-06-09 había un predicado local incompleto que sólo
  // chequeaba 'provisioning sin ads' — perdía status='failed' y reproducía el
  // bug original (smoke fail dejaba la fila como "completa" desde el builder
  // pero "zombie" desde page.tsx).
  const supabasePre = getSupabase()
  const { data: existing } = await supabasePre
    .from('property_meta_campaigns')
    .select('campaign_id, adset_id, ad_ids, status, budget_daily, landing_url')
    .eq('property_id', property.id)
    .neq('status', 'archived')
    .maybeSingle()
  if (existing?.campaign_id) {
    const isComplete = isCampaignComplete(existing)
    const isIncomplete = !isComplete

    if (isIncomplete) {
      // Un intento anterior falló a mitad de camino (típicamente en uploadAdImage
      // o creación de AdSet/Ad). La Campaign quedó huérfana en Meta y la fila en
      // DB en 'provisioning'. Archivamos ambas y empezamos de nuevo desde cero.
      console.log(
        `[meta-builder] retry: archiving incomplete campaign ${existing.campaign_id}`,
      )
      try {
        await metaFetch(`/${existing.campaign_id}`, {
          method: 'POST',
          body: JSON.stringify({ status: 'ARCHIVED' }),
        })
      } catch (err) {
        console.warn('[meta-builder] could not archive in Meta (continuing)', err)
      }
      await supabasePre
        .from('property_meta_campaigns')
        .update({ status: 'archived', last_error: 'Archivada por reintento (intento previo incompleto)' })
        .eq('campaign_id', existing.campaign_id)
      // Caemos al flow normal de creación abajo
    } else {
      // La fila dice "completa", pero eso NO alcanza: la campaña puede haber sido
      // eliminada desde Ads Manager y nuestra fila quedar rancia. Pasó de verdad
      // el 2026-07-30 — el usuario borró la campaña en Meta, volvió a publicar, y
      // el sistema le devolvió "publicada" con un link a algo que ya no existía.
      // Antes de devolver la existente, le PREGUNTAMOS A META.
      const { syncCampaignState } = await import('./meta-sync')
      let vive = false
      try {
        const estado = await syncCampaignState(existing.campaign_id)
        vive = estado.status === 'active' || estado.status === 'paused'
      } catch (err) {
        // No pudimos verificar (red, rate limit). NO inventamos ninguna de las dos
        // cosas: fallar acá es mucho mejor que devolver una campaña fantasma o
        // crear una duplicada que gaste en paralelo.
        throw new Error(
          `No pudimos verificar en Meta el estado de la campaña ${existing.campaign_id}. ` +
            `No creamos ni reutilizamos nada para no duplicar gasto. Reintentá en un momento. ` +
            `(detalle: ${err instanceof Error ? err.message : String(err)})`,
        )
      }

      if (vive) {
        // Campaña completa y viva — devolvemos la existente, no duplicamos.
        const existingAdIds = (existing.ad_ids as string[] | null) ?? []
        return {
          campaignId: existing.campaign_id,
          adsetId: existing.adset_id ?? '',
          adIds: existingAdIds,
          budgetDailyArs: existing.budget_daily ?? 0,
          landingUrl: existing.landing_url ?? `${getAppUrl()}/p/${property.public_slug}`,
          expectedAds: existingAdIds.length,
          failedVariants: [],
        }
      }

      // Meta dice que ya no está. `syncCampaignState` ya dejó la fila en
      // 'archived' con su nota, así que caemos al flujo normal y creamos una limpia.
      console.log(
        `[meta-builder] la campaña ${existing.campaign_id} ya no existe en Meta — se crea una nueva`,
      )
    }
  }

  const { accountId, pageId } = getMeta()
  // Landing URL CON UTMs + dynamic placeholders de Meta.
  //  - utm_source=meta / utm_medium=paid_social: identifica origen (estándar GA4).
  //  - utm_campaign=propiedad_<slug>: para agrupar por propiedad en analytics.
  //  - utm_content={{ad.id}}: Meta lo reemplaza por el ad_id real al servir
  //    el anuncio. Permite atribución exacta: este lead vino del ad X.
  //  - utm_term={{placement}}: feed, story, reels, etc. — para evaluar qué
  //    placement convierte mejor.
  //  Sin UTMs no podemos saber qué ad/placement trajo cada lead.
  const landingBaseUrl = `${getAppUrl()}/p/${property.public_slug}`
  const utmParams = new URLSearchParams({
    utm_source: 'meta',
    utm_medium: 'paid_social',
    utm_campaign: `propiedad_${property.public_slug}`,
    utm_content: '{{ad.id}}',
    utm_term: '{{placement}}',
  })
  // Importante: Meta requiere que los placeholders dinámicos NO estén
  // URL-encoded (las llaves {{ }} se mantienen tal cual). URLSearchParams
  // los encodea como %7B%7B, hay que des-encodearlos:
  const landingUrl = `${landingBaseUrl}?${utmParams
    .toString()
    .replaceAll('%7B%7B', '{{')
    .replaceAll('%7D%7D', '}}')}`
  const overrides = options.overrides ?? {}

  // Tipo de cambio USD→ARS fresco (Bluelytics, cached 1h)
  const { rate: usdToArs } = await getUsdToArs()

  // Budget: override del asesor o cálculo automático
  const autoBudget = decideBudget(property.asking_price, property.currency, usdToArs)
  const budget = overrides.dailyBudgetArs != null && overrides.dailyBudgetArs > 0
    ? { ...autoBudget, dailyArs: overrides.dailyBudgetArs }
    : autoBudget

  // E2.0 — Backstop catastrófico de presupuesto (capa E). Última línea de
  // defensa ANTES de cualquier escritura a Meta (la Campaign se crea abajo).
  // Aunque un caller se saltee la validación de negocio, acá tiramos si el
  // budget diario supera el techo absoluto. `dailyArs` es ENTERO en ARS; el
  // ×100 a unidad mínima de Meta ocurre UNA sola vez más abajo (daily_budget).
  if (!Number.isFinite(budget.dailyArs) || budget.dailyArs <= 0) {
    throw new Error(`Presupuesto diario inválido: ${budget.dailyArs}`)
  }
  if (budget.dailyArs > META_ABSOLUTE_CEILING_ARS) {
    throw new Error(
      `Presupuesto diario ARS ${budget.dailyArs.toLocaleString('es-AR')} supera el techo absoluto ` +
      `ARS ${META_ABSOLUTE_CEILING_ARS.toLocaleString('es-AR')}. Abortado por seguridad.`,
    )
  }

  // Targeting: override del asesor (preset geográfico que eligió) o automático
  const autoTargeting = decideTargeting(property, usdToArs)
  const targeting = overrides.targetingOverride
    ? { spec: overrides.targetingOverride, reasoning: 'Override desde wizard' }
    : autoTargeting

  // Copy con OpenAI (fallback a templates si falla / no hay API key).
  const copyVariations = await generateAdCopyVariations(property, landingUrl)
  // Variante elegida por el asesor (default 0 = primera)
  const variantIdx = Math.min(
    Math.max(overrides.copyVariantIdx ?? 0, 0),
    copyVariations.primaryTexts.length - 1,
  )
  const copy = {
    primaryText: copyVariations.primaryTexts[variantIdx] ?? copyVariations.primaryTexts[0],
    headline: copyVariations.headlines[variantIdx] ?? copyVariations.headlines[0],
    description: copyVariations.description,
  }
  // (eslint usado intencionalmente arriba para soportar variantIdx)
  void variationsToPrimary // mantiene el import por compatibilidad histórica

  // 1. Crear Campaign (paused)
  // NOTA: en Argentina las campañas de real estate NO requieren la categoría
  // especial HOUSING (es una regulación específica de EEUU/Canadá). Diego ya
  // corre campañas residenciales sin esta categoría exitosamente. Si en algún
  // momento Meta lo exige, se agrega aquí especial_ad_categories: ['HOUSING'].
  //
  // `is_adset_budget_sharing_enabled` es REQUERIDO por Meta desde 2025 cuando
  // la campaña no usa CBO (Campaign Budget Optimization). Como nosotros ponemos
  // budget a nivel adset (no campaign-level), va false. Si en el futuro queremos
  // CBO entre múltiples adsets, mover `daily_budget` a la Campaign y poner true.
  // Sin este campo: ML devuelve error 400 subcode 4834011.
  //
  // NOTA sobre bid_strategy: NO va acá. Cuando el budget está a nivel adset
  // (no CBO), Meta exige que bid_strategy también vaya en el adset. Si lo
  // ponemos en la Campaign sin budget de Campaign, Meta rechaza con
  // subcode 1885737: "Campaña sin presupuesto, no podés editar la estrategia
  // de puja". Lo seteamos en el adset abajo.
  const campaign = await metaFetch<{ id: string }>(`/${accountId}/campaigns`, {
    method: 'POST',
    body: JSON.stringify({
      name: `[Auto] ${property.title ?? property.address} (${property.public_slug})`,
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED',
      special_ad_categories: [], // Sin restricciones especiales en AR
      buying_type: 'AUCTION',
      is_adset_budget_sharing_enabled: false,
    }),
  })

  // 1.5. Persistir la campaign en DB con status='provisioning'.
  // CRÍTICO doble: (1) si el insert falla por OTRA razón, archivar la
  // campaña en Meta para evitar huérfanos. (2) si el insert falla por
  // UNIQUE violation (índice idx_property_meta_campaigns_one_active),
  // significa que OTRO request paralelo ya está creando una campaña para
  // esta property. Aborta el actual y archiva la campaña que recién
  // creamos en Meta para no dejarla huérfana.
  const supabase = getSupabase()
  const { error: insertError } = await supabase.from('property_meta_campaigns').insert({
    property_id: property.id,
    campaign_id: campaign.id,
    status: 'provisioning',
    budget_daily: budget.dailyArs,
    budget_currency: 'ARS',
    targeting: targeting.spec as never,
    copy: copyVariations as never,
    landing_url: landingUrl,
  })
  if (insertError) {
    const isUniqueViolation =
      insertError.code === '23505' ||
      /duplicate key|unique constraint/i.test(insertError.message)
    if (isUniqueViolation) {
      console.warn(
        '[meta-builder] doble click detectado — ya hay otra campaña en curso. Archivando duplicada en Meta.',
      )
    } else {
      console.error('[meta-builder] insert falló por otra razón:', insertError)
    }
    // En ambos casos archivamos la Campaign que recién creamos en Meta
    // para que no quede huérfana acumulando gasto potencial.
    try {
      await metaFetch(`/${campaign.id}`, {
        method: 'POST',
        body: JSON.stringify({ status: 'ARCHIVED' }),
      })
    } catch (archiveErr) {
      console.error('[meta-builder] archivado de rollback también falló', archiveErr)
    }
    if (isUniqueViolation) {
      // Devolver la campaña existente (la que ganó la carrera) en lugar de error.
      const { data: winner } = await supabase
        .from('property_meta_campaigns')
        .select('campaign_id, adset_id, ad_ids, budget_daily, landing_url')
        .eq('property_id', property.id)
        .neq('status', 'archived')
        .maybeSingle()
      if (winner?.campaign_id) {
        const winnerAdIds = (winner.ad_ids as string[] | null) ?? []
        return {
          campaignId: winner.campaign_id,
          adsetId: winner.adset_id ?? '',
          adIds: winnerAdIds,
          budgetDailyArs: winner.budget_daily ?? 0,
          landingUrl: winner.landing_url ?? landingUrl,
          expectedAds: winnerAdIds.length,
          failedVariants: [],
        }
      }
    }
    throw new Error(`No se pudo persistir la campaña en DB: ${insertError.message}`)
  }

  // 2. Resolver los highlights que vamos a usar para las variantes de ad.
  //    Si el wizard ya los analizó, los reusa. Sino, los pide al vision
  //    analyzer (cache automático del runtime).
  const highlights =
    overrides.highlights && overrides.highlights.length > 0
      ? overrides.highlights
      : (await analyzePropertyPhotos(property)).highlights

  // 3. Determinar cuántas variantes de ad vamos a crear.
  //    Camino preferido (E2.5): el wizard v2 nos pasa PARES de imágenes pre-generadas
  //    (feed 4:5 + story 9:16). Cada par → 1 ad con personalización por ubicación.
  //    Legacy: preGeneratedImageHashes (1 imagen por ad). Sino, generar/foto cruda.
  const preGeneratedPairs = overrides.preGeneratedPairs ?? []
  const hasPairs = preGeneratedPairs.length > 0
  const preGeneratedHashes = overrides.preGeneratedImageHashes ?? []
  const hasPreGenerated = preGeneratedHashes.length > 0

  // Instagram: cuenta conectada a la Página, para asociar el perfil de IG a los ads.
  const igActorId = await getInstagramActorId()

  const availablePregen = hasPairs ? preGeneratedPairs.length : hasPreGenerated ? preGeneratedHashes.length : 10
  const requestedVariants = overrides.variantCount ?? availablePregen
  // La cantidad de anuncios la define la cantidad de PIEZAS disponibles, NO la de
  // textos: con el reparto en ventanas (pickWindow) el pool de copy alcanza para
  // todos los anuncios. El cap por textos que había acá era inofensivo en la
  // práctica (generateAdCopyVariations SIEMPRE devuelve 10 — padCopyToTen rellena
  // si la IA devuelve menos), pero era una bomba silenciosa: cualquier cambio en
  // el generador habría recortado anuncios sin avisar. La campaña de 3-de-6 que
  // reportó el usuario NO vino de acá, sino del Promise.all abortado (ver abajo).
  const variantCount = Math.max(
    1,
    Math.min(
      requestedVariants,
      availablePregen, // no exceder la cantidad de piezas pre-generadas disponibles
    ),
  )

  // Rotación de estilos de composición para que las 10 piezas sean distintas
  // visualmente. Cada índice i recibe styleRotation[i % 6].
  const styleRotation: Array<
    'hero_full_bleed'
    | 'split_photo_info'
    | 'editorial_magazine'
    | 'minimalist_whitespace'
    | 'color_overlay_solid'
    | 'typography_dominant'
  > = [
    'split_photo_info',
    'hero_full_bleed',
    'editorial_magazine',
    'color_overlay_solid',
    'minimalist_whitespace',
    'typography_dominant',
  ]

  // 4. Para cada variante: subir foto + crear creative + crear ad.
  //    Todas comparten el mismo AdSet (lo creamos abajo).
  //    Si una falla, las anteriores ya están creadas — la idempotencia se
  //    encarga de archivar la campaña en el siguiente intento.
  const adIds: string[] = []
  const variantPayloads: Array<{
    adId: string
    creativeId: string
    highlightId: string
    headline: string
    primaryText: string
    photoUrl: string
  }> = []

  // 4. Crear AdSet (con conversion location WEBSITE para que apunte a la landing)
  //
  // `promoted_object` con pixel_id es REQUERIDO para Campaigns con objective
  // OUTCOME_LEADS + optimization_goal LEAD_GENERATION + destination_type WEBSITE.
  // Sin esto Meta devuelve error 400 "Missing required parameter".
  //
  // `start_time` a 5 min en el futuro (no 1 min) para tener margen contra
  // delays de red y desfase de reloj del server — Meta rechaza si start_time
  // queda en el pasado al momento de procesar el request.
  const startTime = new Date(Date.now() + 5 * 60_000).toISOString()
  const pixelId = process.env.META_PIXEL_ID
  if (!pixelId) {
    throw new Error('META_PIXEL_ID requerido para AdSet con OUTCOME_LEADS')
  }
  // optimization_goal según destination_type:
  //  - WEBSITE  → 'OFFSITE_CONVERSIONS' (Meta optimiza para conversiones en el
  //    Pixel/CAPI según custom_event_type)
  //  - ON_AD    → 'LEAD_GENERATION' (para Instant Forms nativos de Meta)
  //
  // Como nosotros mandamos tráfico a una landing externa (destination_type:
  // WEBSITE), el goal correcto es OFFSITE_CONVERSIONS. Si combinamos WEBSITE
  // + LEAD_GENERATION, Meta rechaza con subcode 2490408: "El objetivo de
  // rendimiento no está disponible".
  //
  // promoted_object con destination_type=WEBSITE necesita pixel_id +
  // custom_event_type. El custom_event_type le dice a Meta cuál evento del
  // Pixel cuenta como conversión. Para inmobiliaria → 'LEAD'.
  // Meta exige desde 2024-2025 que `advantage_audience` esté explícitamente
  // declarado en `targeting.targeting_automation`. Si no lo seteamos, rechaza
  // con subcode 1870227.
  //  - advantage_audience: 1 → Meta puede expandir el público con ML (mejor
  //    performance promedio, especialmente para conversiones)
  //  - advantage_audience: 0 → Meta respeta exactamente el targeting que
  //    definimos (más preciso pero suele tener menos volumen)
  //
  // Default 1 porque para campañas de conversion (OFFSITE_CONVERSIONS) Meta
  // aprende quién convierte y busca gente similar — vale la pena dejarlo.
  // Centralizado acá en el builder para no tocar cada preset/spec.
  //
  // RESTRICCIONES Advantage+: cuando advantage_audience=1, Meta trata el
  // control de edad como "sugerencia" y lo expande automáticamente.
  // Por eso impone límites en lo que podés especificar:
  //  - age_min NO puede ser > 25 (subcode 1870188)
  //  - age_max NO puede ser < 65 (subcode 1870189)
  // Los valores del buyer persona se mantienen como hint dentro de esos
  // límites; Meta usa ML para encontrar la audiencia óptima dentro del rango.
  //
  // Estos caps SE APLICAN TANTO al spec automático (decideTargeting) como
  // a cualquier targetingOverride que mande el wizard — por eso el
  // procesamiento es acá, después de resolver targeting.spec.
  const baseSpec = targeting.spec as Record<string, unknown> & {
    age_min?: number
    age_max?: number
  }
  // EXCLUSIÓN de prospecting (Fase 4): los públicos Captado/Perdido
  // (exclude_from_prospecting=true en funnel_meta_audiences) se agregan como
  // excluded_custom_audiences para no re-impactar a quien ya captamos o
  // perdimos. ADITIVO + best-effort: si no hay públicos o la query falla,
  // la lista queda vacía y la campaña se arma SIN exclusión.
  const exclusionAudienceIds = await getProspectingExclusionAudienceIds()
  const targetingWithAdvantage = {
    ...baseSpec,
    age_min: Math.min(baseSpec.age_min ?? 25, 25),
    age_max: Math.max(baseSpec.age_max ?? 65, 65),
    targeting_automation: { advantage_audience: 1 },
    ...(exclusionAudienceIds.length > 0
      ? { excluded_custom_audiences: exclusionAudienceIds.map((id) => ({ id })) }
      : {}),
  }

  const adset = await metaFetch<{ id: string }>(`/${accountId}/adsets`, {
    method: 'POST',
    body: JSON.stringify({
      name: `AdSet ${property.public_slug}`,
      campaign_id: campaign.id,
      daily_budget: Math.round(budget.dailyArs * 100), // Meta espera centavos
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      destination_type: 'WEBSITE',
      promoted_object: {
        pixel_id: pixelId,
        custom_event_type: 'LEAD',
      },
      // bid_strategy va acá (no en Campaign) porque el budget también está acá.
      // LOWEST_COST_WITHOUT_CAP = "Volumen más alto" — la más simple, sin tope.
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: targetingWithAdvantage,
      status: 'PAUSED',
      start_time: startTime,
    }),
  })

  // Checkpoint atómico: persistir adset_id apenas se crea. Si el lambda muere
  // en el loop de variantes, el siguiente intento puede leer correctamente
  // "tiene adset_id pero ad_ids vacío" y archivar limpio. Sin este checkpoint,
  // la fila quedaba con adset_id=NULL pese a que Meta sí tenía el AdSet — el
  // bug 2026-06-09 del incidente.
  await supabase
    .from('property_meta_campaigns')
    .update({ adset_id: adset.id })
    .eq('campaign_id', campaign.id)

  // 5. Crear N AdCreatives + N Ads en PARALELO (concurrency=4) con persistencia
  //    incremental de ad_ids después de cada vuelta. Antes era un for secuencial
  //    que tardaba 27-54s para 9 variantes y rozaba el techo de 60s de Netlify
  //    cuando se sumaba al setup pre-loop (campaign + adset + copy + vision).
  //    Con concurrency=4 baja a ~9-15s. La rate de Meta API soporta sobrado.
  //
  //    Cada variante es independiente (comparten adset.id pero no se afectan
  //    entre sí), así que el paralelismo es seguro. El orden creative→ad
  //    DENTRO de cada variante se mantiene porque ad necesita creative.id.
  //
  //    Tras Promise.all hacemos UN solo UPDATE con todos los ad_ids — si el
  //    lambda muere durante el Promise.all, los ya creados quedan huérfanos
  //    en Meta pero el siguiente intento detecta "adset_id presente, ad_ids
  //    vacío" (gracias al checkpoint adset_id de más arriba) y archiva limpio.
  //
  //    NOTA: la persistencia ad-por-ad sería ideal pero introduce N UPDATEs
  //    concurrentes que se pisan. El compromiso es: persistir TODO una vez
  //    al final del Promise.all (mucho mejor que el comportamiento anterior
  //    que persistía ad_ids junto con status final, recién mucho después).
  const variantIndices = Array.from({ length: variantCount }, (_, i) => i)

  /**
   * Crea creative + ad de la variante `i`.
   *
   * `attempt` alimenta el `ad_ref` único: Meta rechaza con 400 subcode 3858798
   * ("El contenido de anuncio ya existe") cualquier creative idéntico a otro de
   * la MISMA cuenta — y los creatives de un intento fallido NO se borran. Con el
   * ref en el link + url_tags + nombre, un reintento nunca choca con su gemelo.
   */
  const createVariant = async (i: number, attempt: number) => {
    const highlight = highlights[i % highlights.length]
    // Ventana de 5 textos/títulos por anuncio (Meta los rota). Distinta por
    // variante para que dos anuncios nunca queden con el mismo contenido.
    //
    // `buildCreativePayload` recorta al máximo que Meta admite según el camino
    // (1 con personalización por ubicación, 5 sin ella). Pedimos 5 y que decida.
    const variantHeadlines = pickWindow(copyVariations.headlines, i, MAX_ASSET_TEXTS)
    const variantPrimaryTexts = pickWindow(copyVariations.primaryTexts, i, MAX_ASSET_TEXTS)
    const variantHeadline = variantHeadlines[0] ?? copyVariations.headlines[0] ?? ''
    const variantPrimaryText = variantPrimaryTexts[0] ?? copyVariations.primaryTexts[0] ?? ''
    const adRef = `${campaign.id}-v${i}${attempt > 0 ? `-r${attempt}` : ''}`
    // El ref viaja en el LINK (parte inequívoca del contenido del creative) y en
    // url_tags. `landingUrl` ya trae query (?utm_...), por eso va con `&`.
    const variantLandingUrl = `${landingUrl}&ad_ref=${encodeURIComponent(adRef)}`
    const variantUrlTags = `${AD_URL_TAGS}&ad_ref=${encodeURIComponent(adRef)}`
    const compositionStyle = styleRotation[i % styleRotation.length]
    const photosAvailable = property.photos.length
    const baseIdx =
      typeof highlight.photoIndex === 'number' &&
      highlight.photoIndex >= 0 &&
      highlight.photoIndex < photosAvailable
        ? highlight.photoIndex
        : i % photosAvailable
    const cycleNum = Math.floor(i / highlights.length)
    const photoIndex = (baseIdx + cycleNum) % photosAvailable
    const photoUrl = property.photos[photoIndex] ?? property.photos[0]

    // Resolver la imagen de la pieza. Preferido (E2.5): par feed 4:5 + story 9:16.
    // Legacy: 1 hash pre-generado. Fallback: generar/foto cruda (1 imagen).
    let pair: { feedHash: string; storyHash: string } | undefined
    let imageHash: string | undefined
    if (hasPairs && preGeneratedPairs[i]) {
      pair = preGeneratedPairs[i]
    } else if (hasPreGenerated && preGeneratedHashes[i]) {
      imageHash = preGeneratedHashes[i]
    } else {
      imageHash = await getOrGenerateAdImageHash({
        property,
        highlight,
        copyHeadline: variantHeadline,
        format: 'feed_square',
        compositionStyle,
        overridePhotoUrl: photoUrl,
        cacheKeySuffix: `_style_${compositionStyle}_p${photoIndex}`,
      })
    }

    const creative = await metaFetch<{ id: string }>(`/${accountId}/adcreatives`, {
      method: 'POST',
      body: JSON.stringify(
        buildCreativePayload({
          // El adRef va PRIMERO: el slice(0,80) con un slug largo lo truncaba y
          // todos los creatives terminaban con el mismo nombre.
          name: `${adRef} — ${highlight.id} — ${property.public_slug}`.slice(0, 80),
          pageId,
          igActorId,
          landingUrl: variantLandingUrl,
          headlines: variantHeadlines,
          primaryTexts: variantPrimaryTexts,
          description: copyVariations.description,
          urlTags: variantUrlTags,
          pair,
          imageHash,
        }),
      ),
    })

    const ad = await metaFetch<{ id: string }>(`/${accountId}/ads`, {
      method: 'POST',
      body: JSON.stringify({
        name: `Ad ${i + 1}: ${highlight.label}`.slice(0, 80),
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      }),
    })

    return {
      adId: ad.id,
      creativeId: creative.id,
      highlightId: highlight.id,
      headline: variantHeadline,
      primaryText: variantPrimaryText,
      photoUrl,
    }
  }

  type VariantValue = Awaited<ReturnType<typeof createVariant>>

  const attemptVariant = async (i: number, attempt: number): Promise<VariantOutcome<VariantValue>> => {
    try {
      return { ok: true, index: i, value: await createVariant(i, attempt) }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.warn(`[meta-builder] variante ${i} falló (intento ${attempt}):`, error)
      return { ok: false, index: i, error }
    }
  }

  // Pasada 1: cada variante AISLADA — que una falle ya no mata a las demás.
  // (Antes, un creative rechazado cortaba el Promise.all y dejaba en Meta los
  // ads ya creados: la campaña de 3 anuncios en vez de 6 que reportó el usuario.)
  const firstPass = await runWithConcurrency(variantIndices, 4, i => attemptVariant(i, 0))

  // Pasada 2: reintento ÚNICO de las que fallaron, con `ad_ref` nuevo (resuelve
  // el duplicado 3858798 y los errores transitorios de la API).
  const failedIdx = firstPass.filter(r => !r.ok).map(r => r.index)
  if (failedIdx.length > 0) {
    // CHECKPOINT antes del reintento: el reintento es justo el camino más lento
    // (y maxDuration=60). Si la función muere ahí, sin esto se perderían también
    // los ads que SÍ entraron en la pasada 1 y el próximo intento los archivaría.
    const okSoFar = firstPass.filter(r => r.ok).map(r => (r as { value: { adId: string } }).value.adId)
    if (okSoFar.length > 0) {
      await supabase
        .from('property_meta_campaigns')
        .update({ ad_ids: okSoFar })
        .eq('campaign_id', campaign.id)
    }
  }
  const retryPass = failedIdx.length
    ? await runWithConcurrency(failedIdx, 2, i => attemptVariant(i, 1))
    : []

  // Merge + separación de éxitos/fallos preservando el orden (función pura testeada).
  const { succeeded, failed: failedVariants } = mergeVariantOutcomes(
    variantIndices,
    firstPass,
    retryPass,
  )
  for (const s of succeeded) {
    adIds.push(s.value.adId)
    variantPayloads.push(s.value)
  }

  // Si NINGUNA variante entró, la campaña no sirve: tiramos para que la
  // recuperación del confirm archive el zombi y se pueda reintentar limpio.
  if (adIds.length === 0) {
    throw new Error(
      `No se pudo crear ningún anuncio (${variantCount} intentos). Primer error: ${failedVariants[0]?.error ?? 'desconocido'}`,
    )
  }
  if (failedVariants.length > 0) {
    console.warn(
      `[meta-builder] campaña ${campaign.id}: ${adIds.length}/${variantCount} anuncios creados. Fallaron: ${failedVariants
        .map(f => `#${f.index + 1} (${f.error})`)
        .join(' · ')}`,
    )
  }

  // Persistir ad_ids ya — sin esperar el smoke test ni el UPDATE final. Si la
  // función muere entre esto y el UPDATE final, la fila DB ya tiene la verdad.
  await supabase
    .from('property_meta_campaigns')
    .update({ ad_ids: adIds })
    .eq('campaign_id', campaign.id)

  // 6. Smoke test de la landing antes de activar (skipear en dryRun)
  const landingOk = options.dryRun ? false : await smokeTestLanding(landingUrl)

  // 7. Actualizar la fila ya creada en 1.5 con adset_id + ad_ids + status final.
  // En dryRun queda 'paused' para auditoría manual.
  // Una campaña incompleta NUNCA queda 'active' (no se activa, ver paso 8).
  const isPartial = failedVariants.length > 0
  const finalStatus = options.dryRun || isPartial
    ? 'paused'
    : landingOk
      ? 'active'
      : 'failed'
  // El detalle del parcial se PERSISTE (antes solo iba a console.warn y se perdía
  // al cerrar la pestaña): así queda auditable qué campañas salieron incompletas.
  const partialNote = isPartial
    ? `Publicación parcial: ${adIds.length}/${variantCount} anuncios. Fallaron: ` +
      failedVariants.map(f => `#${f.index + 1} (${f.error})`).join(' · ')
    : null
  // Persistir todos los IDs + el detalle de cada variante (para que el inbox
  // pueda mostrar "este lead vino del ad del balcón" en el futuro).
  const copyWithVariants = {
    ...copyVariations,
    variants: variantPayloads,
  }
  await supabase
    .from('property_meta_campaigns')
    .update({
      adset_id: adset.id,
      ad_ids: adIds,
      copy: copyWithVariants as never,
      status: finalStatus,
      last_error:
        [partialNote, !options.dryRun && !landingOk ? 'Smoke test de landing falló' : null]
          .filter(Boolean)
          .join(' | ') || null,
    })
    .eq('campaign_id', campaign.id)

  // 8. Si la landing responde OK y no es dryRun, activar todo en Meta.
  // En dryRun queda PAUSED para que el usuario audite antes de activar.
  //
  // NUNCA activamos una campaña INCOMPLETA: con el aislamiento de fallos, una
  // campaña con 1 de 10 anuncios ya no tira error — y sin esta guarda el camino
  // automático (provision-meta-campaigns) la activaría y gastaría el presupuesto
  // diario completo con una sola pieza. Si faltan anuncios queda en PAUSED.
  if (landingOk && !options.dryRun && failedVariants.length === 0) {
    await activateCampaign(campaign.id, adset.id, adIds)
  } else if (failedVariants.length > 0) {
    console.warn(
      `[meta-builder] campaña ${campaign.id} NO se activa (incompleta: ${adIds.length}/${variantCount}) — queda en PAUSED`,
    )
  }

  return {
    campaignId: campaign.id,
    adsetId: adset.id,
    adIds,
    budgetDailyArs: budget.dailyArs,
    landingUrl,
    expectedAds: variantCount,
    failedVariants,
  }
}

async function smokeTestLanding(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Activa campaign + adset + ads. Se llama después del smoke test.
 */
export async function activateCampaign(
  campaignId: string,
  adsetId: string,
  adIds: string[],
): Promise<void> {
  // El orden importa: primero campaign, después adset, después ads.
  // Campaign y AdSet sí van seriales (los ads necesitan adset ACTIVE),
  // pero los N ads se activan en paralelo con concurrency=4 — antes era un
  // for sequential que sumaba 13-27s al final del flow y rozaba el
  // maxDuration=60s de Netlify (QA blocker 3).
  await metaFetch(`/${campaignId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ACTIVE' }),
  })
  await metaFetch(`/${adsetId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ACTIVE' }),
  })
  await runWithConcurrency(adIds, 4, async (adId) => {
    await metaFetch(`/${adId}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'ACTIVE' }),
    })
  })
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  await metaFetch(`/${campaignId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'PAUSED' }),
  })
  const supabase = getSupabase()
  await supabase
    .from('property_meta_campaigns')
    .update({ status: 'paused', paused_at: new Date().toISOString() })
    .eq('campaign_id', campaignId)
}

export async function archiveCampaign(campaignId: string): Promise<void> {
  await metaFetch(`/${campaignId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ARCHIVED' }),
  })
  const supabase = getSupabase()
  await supabase
    .from('property_meta_campaigns')
    .update({ status: 'archived' })
    .eq('campaign_id', campaignId)
}

export interface CampaignDailyInsight {
  date: string
  impressions: number
  clicks: number
  ctr: number | null
  spend: number
  leads: number
  cost_per_lead: number | null
  reach: number
  raw: Record<string, unknown>
}

interface MetaInsightRow {
  date_start: string
  date_stop: string
  impressions: string
  clicks: string
  ctr: string
  spend: string
  reach: string
  actions?: Array<{ action_type: string; value: string }>
  cost_per_action_type?: Array<{ action_type: string; value: string }>
}

const LEAD_ACTION_TYPES = [
  'lead',
  'complete_registration',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion.lead_grouped',
]

function parseLeadCount(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0
  for (const t of LEAD_ACTION_TYPES) {
    const a = actions.find(x => x.action_type === t)
    if (a) {
      const n = parseInt(a.value, 10)
      if (n > 0) return n
    }
  }
  return 0
}

export async function fetchCampaignInsights(
  campaignId: string,
  since: Date,
): Promise<CampaignDailyInsight[]> {
  const sinceStr = since.toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)
  const fields = 'date_start,date_stop,impressions,clicks,ctr,spend,reach,actions,cost_per_action_type'
  const params = new URLSearchParams({
    fields,
    time_increment: '1',
    time_range: JSON.stringify({ since: sinceStr, until }),
    level: 'campaign',
  })
  const res = await metaFetch<{ data: MetaInsightRow[] }>(
    `/${campaignId}/insights?${params.toString()}`,
  )

  return (res.data ?? []).map(row => {
    const impressions = parseInt(row.impressions, 10) || 0
    const clicks = parseInt(row.clicks, 10) || 0
    const ctr = row.ctr ? parseFloat(row.ctr) : null
    const spend = parseFloat(row.spend) || 0
    const reach = parseInt(row.reach, 10) || 0
    const leads = parseLeadCount(row.actions)
    const cost_per_lead = leads > 0 ? spend / leads : null
    return {
      date: row.date_start,
      impressions,
      clicks,
      ctr,
      spend,
      leads,
      cost_per_lead,
      reach,
      raw: row as unknown as Record<string, unknown>,
    }
  })
}

export { MetaApiError }
