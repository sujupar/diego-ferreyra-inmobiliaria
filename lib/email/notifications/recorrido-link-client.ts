import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { applyTestMode } from '../test-mode'
import { RecorridoLinkClientEmail } from '@/emails/RecorridoLinkClientEmail'

/**
 * Le manda AL CLIENTE recién registrado el link de su recorrido (`/v/<token>`).
 *
 * Por qué existe: mientras la plantilla de WhatsApp no esté aprobada, la única
 * otra entrega del link es la pantalla de gracias — si la persona cierra el
 * popup, el link se pierde. Este email es la copia durable.
 *
 * Best-effort: NUNCA lanza. El lead y el token ya están guardados cuando corre.
 */
export async function sendRecorridoLinkToClient(input: {
  to: string
  clientName: string
  propertyLabel: string
  accessUrl: string
  /** `false` si la propiedad se quedó sin recorrido: el texto se adapta solo. */
  hasRecorrido?: boolean
}): Promise<void> {
  try {
    if (!input.to) return
    const subject =
      input.hasRecorrido === false
        ? `${input.propertyLabel}, en detalle`
        : `Tu recorrido por ${input.propertyLabel}`
    const testCtx = await applyTestMode(input.to, subject)
    const html = await renderEmail(
      RecorridoLinkClientEmail({
        clientName: input.clientName,
        propertyLabel: input.propertyLabel,
        accessUrl: input.accessUrl,
        hasRecorrido: input.hasRecorrido,
        testMode: testCtx.testModeOn,
        originalRecipients: testCtx.originalTo,
      }) as never
    )

    await sendEmail({
      notificationType: 'recorrido_link_client',
      to: input.to,
      subject,
      html,
      // Sin entityId no hay idempotencia por entidad: cada registro genera su
      // propio token, así que un reenvío legítimo no debe quedar suprimido.
      idempotent: false,
    })
  } catch (err) {
    console.warn('[recorrido-link-client] no se pudo enviar (continuando):', err)
  }
}
