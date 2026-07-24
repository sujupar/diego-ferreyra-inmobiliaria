/**
 * E1.4 — Servicio de landing (co-creación + publish).
 *
 * Concentra el acceso a property_landings / property_avatars (que todavía no
 * están en types/database.types.ts → cliente sin genérico + casteo acá) y la
 * lógica de estados: draft → published → archived. Los endpoints quedan finos.
 *
 * Reglas de oro (del plan):
 *  - properties.public_slug = única fuente del enlace; no cambia al re-publicar.
 *  - content es DATO validado con Zod; publish exige el invariante (1 lead_form).
 *  - utm_base + funnel_type se CONGELAN al publicar.
 *  - avatar elegido → property_avatars.is_primary (compartido con la campaña).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { ensurePublicSlug } from './assign-slug'
import { getOrGenerateBridgedDescription } from '@/lib/marketing/portal-description-bridge'
import { analyzePropertyPhotos } from '@/lib/marketing/property-vision-analyzer'
import { deriveFunnelType, type PropertyFunnelType } from './funnel-type'
import { buildFromTemplate, suggestTemplateId, getTemplate } from './templates'
import { buildConversionDocument } from './templates/conversion'
import { generateConversionCopy } from './conversion-copy'
import { buildUtmBase } from './utm'
import { LandingDocument, safeParseLandingDocument } from './schema'
import { generateEmpathyAvatars } from '@/lib/marketing/empathy-avatar-generator'
import { generateCoCreationQuestions } from './questions-generator'
import type { EmpathyAvatar } from '@/lib/marketing/empathy-avatar'
import type { LandingProperty } from './registry'

function admin() {
  // Sin genérico <Database>: property_landings/property_avatars no están en los
  // types generados (CLI de Supabase no conecta). Casteamos las filas abajo.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function adminTyped(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface WizardState {
  step: 'intro' | 'questions' | 'avatar' | 'template' | 'preview' | 'publish'
  questions?: { id: string; question: string; hint?: string }[]
  answers?: Record<string, string>
  avatarCandidates?: EmpathyAvatar[]
  selectedAvatarIndex?: number
  visionSummary?: string
  descriptionUsed?: string
}

export interface LandingRow {
  id: string
  property_id: string
  status: 'draft' | 'published' | 'archived'
  template_id: string
  content: unknown
  avatar_id: string | null
  wizard_state: WizardState
  ai_analysis: unknown
  funnel_type: PropertyFunnelType | null
  utm_base: unknown
  public_slug: string | null
  published_at: string | null
}

/** Autorización por rol para el flujo de landing. Abogado 403; asesor su propiedad. */
export async function authorizeLanding(propertyId: string, userId: string, role: string): Promise<boolean> {
  if (role === 'abogado') return false
  if (['admin', 'dueno', 'coordinador'].includes(role)) return true
  if (role === 'asesor') {
    const { data } = await adminTyped().from('properties').select('assigned_to').eq('id', propertyId).single()
    return !!data && data.assigned_to === userId
  }
  return false
}

export async function getLanding(propertyId: string): Promise<LandingRow | null> {
  const { data } = await admin()
    .from('property_landings')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle()
  return (data as unknown as LandingRow) ?? null
}

async function getProperty(propertyId: string): Promise<LandingProperty | null> {
  const { data } = await adminTyped().from('properties').select('*').eq('id', propertyId).single()
  return (data as LandingProperty) ?? null
}

/**
 * Arranca (o devuelve) la co-creación. Si no hay landing: corre Vision +
 * descripción de portal + 3 avatares + preguntas, arma content inicial desde el
 * template sugerido por perfil, y persiste el draft. Idempotente: si ya existe,
 * la devuelve tal cual (no re-genera).
 */
export async function startCoCreation(propertyId: string, userId: string | null): Promise<LandingRow> {
  const existing = await getLanding(propertyId)
  if (existing) return existing

  const property = await getProperty(propertyId)
  if (!property) throw new Error('property not found')

  const funnelType = deriveFunnelType(property)

  // Insumos IA (best-effort, con fallback interno cada uno).
  let visionSummary = ''
  try {
    const vision = await analyzePropertyPhotos(property as never)
    visionSummary = vision?.summary ?? ''
  } catch { /* sin vision */ }

  let description = ''
  try {
    const bridged = await getOrGenerateBridgedDescription(property as never)
    description = [bridged.title, bridged.subtitle, bridged.body].filter(Boolean).join('\n')
  } catch { /* sin descripción */ }

  const [{ avatars }, { questions }] = await Promise.all([
    generateEmpathyAvatars({ property, count: 3, visionSummary, description }),
    generateCoCreationQuestions({ property, visionSummary, description }),
  ])

  // E1.8 — landing de CONVERSIÓN con copy IA (beneficios intangibles + dolor),
  // personalizado con el avatar. Queda editable; si la IA falla, cae al copy
  // determinístico internamente (generateConversionCopy nunca tira).
  const templateId = suggestTemplateId(funnelType) // 'conversion'
  const { copy } = await generateConversionCopy({ property, avatar: avatars[0] })
  const document = buildConversionDocument(property, copy)

  const wizard_state: WizardState = {
    step: 'questions',
    questions,
    answers: {},
    avatarCandidates: avatars,
    selectedAvatarIndex: 0,
    visionSummary,
    descriptionUsed: description.slice(0, 2000),
  }

  const { data, error } = await admin()
    .from('property_landings')
    .insert({
      property_id: propertyId,
      status: 'draft',
      template_id: templateId,
      content: document,
      wizard_state,
      ai_analysis: { visionSummary },
      funnel_type: funnelType,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw new Error(`No se pudo crear la landing: ${error.message}`)
  return data as unknown as LandingRow
}

/** Actualiza wizard_state / content / template del draft (merge superficial). */
export async function updateLanding(propertyId: string, patch: {
  wizardState?: Partial<WizardState>
  templateId?: string
  content?: unknown
}): Promise<LandingRow> {
  const current = await getLanding(propertyId)
  if (!current) throw new Error('landing not found')

  const update: Record<string, unknown> = {}

  if (patch.wizardState) {
    update.wizard_state = { ...current.wizard_state, ...patch.wizardState }
  }

  // Cambiar template → reconstruye content desde el template (con confirmación en la UI).
  if (patch.templateId && patch.templateId !== current.template_id) {
    const property = await getProperty(propertyId)
    if (!property) throw new Error('property not found')
    const { templateId, document } = buildFromTemplate(patch.templateId, property)
    update.template_id = templateId
    update.content = document
    await writeRevision(current.id, templateId, document, current.avatar_id, 'template_switch', null)
  }

  // Content editado directo (autosave del editor E1.6) — validado con Zod.
  if (patch.content !== undefined) {
    const parsed = LandingDocument.safeParse(patch.content)
    if (!parsed.success) throw new Error('content inválido: ' + parsed.error.issues[0]?.message)
    update.content = parsed.data
  }

  const { data, error } = await admin()
    .from('property_landings')
    .update(update)
    .eq('property_id', propertyId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as LandingRow
}

async function writeRevision(
  landingId: string, templateId: string, content: unknown, avatarId: string | null,
  reason: string, userId: string | null,
): Promise<void> {
  // revision = max+1
  const { data: last } = await admin()
    .from('property_landing_revisions')
    .select('revision')
    .eq('landing_id', landingId)
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextRev = ((last as { revision?: number } | null)?.revision ?? 0) + 1
  await admin().from('property_landing_revisions').insert({
    landing_id: landingId, revision: nextRev, template_id: templateId,
    content, avatar_id: avatarId, reason, created_by: userId,
  })
}

/** Persiste el avatar elegido como property_avatars.is_primary (compartido). */
export async function persistSelectedAvatar(propertyId: string, avatar: EmpathyAvatar, userId: string | null): Promise<string> {
  const sb = admin()
  // Bajar cualquier primary previo (el índice parcial único no deja 2).
  await sb.from('property_avatars').update({ is_primary: false }).eq('property_id', propertyId).eq('is_primary', true)
  const { data, error } = await sb.from('property_avatars').insert({
    property_id: propertyId, source: 'landing', label: avatar.shortLabel,
    avatar, is_primary: true, created_by: userId,
  }).select('id').single()
  if (error) throw new Error(`No se pudo guardar el avatar: ${error.message}`)
  return (data as { id: string }).id
}

/**
 * Publica la landing. Idempotente. Valida el invariante de conversión, asigna
 * slug, congela utm_base + funnel_type, persiste el avatar elegido y escribe
 * revisión. Devuelve el slug y la url pública.
 */
export async function publishLanding(propertyId: string, appUrl: string, userId: string | null): Promise<{
  slug: string
  url: string
}> {
  const landing = await getLanding(propertyId)
  if (!landing) throw new Error('landing not found')

  // 1. content válido (invariante: al menos 1 CTA/lead_form de conversión).
  const doc = safeParseLandingDocument(landing.content)
  if (!doc) throw new Error('La landing no tiene un diseño válido. Revisá que tenga al menos un CTA.')

  // 2. avatar elegido → primary (si el asesor seleccionó uno de los candidatos).
  let avatarId = landing.avatar_id
  const candidates = landing.wizard_state?.avatarCandidates ?? []
  const idx = landing.wizard_state?.selectedAvatarIndex ?? 0
  if (!avatarId && candidates[idx]) {
    avatarId = await persistSelectedAvatar(propertyId, candidates[idx], userId)
  }

  // 3. slug (única fuente del enlace).
  const slug = await ensurePublicSlug(adminTyped(), propertyId)

  // 4. utm_base congelada.
  const funnelType: PropertyFunnelType = landing.funnel_type ?? 'venta_propiedad'
  const utmBase = buildUtmBase(appUrl, slug, funnelType)

  // 5. publicar.
  const { error } = await admin()
    .from('property_landings')
    .update({
      status: 'published',
      avatar_id: avatarId,
      utm_base: utmBase,
      public_slug: slug,
      published_slug: slug,
      published_at: new Date().toISOString(),
    })
    .eq('property_id', propertyId)
  if (error) throw new Error(error.message)

  // 6. revisión de publish.
  await writeRevision(landing.id, landing.template_id, doc, avatarId, 'publish', userId)

  return { slug, url: utmBase.base_url }
}

/** Despublica: vuelve a draft (no borra el slug ni el content). */
export async function unpublishLanding(propertyId: string): Promise<void> {
  const { error } = await admin()
    .from('property_landings')
    .update({ status: 'draft' })
    .eq('property_id', propertyId)
  if (error) throw new Error(error.message)
}

export { getTemplate }
