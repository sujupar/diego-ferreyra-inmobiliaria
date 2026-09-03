import { createClient } from '@supabase/supabase-js'
import { createDeal } from '@/lib/supabase/deals'
import { attributionToDealColumns, type FunnelAttribution } from '@/lib/funnel/attribution'
import { FUNNEL_PLACEHOLDER_LABEL, buildPlaceholderAddress } from '@/lib/funnel/placeholder'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'

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
  /** Variante A/B de la landing. null para todo lo anterior al experimento. */
  landingVariant?: 'A' | 'B' | null
}

export interface FunnelLeadResult {
  contactId: string
  dealId: string
}

/**
 * Crea (o reutiliza) el contacto y crea el deal del funnel. Nada más.
 *
 * ESTO ES TODO LO QUE PASA MIENTRAS LA PERSONA ESPERA. Los seis avisos que
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

  // 1) Dedup contacto: email (ilike) → phone (por últimos 10 dígitos) → crear
  let resolvedContactId: string | null = null
  let telefonoDelContacto: string | null = null
  if (email) {
    // ESCAPAR LOS COMODINES DEL PATRÓN, siempre. En `ilike`, `%` y `_` son
    // comodines de LIKE: sin esto, un POST con email "a%@gmail.com" (que la
    // validación permisiva del 2026-08-15 deja pasar, y "_" era legal desde
    // siempre: john_doe@gmail.com) matchea el contacto de OTRA persona y el
    // deal nuevo queda colgado del contacto equivocado. Encontrado por la
    // revisión adversarial ANTES de deployar, verificado contra la base real.
    const patron = email.replace(/[\\%_]/g, '\\$&')
    const { data } = await supabase.from('contacts').select('id, phone').ilike('email', patron).maybeSingle()
    if (data) {
      resolvedContactId = data.id as string
      telefonoDelContacto = (data.phone as string | null) ?? null
    }
  }
  if (!resolvedContactId && phone) {
    // Por últimos 10 dígitos (`phone_norm`, columna generada + índice), NUNCA
    // por igualdad exacta: '+5491149372737' y '+541149372737' son el mismo
    // teléfono (el "9" argentino) y el `.eq('phone', ...)` de antes no los
    // matcheaba — así se acumularon contactos duplicados (Ada, Susana,
    // Eduardo... verificado en la base) y a 1000 registros/día sería una plaga.
    const clave = ultimos10Digitos(phone)
    if (clave) {
      const { data } = await supabase
        .from('contacts')
        .select('id, phone')
        .eq('phone_norm', clave)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        resolvedContactId = data.id as string
        telefonoDelContacto = (data.phone as string | null) ?? null
      }
    }
  }
  if (resolvedContactId && phone && telefonoDelContacto !== phone) {
    // AUTO-CURACIÓN: el contacto reusado queda con el teléfono RECIÉN tipeado
    // (E.164 del formulario). Sin esto, un contacto viejo guardado sin el 9
    // deja al agente de WhatsApp sin poder encontrarlo cuando el cliente
    // responde — fue exactamente el caso Daniel Lapadula (2026-08-15): tocó
    // "Coordinar por acá" dos veces y nadie le contestó.
    const { error: errTel } = await supabase
      .from('contacts')
      .update({ phone })
      .eq('id', resolvedContactId)
    if (errTel) console.warn('[funnel] no se pudo actualizar el teléfono del contacto', errTel.message)
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
    // Se manda solo si vino: un undefined dejaría la columna en null igual, pero
    // así el insert queda idéntico al de antes cuando no hay experimento.
    ...(input.landingVariant ? { landing_variant: input.landingVariant } : {}),
    ...metaCols,
  })

  return { contactId, dealId }
}
