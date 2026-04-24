import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getPropertyStakeholders, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { DocsReadyForLawyerEmail } from '@/emails/DocsReadyForLawyerEmail'
import { LEGAL_DOCS_CATALOG, getApplicableDocs } from '@/types/legal-docs.types'
import { formatDateTime } from '../format'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * N5: notificar a TODOS los abogados activos que hay una propiedad lista para revisar.
 * Es repetible por ciclo: cada transición a pending_review cuenta como submission
 * nueva y debe disparar un email aunque ya se haya enviado uno antes. Usamos como
 * entity_id el sufijo `:<submission_count>` derivado del conteo de legal_review_events
 * de tipo 'submitted' (incluye el que acaba de registrarse).
 */
export async function notifyDocsReadyForLawyer(propertyId: string) {
  const { lawyers, propertyRow } = await getPropertyStakeholders(propertyId)
  if (!propertyRow) return

  const to = emailsOf(lawyers)
  if (to.length === 0) {
    console.warn('[notify:docs-ready-for-lawyer] no active lawyers — skipping send')
    return
  }

  // Count submissions so this notification is idempotent per cycle.
  const { count: submissionCount } = await getAdmin()
    .from('legal_review_events')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('action', 'submitted')
  const cycle = submissionCount ?? 1

  const { data: docRows } = await getAdmin()
    .from('properties')
    .select('legal_docs, legal_flags, property_type')
    .eq('id', propertyId)
    .maybeSingle()
  const docs = (docRows?.legal_docs as any) || {}
  const flags = (docRows?.legal_flags as any) || {}
  const propertyType = docRows?.property_type as string | null
  const applicable = getApplicableDocs(flags, propertyType || '')
  const uploaded = applicable
    .filter(d => docs[d.key]?.file_url)
    .map(d => d.label)
  const docsList = uploaded.length > 0 ? uploaded.join(' · ') : 'Checklist completo'

  const flagParts: string[] = []
  if (flags?.has_succession) flagParts.push('Sucesión')
  if (flags?.has_divorce) flagParts.push('Divorcio')
  if (flags?.has_powers) flagParts.push('Poderes')
  if (flags?.is_credit_purchase) flagParts.push('Crédito')
  const flagsSummary = flagParts.length > 0 ? flagParts.join(' · ') : null

  const advisorName = (await getAssignedAdvisorName(propertyRow.assigned_to)) || 'El asesor'

  const testCtx = await applyTestMode(to, 'Documentos listos para revisar')
  const html = await renderEmail(
    DocsReadyForLawyerEmail({
      advisorName,
      propertyId,
      propertyAddress: propertyRow.address,
      neighborhood: propertyRow.neighborhood,
      propertyType,
      uploadedAt: formatDateTime(new Date().toISOString()),
      docsList,
      flagsSummary,
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
    }) as any
  )

  await sendEmail({
    notificationType: 'docs_ready_for_lawyer',
    entityType: 'property',
    entityId: `${propertyId}:${cycle}`,
    to,
    subject: `Documentos listos para revisar — ${propertyRow.address}`,
    html,
  })
}

async function getAssignedAdvisorName(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const { data } = await getAdmin().from('profiles').select('full_name').eq('id', userId).maybeSingle()
  return data?.full_name || null
}
