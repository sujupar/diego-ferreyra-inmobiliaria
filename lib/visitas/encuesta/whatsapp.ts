import 'server-only'
/**
 * Manda una plantilla de la encuesta (la del link o la del regalo) por WhatsApp. Una sola llamada
 * a Meta con techo de 8 s (spec §7 riesgo 11). NUNCA lanza: `sendWhatsappTemplate` tampoco, y quien
 * llama decide qué escribir en la encuesta según el resultado.
 *
 * Plantilla y encabezado se chequean JUNTOS acá, antes de llamar a Meta: una plantilla con
 * encabezado de documento sin el PDF (o al revés) la rechaza Meta ENTERA, y ese rechazo no le
 * avisa a nadie (incidente 2026-09-17).
 */
import { sendWhatsappTemplate } from '@/lib/integrations/whatsapp/meta-cloud'
import { IDIOMA_PLANTILLAS, type EnvioArmado } from './plantillas'

export const TIMEOUT_WHATSAPP_MS = 8_000

export type ResultadoWhatsapp =
  | { ok: true; modoPrueba: boolean; messageId: string | null }
  | { ok: false; error: string; codigo: number | null }

export async function mandarPlantilla(
  envio: EnvioArmado,
  d: { telefono: string; leadId: string | null; propertyId: string | null; sentBy: string | null; documento?: { link: string; nombre: string } },
): Promise<ResultadoWhatsapp> {
  if (envio.necesitaDocumento && !d.documento) return { ok: false, error: 'La plantilla necesita el PDF y no vino', codigo: null }
  if (!envio.necesitaDocumento && d.documento) return { ok: false, error: 'La plantilla no lleva documento', codigo: null }
  const r = await sendWhatsappTemplate({
    origen: 'encuesta_visita',
    to: d.telefono,
    templateName: envio.templateName,
    languageCode: IDIOMA_PLANTILLAS,
    bodyParams: envio.bodyParams,
    ...(envio.urlButtonParam ? { urlButtonParam: envio.urlButtonParam } : {}),
    ...(d.documento ? { headerMedia: { type: 'document' as const, link: d.documento.link, filename: d.documento.nombre } } : {}),
    timeoutMs: TIMEOUT_WHATSAPP_MS,
    leadId: d.leadId,
    propertyId: d.propertyId,
    sentBy: d.sentBy,
    bodyText: envio.bodyText,
  })
  if (!r.ok) return { ok: false, error: r.error ?? 'error desconocido', codigo: r.errorCode ?? null }
  return { ok: true, modoPrueba: r.skipped, messageId: r.messageId ?? null }
}
