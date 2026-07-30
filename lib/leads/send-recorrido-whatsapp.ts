/**
 * Le manda al cliente recién registrado el link de su recorrido por WhatsApp,
 * con una plantilla de UTILIDAD (mejor entregabilidad que una de marketing).
 *
 * Best-effort en todo: si no hay plantilla configurada, si no hay teléfono o si
 * Meta falla, el flujo sigue — el link igual se muestra en la pantalla de
 * gracias y, si el lead dejó email, se envía por mail
 * (`lib/email/notifications/recorrido-link-client.ts`).
 *
 * Devuelve `true` SOLO si el mensaje se envió de verdad (Meta lo aceptó, sin
 * `skipped`). `skipped:true` significa modo prueba o sin credenciales — NO se
 * mandó nada, así que cuenta como `false` para no prometerle al usuario un
 * WhatsApp que no llegó.
 */
import { sendWhatsappTemplate, normalizePhone } from '@/lib/integrations/whatsapp/meta-cloud'

export async function sendRecorridoWhatsapp(input: {
  phone: string | null
  clientName: string
  propertyLabel: string
  token: string
  /** Lead y propiedad de esta operación — para que el chat del Inbox sepa a qué pertenece cada mensaje. */
  leadId?: string | null
  propertyId?: string | null
}): Promise<boolean> {
  const template = process.env.WHATSAPP_TEMPLATE_RECORRIDO
  if (!template) return false
  const to = normalizePhone(input.phone)
  if (!to) return false
  try {
    const result = await sendWhatsappTemplate({
      to,
      templateName: template,
      languageCode: process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_AR',
      // La plantilla `recorrido_acceso_util` espera 3 variables:
      //   {{1}} nombre de pila · {{2}} propiedad · {{3}} nº de solicitud.
      // El nº de solicitud es el propio token: además de identificar la operación,
      // es el rasgo que hace que Meta clasifique la plantilla como UTILIDAD y no
      // como marketing (mismo patrón que `consulta_portal_util`, ya aprobada).
      bodyParams: [input.clientName.split(' ')[0], input.propertyLabel, input.token],
      urlButtonParam: input.token,
      // 3s (el default global es 8s): acá el visitante está esperando la respuesta
      // de `POST /api/leads`, que además hace el email del recorrido y Meta CAPI.
      timeoutMs: 3000,
      leadId: input.leadId,
      propertyId: input.propertyId,
    })
    return result.ok && !result.skipped
  } catch (err) {
    console.warn('[recorrido-wa] no se pudo enviar (continuando):', err)
    return false
  }
}
