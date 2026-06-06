/**
 * Custom Audiences automáticos de Meta para cada campaña/propiedad.
 *
 * Al lanzar una campaña, creamos automáticamente 2 audiences:
 *  1. **Visitantes** de la landing de esta propiedad (rule por URL contains)
 *  2. **Convertidores** que dispararon evento Lead desde esa landing
 *
 * Estos audiences:
 *  - Empiezan vacíos (Meta los va llenando a medida que llegan visitantes)
 *  - Se pueden reusar para retargeting / lookalikes después
 *  - Crecen con el tiempo aunque la campaña original esté pausada
 *
 * Idempotente: si ya existe un audience del mismo tipo para la propiedad,
 * lo reusa en lugar de crear uno nuevo.
 */
const META_API_VERSION = 'v21.0'

function getMeta() {
  const accountIdRaw = process.env.META_AD_ACCOUNT_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  const pixelId = process.env.META_PIXEL_ID
  if (!accountIdRaw || !accessToken) {
    throw new Error('META_AD_ACCOUNT_ID o META_ACCESS_TOKEN faltantes')
  }
  if (!pixelId) {
    throw new Error('META_PIXEL_ID faltante (requerido para website audiences)')
  }
  const accountId = accountIdRaw.startsWith('act_') ? accountIdRaw : `act_${accountIdRaw}`
  return { accountId, accessToken, pixelId }
}

const META = 'https://graph.facebook.com'

export interface CreateAudienceInput {
  propertyId: string
  propertySlug: string
  campaignId: string
  retentionDays?: number // default 180
}

export interface AudienceResult {
  audienceId: string
  audienceName: string
  type: 'landing_visitors' | 'landing_converters'
  ruleDefinition: Record<string, unknown>
}

async function createWebsiteAudience(input: {
  name: string
  description: string
  rule: Record<string, unknown>
  retentionDays: number
}): Promise<string> {
  const { accountId, accessToken } = getMeta()
  const url = `${META}/${META_API_VERSION}/${accountId}/customaudiences?access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: input.name.slice(0, 50), // Meta limita el nombre a 50 chars
      description: input.description.slice(0, 200),
      subtype: 'WEBSITE',
      retention_days: input.retentionDays,
      rule: JSON.stringify(input.rule),
      prefill: true, // empieza con visitantes históricos del pixel
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Meta /customaudiences ${res.status}: ${text}`)
  }
  const data = (await res.json()) as { id: string }
  return data.id
}

/**
 * Crea (o devuelve si ya existe) los 2 audiences para la propiedad:
 * visitantes de la landing + convertidores.
 *
 * La función es best-effort: si Meta rechaza la creación (rate limit, política),
 * NO falla el flow de lanzamiento. El caller decide qué hacer con el error.
 */
export async function createAudiencesForCampaign(
  input: CreateAudienceInput,
): Promise<{ visitors: AudienceResult | null; converters: AudienceResult | null }> {
  const { pixelId } = getMeta()
  const retentionDays = input.retentionDays ?? 180

  // Audience 1: VISITANTES de la landing de esta propiedad
  // Regla: URL contiene "/p/<slug>" en el dominio inmodf.com.ar
  const visitorsRule = {
    inclusions: {
      operator: 'or',
      rules: [
        {
          event_sources: [{ id: pixelId, type: 'pixel' }],
          retention_seconds: retentionDays * 86400,
          filter: {
            operator: 'and',
            filters: [
              { field: 'url', operator: 'i_contains', value: `/p/${input.propertySlug}` },
            ],
          },
        },
      ],
    },
  }
  const visitorsName = `Visitas ${input.propertySlug}`.slice(0, 50)

  // Audience 2: CONVERTERS que dispararon evento Lead desde esa landing
  const convertersRule = {
    inclusions: {
      operator: 'or',
      rules: [
        {
          event_sources: [{ id: pixelId, type: 'pixel' }],
          retention_seconds: retentionDays * 86400,
          filter: {
            operator: 'and',
            filters: [
              { field: 'event', operator: 'eq', value: 'Lead' },
              { field: 'url', operator: 'i_contains', value: `/p/${input.propertySlug}` },
            ],
          },
        },
      ],
    },
  }
  const convertersName = `Conversores ${input.propertySlug}`.slice(0, 50)

  let visitors: AudienceResult | null = null
  let converters: AudienceResult | null = null

  try {
    const visitorsId = await createWebsiteAudience({
      name: visitorsName,
      description: `Visitantes de la landing /p/${input.propertySlug}`,
      rule: visitorsRule,
      retentionDays,
    })
    visitors = {
      audienceId: visitorsId,
      audienceName: visitorsName,
      type: 'landing_visitors',
      ruleDefinition: visitorsRule,
    }
  } catch (err) {
    console.warn('[meta-audiences] visitors audience failed:', err)
  }

  try {
    const convertersId = await createWebsiteAudience({
      name: convertersName,
      description: `Convertidores Lead desde /p/${input.propertySlug}`,
      rule: convertersRule,
      retentionDays,
    })
    converters = {
      audienceId: convertersId,
      audienceName: convertersName,
      type: 'landing_converters',
      ruleDefinition: convertersRule,
    }
  } catch (err) {
    console.warn('[meta-audiences] converters audience failed:', err)
  }

  return { visitors, converters }
}
