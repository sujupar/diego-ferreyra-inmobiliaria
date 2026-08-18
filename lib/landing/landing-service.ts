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
import { pickPublishSource } from './editor/promote'
export { pickPublishSource }
import { getOrGenerateBridgedDescription } from '@/lib/marketing/portal-description-bridge'
import { analyzePropertyPhotos } from '@/lib/marketing/property-vision-analyzer'
import { deriveFunnelType, type PropertyFunnelType } from './funnel-type'
import { buildFromTemplate, suggestTemplateId, getTemplate } from './templates'
import { buildLuxuryDocument } from './templates/luxury'
import { buildConversionDocument } from './templates/conversion'
import { resolveDeliverMedia } from '@/lib/properties/deliver-media'
import { generateConversionCopy, deterministicConversionCopy } from './conversion-copy'
import { ENRICH_STAGES, nextEnrichStage, type EnrichStage } from './enrich'
import { deriveTier } from './tier'
import { buildUtmBase } from './utm'
import { LandingDocument, safeParseLandingDocument } from './schema'
import { generateEmpathyAvatars } from '@/lib/marketing/empathy-avatar-generator'
import { generateCoCreationQuestions } from './questions-generator'
import { faltanRespuestas, bloqueoDePublicacion } from './answers-gate'
import { getOrCreateLocationInsights, type LocationInsights } from '@/lib/marketing/location-insights'
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
  /**
   * Etapa pendiente del enriquecimiento con IA. Ausente = landing creada antes
   * de que el enriquecimiento se partiera en etapas → ya está completa.
   */
  enrich?: EnrichStage
  /**
   * true = los textos publicables se generaron CON las respuestas del asesor
   * (etapa 'copy' re-armada por el envío de respuestas). El gate de publicación
   * lo exige junto con `faltanRespuestas` — ver lib/landing/answers-gate.ts.
   */
  copyFromAnswers?: boolean
}

export interface LandingRow {
  id: string
  property_id: string
  status: 'draft' | 'published' | 'archived'
  template_id: string
  content: unknown
  draft_content: unknown | null
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

export async function getProperty(propertyId: string): Promise<LandingProperty | null> {
  const { data } = await adminTyped().from('properties').select('*').eq('id', propertyId).maybeSingle()
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
  const templateId = suggestTemplateId(funnelType) // 'luxury'

  // SIN IA — este request tiene que ser rápido. Las 4 etapas de IA que antes
  // vivían acá sumaban ~30s y hacían que Netlify matara la función con un 504
  // (ver el comentario largo de `lib/landing/enrich.ts`). Ahora la landing nace
  // con el copy DETERMINÍSTICO —que ya es un documento válido y publicable— y
  // el enriquecimiento con IA corre en llamadas aparte, una etapa por llamada.
  const document = buildLuxuryDocument(
    property,
    deterministicConversionCopy(property),
    deriveTier(property),
  )

  const wizard_state: WizardState = {
    step: 'questions',
    questions: [],
    answers: {},
    avatarCandidates: [],
    selectedAvatarIndex: 0,
    visionSummary: '',
    descriptionUsed: '',
    enrich: ENRICH_STAGES[0],
    copyFromAnswers: false,
  }

  const { data, error } = await admin()
    .from('property_landings')
    .insert({
      property_id: propertyId,
      status: 'draft',
      template_id: templateId,
      content: document,
      wizard_state,
      ai_analysis: {},
      funnel_type: funnelType,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw new Error(`No se pudo crear la landing: ${error.message}`)
  return data as unknown as LandingRow
}

/**
 * Corre UNA etapa del enriquecimiento con IA y devuelve la landing actualizada.
 * El cliente la llama en loop hasta que `wizard_state.enrich === 'done'`.
 *
 * Cada etapa es idempotente respecto de sí misma y solo avanza el puntero cuando
 * terminó, así que un reintento repite esa etapa y nunca las anteriores. Las
 * etapas son best-effort igual que antes: si la IA falla, se guarda lo que haya
 * (o el fallback determinístico) y se sigue — la landing nunca queda trabada.
 */
export async function runEnrichStage(propertyId: string): Promise<LandingRow> {
  const landing = await getLanding(propertyId)
  if (!landing) throw new Error('landing not found')

  const stage = nextEnrichStage(landing.wizard_state ?? {})
  if (stage === 'done') return landing

  const property = await getProperty(propertyId)
  if (!property) throw new Error('property not found')

  const ws: WizardState = { ...landing.wizard_state }
  const update: Record<string, unknown> = {}

  if (stage === 'vision') {
    // Gemini Vision sobre hasta 8 fotos (tiene su propio corte interno a 15s).
    let visionSummary = ''
    try {
      const vision = await analyzePropertyPhotos(property as never)
      visionSummary = vision?.summary ?? ''
    } catch { /* sin vision */ }
    ws.visionSummary = visionSummary
    ws.enrich = 'location'
    update.ai_analysis = { visionSummary }
  } else if (stage === 'location') {
    // Investigación de zona SIN IA (Google vía ScraperAPI + mercado propio),
    // cacheada en properties.location_insights. Best-effort: si falla, los
    // prompts de descripción y copy caen al modo "sin datos de zona".
    try { await getOrCreateLocationInsights(propertyId) } catch { /* sin insights */ }
    ws.enrich = 'description'
  } else if (stage === 'description') {
    // Descripción de portal. Normalmente está cacheada y cuesta ~0, pero cuando
    // no lo está se genera con IA — por eso va en su propia llamada.
    let description = ''
    try {
      const bridged = await getOrGenerateBridgedDescription(property as never)
      description = [bridged.title, bridged.subtitle, bridged.body].filter(Boolean).join('\n')
    } catch { /* sin descripción */ }
    ws.descriptionUsed = description.slice(0, 2000)
    ws.enrich = 'avatars'
  } else if (stage === 'avatars') {
    const [{ avatars }, { questions }] = await Promise.all([
      generateEmpathyAvatars({
        property, count: 3,
        visionSummary: ws.visionSummary ?? '',
        description: ws.descriptionUsed ?? '',
      }),
      generateCoCreationQuestions({
        property,
        visionSummary: ws.visionSummary ?? '',
        description: ws.descriptionUsed ?? '',
      }),
    ])
    ws.avatarCandidates = avatars
    ws.questions = questions
    // El arranque automático termina acá (decisión del usuario, 2026-08-06):
    // los textos NO se generan hasta que el asesor responda las preguntas —
    // el envío de respuestas re-arma enrich='copy' y el mismo loop los genera.
    ws.enrich = 'done'
  } else {
    // Etapa 'copy' (re-armada por el envío de respuestas, o draft viejo de v1
    // que quedó a mitad): genera el copy v2 con TODO el contexto — respuestas
    // del asesor, avatar elegido, visión de fotos, descripción e insights de
    // zona — y reemplaza el documento con el que la landing nació.
    const avatar = (ws.avatarCandidates ?? [])[ws.selectedAvatarIndex ?? 0]
    const insights = ((property as Record<string, unknown>).location_insights ?? null) as LocationInsights | null
    const { copy } = await generateConversionCopy({
      property,
      avatar,
      answers: ws.answers ?? {},
      questions: ws.questions ?? [],
      visionSummary: ws.visionSummary ?? '',
      insights,
    })
    // El content se reconstruye con el TEMPLATE ELEGIDO (hallazgo del review
    // 2026-08-06: siempre armaba Lujo y pisaba el diseño). Lujo y Conversión
    // aceptan el copy generado; los dos legacy (editorial/cinematic) no tienen
    // slots de copy IA y se rearman con su builder propio.
    const templateId = landing.template_id
    if (templateId === 'conversion') {
      update.content = buildConversionDocument(property, copy)
    } else if (templateId === 'luxury' || !templateId) {
      update.content = buildLuxuryDocument(property, copy, deriveTier(property))
    } else {
      update.content = buildFromTemplate(templateId, property).document
    }
    // Regenerar los textos deja obsoleto cualquier borrador del editor (estaba
    // basado en el content anterior): si quedara, pickPublishSource lo
    // promovería al publicar y el copy nuevo se descartaría en silencio.
    update.draft_content = null
    ws.copyFromAnswers = faltanRespuestas(ws).length === 0 && (ws.questions ?? []).length > 0
    ws.enrich = 'done'
  }

  update.wizard_state = ws
  const { data, error } = await admin()
    .from('property_landings')
    .update(update)
    .eq('property_id', propertyId)
    .select('*')
    .single()
  if (error) throw new Error(`No se pudo guardar el avance: ${error.message}`)
  return data as unknown as LandingRow
}

/** Actualiza wizard_state / content / template del draft (merge superficial). */
export async function updateLanding(propertyId: string, patch: {
  wizardState?: Partial<WizardState>
  templateId?: string
  content?: unknown
  draftContent?: unknown
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
    // Si los textos ya se habían generado con las respuestas, el rebuild
    // determinístico los pisó → el gate NO puede seguir en verde (hallazgo del
    // review 2026-08-06). Se re-arma la etapa copy; la UI la corre a continuación.
    if (current.wizard_state?.copyFromAnswers === true) {
      update.wizard_state = {
        ...current.wizard_state,
        ...(patch.wizardState ?? {}),
        enrich: 'copy',
        copyFromAnswers: false,
      }
    }
    await writeRevision(current.id, templateId, document, current.avatar_id, 'template_switch', null)
  }

  // Content editado directo (autosave del editor E1.6) — validado con Zod.
  if (patch.content !== undefined) {
    const parsed = LandingDocument.safeParse(patch.content)
    if (!parsed.success) throw new Error('content inválido: ' + parsed.error.issues[0]?.message)
    update.content = parsed.data
  }

  // Borrador del editor (E1.6) — se autosalva acá; la landing pública sigue leyendo
  // `content` (status='published') hasta que "Publicar cambios" promueva el borrador.
  if (patch.draftContent !== undefined) {
    const parsed = LandingDocument.safeParse(patch.draftContent)
    if (!parsed.success) throw new Error('draft inválido: ' + parsed.error.issues[0]?.message)
    update.draft_content = parsed.data
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

/** Guarda qué medio (video recorrido, tour 3D o video propio) se le entrega a quien se registre. */
export async function setDeliverMedia(propertyId: string, deliverMedia: 'video_recorrido' | 'tour_3d' | 'video_propio'): Promise<void> {
  const { error } = await adminTyped()
    .from('properties')
    .update({ deliver_media: deliverMedia })
    .eq('id', propertyId)
  if (error) throw new Error(error.message)
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
/**
 * Mensaje que ve el asesor cuando intenta publicar sin recorrido. Se exporta
 * para que la UI muestre EXACTAMENTE el mismo texto antes de que apriete el botón.
 */
export const RECORRIDO_REQUERIDO_MSG =
  'Para publicar la landing la propiedad necesita un video recorrido, un recorrido virtual o, ' +
  'al menos, un video cargado. Cargalo en la pestaña Multimedia y volvé a publicar.'

/**
 * Frena la publicación si la propiedad no tiene NINGÚN entregable (ver
 * `resolveDeliverMedia`: recorrido dedicado → tour 3D → video propio de la
 * propiedad). Desde 2026-08-02 el video "de marketing" (`video_url`/
 * `video_file_url`) también cuenta — decisión del dueño: sin recorrido pero
 * con video, la landing se hace solo con fotos y el video se entrega en la
 * página de gracias.
 */
async function assertRecorridoDisponible(propertyId: string): Promise<void> {
  const { data, error } = await admin()
    .from('properties')
    .select('video_recorrido_url, tour_3d_url, video_url, video_file_url, deliver_media')
    .eq('id', propertyId)
    .maybeSingle()
  // Si la consulta falla no bloqueamos la publicación por un problema de
  // infraestructura: el gate es de negocio, no un candado de disponibilidad.
  if (error || !data) return
  if (resolveDeliverMedia(data).kind === 'fotos') {
    throw new Error(RECORRIDO_REQUERIDO_MSG)
  }
}

export async function publishLanding(propertyId: string, appUrl: string, userId: string | null): Promise<{
  slug: string
  url: string
}> {
  const landing = await getLanding(propertyId)
  if (!landing) throw new Error('landing not found')

  // 0. Gate del recorrido (decisión del usuario, 2026-07-29): la landing es tráfico
  //    PAGO y todo lo que se le promete a quien se registra ("te enviamos el
  //    recorrido") tiene que existir. Sin recorrido no se publica. El gate va acá
  //    —no al crear— para que el asesor pueda dejar la landing lista mientras el
  //    video se filma o se edita.
  await assertRecorridoDisponible(propertyId)

  // 0bis. Gate de copy genérico. Lo que se protege es que no salga publicada la
  //    landing tal como la escupió el generador; hay DOS formas válidas de
  //    dejar de estar en ese estado —responder las preguntas y generar los
  //    textos, o escribirlos a mano en el editor— y las dos habilitan publicar.
  //    La regla completa vive en `answers-gate.ts` y la comparte la UI.
  const motivoBloqueo = bloqueoDePublicacion(landing)
  if (motivoBloqueo) throw new Error(motivoBloqueo)

  // 1. Fuente a publicar: si hay borrador del editor (E1.6), se publica el borrador
  //    (y se promueve a `content`); si no, el `content` actual. Validado con el
  //    invariante de conversión (≥1 CTA/lead_form).
  const { source, promoteDraft } = pickPublishSource(landing)
  const doc = safeParseLandingDocument(source)
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

  // 5. publicar. Si venía de un borrador del editor, se promueve a `content` y se
  //    limpia `draft_content` (el flujo del wizard, sin borrador, queda igual).
  const update: Record<string, unknown> = {
    status: 'published',
    avatar_id: avatarId,
    utm_base: utmBase,
    public_slug: slug,
    published_slug: slug,
    published_at: new Date().toISOString(),
  }
  if (promoteDraft) {
    update.content = doc
    update.draft_content = null
  }
  const { error } = await admin()
    .from('property_landings')
    .update(update)
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

/**
 * Elimina la landing DE VERDAD (pedido del usuario, 2026-08-07): la única forma
 * de volver a generarla de cero es borrar la fila — `startCoCreation` es
 * idempotente y devuelve la existente mientras haya una.
 *
 * Qué pasa con cada pieza:
 *  - `property_landing_revisions` se borra solo (FK ON DELETE CASCADE).
 *  - `property_avatars` NO se toca: el avatar primario lo comparte la campaña Meta.
 *  - `properties.public_slug` NO se toca (regla de oro: única fuente del enlace).
 *    El enlace público sigue VIVO mientras tanto: /p/[slug] cae a la landing
 *    determinística armada desde la propiedad, así que una campaña Meta activa
 *    nunca apunta a un 404. Al re-publicar, `ensurePublicSlug` reusa el slug →
 *    el enlace queda idéntico.
 */
export async function deleteLanding(propertyId: string): Promise<void> {
  const { error } = await admin()
    .from('property_landings')
    .delete()
    .eq('property_id', propertyId)
  if (error) throw new Error(error.message)
}

export { getTemplate }
