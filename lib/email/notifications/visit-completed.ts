import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getDealStakeholders, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { VisitCompletedEmail } from '@/emails/VisitCompletedEmail'
import { formatDateTime, propertyTypeLabel, formatMoney } from '../format'

export async function notifyVisitCompleted(dealId: string) {
  const { asesor, coordinador, adminsOwners, dealRow } = await getDealStakeholders(dealId)
  if (!dealRow) return

  const advisorName = asesor?.full_name || 'Asesor'
  const to = dedupEmails(
    [coordinador?.email].filter(Boolean) as string[],
    emailsOf(adminsOwners),
    asesor?.email ? [asesor.email] : [],   // asesor recibe como CC conceptual (en un solo To array)
  )
  if (to.length === 0) return

  const visitData = dealRow.visit_data ?? {}
  const sale = visitData.sale ?? {}
  const propertyTypeLbl = propertyTypeLabel(sale.property_type || dealRow.property_type, sale.property_type_other || dealRow.property_type_other)

  const testCtx = await applyTestMode(to, 'Visita realizada')
  const html = await renderEmail(
    VisitCompletedEmail({
      advisorName,
      dealId,
      propertyAddress: dealRow.property_address,
      neighborhood: sale.neighborhood || dealRow.neighborhood,
      propertyType: propertyTypeLbl,
      rooms: sale.rooms ?? dealRow.rooms ?? null,
      coveredArea: sale.covered_m2 ?? dealRow.covered_area ?? null,
      saleReason: sale.sale_reason || null,
      askingPrice: formatMoney(sale.asking_price, sale.asking_price_currency || 'USD'),
      occupancyStatus: sale.occupancy_status || null,
      visitCompletedAt: formatDateTime(dealRow.visit_completed_at || new Date().toISOString()),
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
      recipientRole: 'parte del equipo',
    }) as any
  )
  await sendEmail({
    notificationType: 'visit_completed',
    entityType: 'deal',
    entityId: dealId,
    to,
    subject: `Visita realizada — ${dealRow.property_address} (${advisorName})`,
    html,
  })
}
