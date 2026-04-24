import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getDealStakeholders, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { AppraisalSentEmail } from '@/emails/AppraisalSentEmail'
import { generateAppraisalPdfBuffer } from '../pdf-attachment'
import { formatDate, formatMoney } from '../format'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function notifyAppraisalSent(dealId: string, appraisalId: string) {
  const { asesor, coordinador, adminsOwners, dealRow } = await getDealStakeholders(dealId)
  if (!dealRow) return

  const advisorName = asesor?.full_name || 'Asesor'

  const to = dedupEmails(
    [coordinador?.email].filter(Boolean) as string[],
    emailsOf(adminsOwners),
    asesor?.email ? [asesor.email] : [],
  )
  if (to.length === 0) return

  // Load appraisal for subject line (price) and PDF generation.
  const { data: appraisal } = await getAdmin()
    .from('appraisals')
    .select('id, publication_price, currency, property_location, created_at, valuation_result')
    .eq('id', appraisalId)
    .maybeSingle()

  const price = appraisal?.publication_price ?? null
  const currency = appraisal?.currency || 'USD'
  const valorStr = formatMoney(price, currency) || 'valor a confirmar'

  // Generate PDF. This can take 500–1500ms; we accept it inside the request to
  // ensure the buffer survives the serverless lifecycle. If generation fails,
  // the email goes WITHOUT attachment — we pass pdfFilename=null so the
  // template knows not to show a "PDF adjunto" line for a file that doesn't exist.
  let attachments: { filename: string; content: Buffer }[] | undefined
  let pdfFilename: string | null = null
  try {
    const { buffer, filename } = await generateAppraisalPdfBuffer(appraisalId)
    attachments = [{ filename, content: buffer }]
    pdfFilename = filename
  } catch (err) {
    console.error('[notify:appraisal-sent] PDF generation failed — sending without attachment:', err)
  }

  const testCtx = await applyTestMode(to, 'Tasación entregada')
  const html = await renderEmail(
    AppraisalSentEmail({
      advisorName,
      dealId,
      appraisalId,
      propertyAddress: dealRow.property_address,
      neighborhood: dealRow.neighborhood,
      valor: valorStr,
      valorMin: null,
      valorMax: null,
      fecha: formatDate(appraisal?.created_at || new Date().toISOString()),
      pdfFilename: pdfFilename ?? '',
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
      recipientRole: 'parte del equipo',
    }) as any
  )

  await sendEmail({
    notificationType: 'appraisal_sent',
    entityType: 'appraisal',
    entityId: appraisalId,
    to,
    subject: `Tasación entregada — ${dealRow.property_address}: ${valorStr}`,
    html,
    attachments,
  })
}
