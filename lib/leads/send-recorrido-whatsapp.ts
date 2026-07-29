/**
 * Le manda al cliente recién registrado el link de su recorrido por WhatsApp,
 * con una plantilla de UTILIDAD (mejor entregabilidad que una de marketing).
 *
 * Best-effort en todo: si no hay plantilla configurada, si no hay teléfono o si
 * Meta falla, el flujo sigue — el link igual se muestra en la pantalla de
 * gracias y viaja por email.
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
      bodyParams: [input.clientName.split(' ')[0], input.propertyLabel],
      urlButtonParam: input.token,
    })
    return result.ok && !result.skipped
  } catch (err) {
    console.warn('[recorrido-wa] no se pudo enviar (continuando):', err)
    return false
  }
}
