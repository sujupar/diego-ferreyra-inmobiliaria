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

/**
 * Crea una audiencia customer-list (CUSTOM, `USER_PROVIDED_ONLY`). Devuelve el audience_id.
 *
 * A diferencia de las audiences WEBSITE (que Meta llena solo via pixel),
 * estas se pueblan a mano con `addUsersToAudience` (PII hasheada SHA-256).
 * Usada por la sincronización de públicos por etapa del embudo (Fase 4).
 */
export async function createCustomerListAudience(name: string, description: string): Promise<string> {
  const { accountId, accessToken } = getMeta()
  const res = await fetch(
    `${META}/${META_API_VERSION}/${accountId}/customaudiences?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.slice(0, 50),
        description: description.slice(0, 200),
        subtype: 'CUSTOM',
        customer_file_source: 'USER_PROVIDED_ONLY',
      }),
    },
  )
  const json = (await res.json()) as { id?: string; error?: { message: string; error_subcode?: number } }
  if (!res.ok || !json.id) {
    throw new Error(
      `createCustomerListAudience failed: ${json.error?.message ?? res.status} (subcode ${json.error?.error_subcode ?? '-'})`,
    )
  }
  return json.id
}

// Schema fijo de las filas de hashes enviadas a /users (alineado con audience-hash.ts).
const SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'COUNTRY']

async function usersOp(
  method: 'POST' | 'DELETE',
  audienceId: string,
  rows: string[][],
): Promise<{ ok: boolean; numReceived: number; error?: string }> {
  if (rows.length === 0) return { ok: true, numReceived: 0 }
  const { accessToken } = getMeta()
  const res = await fetch(
    `${META}/${META_API_VERSION}/${audienceId}/users?access_token=${encodeURIComponent(accessToken)}`,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: { schema: SCHEMA, data: rows } }),
    },
  )
  const json = (await res.json()) as { num_received?: number; error?: { message: string; error_subcode?: number } }
  if (!res.ok) {
    return {
      ok: false,
      numReceived: 0,
      error: `${json.error?.message ?? res.status} (subcode ${json.error?.error_subcode ?? '-'})`,
    }
  }
  return { ok: true, numReceived: json.num_received ?? 0 }
}

/** Alta de miembros (batch ≤10k). `rows` = filas de hashes alineadas a SCHEMA. Best-effort: nunca lanza. */
export async function addUsersToAudience(audienceId: string, rows: string[][]) {
  return usersOp('POST', audienceId, rows)
}

/** Baja de miembros (mismos hashes que el alta). Best-effort: nunca lanza. */
export async function removeUsersFromAudience(audienceId: string, rows: string[][]) {
  return usersOp('DELETE', audienceId, rows)
}
