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
import { accessUrl } from '@/lib/leads/access-token'

/**
 * Qué mandar en `{{3}}` según la plantilla configurada.
 *
 * Las plantillas hasta la v3 cierran con "Solicitud <token> · Diego Ferreyra
 * Inmobiliaria": el token pelado. La v4 lo reemplaza por el LINK completo
 * ("Podés verlo acá: https://…/v/<token>"), por dos motivos que salieron de
 * probarla en un teléfono real: el número suelto no le decía nada al cliente, y
 * en WhatsApp de computadora el BOTÓN no abre nada al hacerle clic — un link de
 * texto sí.
 *
 * Se decide por el NOMBRE de la plantilla y no por una env var aparte para que
 * no se puedan desincronizar: cambiar `WHATSAPP_TEMPLATE_RECORRIDO` a la v4
 * alcanza, y mientras tanto la v3 sigue recibiendo lo que espera.
 */
function tercerParametro(templateName: string, token: string): string {
  return /_v4$/.test(templateName) ? accessUrl(token) : token
}

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
      // Las plantillas del recorrido esperan 3 variables:
      //   {{1}} nombre de pila · {{2}} propiedad · {{3}} referencia de la operación.
      // Esa tercera es la que hace que Meta clasifique la plantilla como UTILIDAD
      // y no como marketing (mismo patrón que `consulta_portal_util`, ya
      // aprobada): hasta la v3 era el token pelado, en la v4 es el link completo
      // — ver `tercerParametro`.
      bodyParams: [input.clientName.split(' ')[0], input.propertyLabel, tercerParametro(template, input.token)],
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
