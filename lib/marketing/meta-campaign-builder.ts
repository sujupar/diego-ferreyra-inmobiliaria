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
import { decideTargeting } from './targeting-rules'
import { generateAdCopyVariations, variationsToPrimary } from './copy-ai-generator'
import { getUsdToArs } from './usd-rate'

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
}

/**
 * Sube una foto a Meta como ad image. Devuelve el hash.
 *
 * Estrategia: descargar la imagen y subirla como bytes multipart. NO usar el
 * modo `?url=<URL>` porque requiere la capability avanzada "Marketing API
 * Standard Access" que la mayoría de las apps de Meta no tienen por defecto
 * (devuelve error code 3: "Application does not have the capability to make
 * this API call"). El modo multipart funciona con permisos básicos de
 * ads_management.
 */
async function uploadAdImage(photoUrl: string): Promise<string> {
  const { accountId, accessToken } = getMeta()

  // 1. Descargar la imagen
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
  // Meta acepta: jpeg, png, gif, webp, bmp, tiff. Default jpeg si no detectamos.
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const mimeType = allowedTypes.find(t => contentType.startsWith(t)) ?? 'image/jpeg'

  // 2. Construir filename razonable (Meta lo usa como key en la respuesta)
  const rawName = photoUrl.split('/').pop()?.split('?')[0] ?? 'image'
  const ext = mimeType.split('/')[1] ?? 'jpg'
  const filename = rawName.includes('.') ? rawName : `${rawName}.${ext}`

  // 3. Multipart POST a /adimages
  const form = new FormData()
  form.set('access_token', accessToken)
  form.set(filename, new Blob([new Uint8Array(buf)], { type: mimeType }), filename)

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

export interface CampaignOverrides {
  /** Budget diario en ARS — override del decideBudget automático */
  dailyBudgetArs?: number
  /** Índice de la variante de copy a usar (0..N-1) — override del default 0 */
  copyVariantIdx?: number
  /** Spec de targeting completa — override del decideTargeting automático.
   *  Si se pasa, ignora geo automático y usa el preset que eligió el asesor. */
  targetingOverride?: Record<string, unknown>
  /** URL específica de foto a usar como hero (por defecto property.photos[0]) */
  heroPhotoUrl?: string
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
  const supabasePre = getSupabase()
  const { data: existing } = await supabasePre
    .from('property_meta_campaigns')
    .select('campaign_id, adset_id, ad_ids, status, budget_daily, landing_url')
    .eq('property_id', property.id)
    .neq('status', 'archived')
    .maybeSingle()
  if (existing?.campaign_id) {
    const isIncomplete =
      existing.status === 'provisioning' &&
      (!existing.adset_id || !Array.isArray(existing.ad_ids) || existing.ad_ids.length === 0)

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
      // Campaña completa existente — devolvemos la existente, no duplicamos.
      return {
        campaignId: existing.campaign_id,
        adsetId: existing.adset_id ?? '',
        adIds: (existing.ad_ids as string[] | null) ?? [],
        budgetDailyArs: existing.budget_daily ?? 0,
        landingUrl: existing.landing_url ?? `${getAppUrl()}/p/${property.public_slug}`,
      }
    }
  }

  const { accountId, pageId } = getMeta()
  const landingUrl = `${getAppUrl()}/p/${property.public_slug}`
  const overrides = options.overrides ?? {}

  // Tipo de cambio USD→ARS fresco (Bluelytics, cached 1h)
  const { rate: usdToArs } = await getUsdToArs()

  // Budget: override del asesor o cálculo automático
  const autoBudget = decideBudget(property.asking_price, property.currency, usdToArs)
  const budget = overrides.dailyBudgetArs != null && overrides.dailyBudgetArs > 0
    ? { ...autoBudget, dailyArs: overrides.dailyBudgetArs }
    : autoBudget

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

  // 1.5. Persistir la campaign en DB ya con status='provisioning' para
  // que si los pasos siguientes fallan, en el reintento del worker
  // detecte que ya existe y no cree una campaign duplicada en Meta.
  // CRÍTICO: si el insert falla, archivamos la campaña en Meta para evitar
  // huérfanos. Sin esto, una falla acá deja la campaña pagable en Meta sin
  // tracking interno y los siguientes intentos crean duplicados.
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
    console.error('[meta-builder] insert falló, archivando campaign para evitar huérfano', insertError)
    try {
      await metaFetch(`/${campaign.id}`, {
        method: 'POST',
        body: JSON.stringify({ status: 'ARCHIVED' }),
      })
    } catch (archiveErr) {
      console.error('[meta-builder] archivado de rollback también falló', archiveErr)
    }
    throw new Error(`No se pudo persistir la campaña en DB: ${insertError.message}`)
  }

  // 2. Subir imagen hero (override del asesor o la primera por default)
  const heroUrl = overrides.heroPhotoUrl ?? property.photos[0]
  const imageHash = await uploadAdImage(heroUrl)

  // 3. Crear AdCreative
  const creative = await metaFetch<{ id: string }>(`/${accountId}/adcreatives`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Hero ${property.public_slug}`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          image_hash: imageHash,
          link: landingUrl,
          message: copy.primaryText,
          name: copy.headline,
          description: copy.description,
          call_to_action: { type: 'LEARN_MORE', value: { link: landingUrl } },
        },
      },
    }),
  })

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
  // RESTRICCIÓN Advantage+: cuando advantage_audience=1, Meta NO permite
  // `age_min > 25`. Con este flag activado, todo el control de edad mínima
  // se trata como "sugerencia" y Meta lo expande automáticamente. Si pasamos
  // age_min=30 por ejemplo, rechaza con subcode 1870188.
  // Fix: cap age_min en 25. La edad sugerida del buyer persona se mantiene
  // como age_max (que no tiene esa restricción).
  const baseSpec = targeting.spec as Record<string, unknown> & {
    age_min?: number
  }
  const targetingWithAdvantage = {
    ...baseSpec,
    age_min: Math.min(baseSpec.age_min ?? 25, 25),
    targeting_automation: { advantage_audience: 1 },
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

  // 5. Crear Ad
  const ad = await metaFetch<{ id: string }>(`/${accountId}/ads`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Ad ${property.public_slug}`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    }),
  })

  // 6. Smoke test de la landing antes de activar (skipear en dryRun)
  const landingOk = options.dryRun ? false : await smokeTestLanding(landingUrl)

  // 7. Actualizar la fila ya creada en 1.5 con adset_id + ad_ids + status final.
  // En dryRun queda 'paused' para auditoría manual.
  const finalStatus = options.dryRun
    ? 'paused'
    : landingOk
      ? 'active'
      : 'failed'
  await supabase
    .from('property_meta_campaigns')
    .update({
      adset_id: adset.id,
      ad_ids: [ad.id],
      status: finalStatus,
      last_error:
        !options.dryRun && !landingOk ? 'Smoke test de landing falló' : null,
    })
    .eq('campaign_id', campaign.id)

  // 8. Si la landing responde OK y no es dryRun, activar todo en Meta.
  // En dryRun queda PAUSED para que el usuario audite antes de activar.
  if (landingOk && !options.dryRun) {
    await activateCampaign(campaign.id, adset.id, [ad.id])
  }

  return {
    campaignId: campaign.id,
    adsetId: adset.id,
    adIds: [ad.id],
    budgetDailyArs: budget.dailyArs,
    landingUrl,
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
  // El orden importa: primero campaign, después adset, después ads
  await metaFetch(`/${campaignId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ACTIVE' }),
  })
  await metaFetch(`/${adsetId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ACTIVE' }),
  })
  for (const adId of adIds) {
    await metaFetch(`/${adId}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'ACTIVE' }),
    })
  }
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
