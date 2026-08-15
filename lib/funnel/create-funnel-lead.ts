import { createClient } from '@supabase/supabase-js'
import { createDeal } from '@/lib/supabase/deals'
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
   * — así la notificación diferida, que lee el deal de la base, ya la ve. Antes
   * esto se escribía con un UPDATE posterior en `POST /api/funnel/submit`,
   * DESPUÉS de notificar: el email siempre mostraba la campaña vacía.
   */
  attribution?: FunnelAttribution | null
}

export interface FunnelLeadResult {
  contactId: string
  dealId: string
}

/**
 * Crea (o reutiliza) el contacto y crea el deal del funnel. Nada más.
 *
 * ESTO ES TODO LO QUE PASA MIENTRAS LA PERSONA ESPERA. Los cinco avisos que
 * antes colgaban de acá —tarea de coordinación, email, Mailchimp, stitching de
 * la sesión anónima y el evento de conversión a Meta— se encolan en
 * `funnel_lead_jobs` y los ejecuta `lib/funnel/side-effects-worker.ts`. El
 * motivo está escrito con sangre: el 2026-08-08 el POST a Resend colgó 34 s
 * dentro de este camino y el visitante se llevó un 504 aunque su lead ya estaba
 * en el CRM.
 *
 * NO agregar acá ninguna llamada a un tercero. Si hace falta un aviso nuevo,
 * es un `kind` nuevo en la cola.
 */
export async function crearContactoYDeal(input: FunnelLeadInput): Promise<FunnelLeadResult> {
  const supabase = admin()
  const map = resolveFunnelMapping(input.funnel)
  const name = input.name.trim()
  const email = input.email?.trim() || null
  const phone = input.phone?.trim() || null

  // 1) Dedup contacto: email (ilike) → phone (eq) → crear
  let resolvedContactId: string | null = null
  if (email) {
    // ESCAPAR LOS COMODINES DEL PATRÓN, siempre. En `ilike`, `%` y `_` son
    // comodines de LIKE: sin esto, un POST con email "a%@gmail.com" (que la
    // validación permisiva del 2026-08-15 deja pasar, y "_" era legal desde
    // siempre: john_doe@gmail.com) matchea el contacto de OTRA persona y el
    // deal nuevo queda colgado del contacto equivocado. Encontrado por la
    // revisión adversarial ANTES de deployar, verificado contra la base real.
    const patron = email.replace(/[\\%_]/g, '\\$&')
    const { data } = await supabase.from('contacts').select('id').ilike('email', patron).maybeSingle()
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
  // tipoCliente Y message se CONCATENAN, no se elige uno: el ternario anterior
  // descartaba `message` en la clase con tipoCliente elegido (el caso normal),
  // y ahí viaja también el aviso de canal degradado del 2026-08-15 — perderlo
  // era perder el único registro del email/teléfono que la persona tipeó mal.
  const dealNotes =
    [
      input.funnel === 'clase' && input.tipoCliente ? `Tipo de cliente: ${input.tipoCliente}` : null,
      input.message?.trim() || null,
    ]
      .filter(Boolean)
      .join('\n\n') || undefined

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

  return { contactId, dealId }
}
