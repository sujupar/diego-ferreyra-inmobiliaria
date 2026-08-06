import { createClient } from '@supabase/supabase-js'
import { createDeal } from '@/lib/supabase/deals'
import { createTaskForRole } from '@/lib/supabase/tasks'
import { notifyAppraisalRequest } from '@/lib/email/notifications/appraisal-request'
import { notifyClassRegistration } from '@/lib/email/notifications/class-registration'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'
import { attributionToDealColumns, type FunnelAttribution } from '@/lib/funnel/attribution'
import { FUNNEL_PLACEHOLDER_LABEL, buildPlaceholderAddress } from '@/lib/funnel/placeholder'

export type FunnelKind = 'tasacion' | 'clase'

interface FunnelMapping {
  stage: 'request' | 'clase_gratuita'
  origin: 'embudo' | 'clase_gratuita'
  placeholderLabel: string
  notify: 'appraisal_request' | 'class'
}

/** Mapea el funnel al stage/origin/notificación del CRM. Puro (testeable). */
export function resolveFunnelMapping(funnel: FunnelKind): FunnelMapping {
  if (funnel === 'clase') {
    return { stage: 'clase_gratuita', origin: 'clase_gratuita', placeholderLabel: FUNNEL_PLACEHOLDER_LABEL.clase, notify: 'class' }
  }
  return { stage: 'request', origin: 'embudo', placeholderLabel: FUNNEL_PLACEHOLDER_LABEL.tasacion, notify: 'appraisal_request' }
}

// Cliente admin sin tipar (igual que lib/supabase/deals.ts y tasks.ts): el tipo
// generado `Database` está incompleto (no incluye la tabla `contacts`), así que
// tiparlo rompería el `.from('contacts')`. Seguimos la convención del repo.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface FunnelLeadInput {
  funnel: FunnelKind
  name: string
  email: string | null
  phone: string | null
  propertyLocation?: string | null
  tipoCliente?: string | null
  message?: string | null
  /**
   * Atribución de campaña (UTM/Meta) capturada en la landing. Se vuelca a las
   * columnas `meta_*` del deal en el MISMO insert (ver `attributionToDealColumns`)
   * — así la notificación que se dispara a continuación ya la ve. Antes esto se
   * escribía con un UPDATE posterior en `POST /api/funnel/submit`, DESPUÉS de que
   * `createFunnelLead` ya había notificado: el email siempre mostraba la campaña
   * vacía.
   */
  attribution?: FunnelAttribution | null
}

export interface FunnelLeadResult {
  contactId: string
  dealId: string
}

/**
 * Crea (o reutiliza) el contacto y crea el deal del funnel, replicando el
 * comportamiento del webhook GHL (origin/stage/placeholder/notificación).
 * El webhook GHL NO se modifica (se desmantela en Fase 5).
 */
export async function createFunnelLead(input: FunnelLeadInput): Promise<FunnelLeadResult> {
  const supabase = admin()
  const map = resolveFunnelMapping(input.funnel)
  const name = input.name.trim()
  const email = input.email?.trim() || null
  const phone = input.phone?.trim() || null

  // 1) Dedup contacto: email (ilike) → phone (eq) → crear
  let resolvedContactId: string | null = null
  if (email) {
    const { data } = await supabase.from('contacts').select('id').ilike('email', email).maybeSingle()
    if (data) resolvedContactId = data.id as string
  }
  if (!resolvedContactId && phone) {
    const { data } = await supabase.from('contacts').select('id').eq('phone', phone).maybeSingle()
    if (data) resolvedContactId = data.id as string
  }
  if (!resolvedContactId) {
    const { data, error } = await supabase
      .from('contacts')
      .insert({ full_name: name, email, phone, origin: map.origin, notes: input.message ?? null })
      .select('id')
      .single()
    if (error) throw error
    resolvedContactId = data.id as string
  }
  // En este punto el contacto siempre existe (reutilizado o recién creado).
  const contactId: string = resolvedContactId

  // 2) Crear deal (property_address NOT NULL → ubicación capturada o placeholder)
  const placeholder = buildPlaceholderAddress(input.funnel, name)
  const propertyAddress =
    input.funnel === 'tasacion' && input.propertyLocation?.trim()
      ? input.propertyLocation.trim()
      : placeholder
  const dealNotes =
    input.funnel === 'clase' && input.tipoCliente
      ? `Tipo de cliente: ${input.tipoCliente}`
      : input.message ?? undefined

  // Columnas meta_* (+ origin_metadata) derivadas de la atribución de campaña.
  // {} si no hay atribución → el spread no agrega nada y el insert queda
  // idéntico al comportamiento previo.
  const metaCols = attributionToDealColumns(input.attribution)

  const dealId = await createDeal({
    contact_id: contactId,
    property_address: propertyAddress,
    origin: map.origin,
    stage: map.stage,
    notes: dealNotes,
    ...metaCols,
  })

  // 3) Tarea de coordinador (broadcast a coordinadores activos)
  await createTaskForRole('coordinador', {
    type: 'update_contact',
    title: `${map.placeholderLabel}: ${name}`,
    description: `Lead capturado desde la landing de ${input.funnel === 'clase' ? 'Clase Gratuita' : 'Tasación Directa'}. Completar datos.`,
    deal_id: dealId,
    contact_id: contactId,
  })

  // 4) Notificación con escalación (rama correcta según funnel).
  //    Tasación = SOLICITUD recién entrada (no hay fecha ni asesor todavía) →
  //    notifyAppraisalRequest. El email de "Tasación agendada" (notifyDealCreated)
  //    es exclusivo de la coordinación manual desde /api/deals.
  await notifyWithEscalation(
    () => (map.notify === 'class' ? notifyClassRegistration({ dealId }) : notifyAppraisalRequest({ dealId })),
    { failedNotificationType: map.notify === 'class' ? 'class_registration' : 'appraisal_request', entityType: 'deal', entityId: dealId },
  )

  // 5) Sync Mailchimp (best-effort: nunca rompe el alta del lead)
  try {
    const { syncDealToMailchimp } = await import('@/lib/integrations/mailchimp/sync-deal')
    await syncDealToMailchimp(dealId)
  } catch (err) {
    console.warn('[mailchimp] funnel sync failed (ignored):', err instanceof Error ? err.message : err)
  }

  return { contactId, dealId }
}
