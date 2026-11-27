import 'server-only'
/**
 * Respaldo tardío del video de bienvenida (design.md D3b), del lado del servidor.
 *
 * Lo llama el webhook de WhatsApp con cada estado `failed`, en la misma rama que el respaldo de
 * la encuesta. Si Meta frenó por marketing (131049/131050) el mensaje con video que había
 * aceptado, manda `tasacion_llamada_v1` al mismo teléfono: nadie se queda sin el primer mensaje.
 *
 * NUNCA lanza (el webhook tiene que responderle 200 a Meta pase lo que pase) y hace como mucho
 * UNA llamada a Meta con techo de 8 s. "Una sola vez" lo garantiza la RPC `tomar_respaldo`.
 */
import { createClient } from '@supabase/supabase-js'
import { CODIGOS_FRENO_MARKETING, decidirRespaldoBienvenida } from './respaldo'
import { tomarRespaldo } from './enlaces'
import { PLANTILLA_SIN_VIDEO } from './plantillas'

export type ResultadoRespaldoBienvenida = 'no_corresponde' | 'ya_mandado' | 'encolado' | 'mandado' | 'fallido' | 'error'

/** `tasacion_llamada_v1` empieza "Hola {{1}}, ¡recibimos…": sin nombre queda "Hola qué tal, ¡recibimos…". */
const SALUDO_SIN_NOMBRE = 'qué tal'

export async function mandarRespaldoBienvenidaSiCorresponde(s: {
  waMessageId: string
  estado: string
  codigoError: string | null
}): Promise<ResultadoRespaldoBienvenida> {
  // Por el webhook pasan cientos de estados: solo un freno de marketing toca la base (auditoría
  // de código, hallazgo 4: cualquier otro `failed` no tiene nada que ver con este respaldo).
  if (s.estado !== 'failed' || !s.codigoError || !CODIGOS_FRENO_MARKETING.includes(s.codigoError)) return 'no_corresponde'
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data, error } = await sb
      .from('whatsapp_messages')
      .select('template_name, phone_e164')
      .eq('wa_message_id', s.waMessageId)
      .limit(1)
      .maybeSingle()
    if (error) {
      console.warn('[video-bienvenida] no se pudo leer el mensaje fallido', s.waMessageId, error.message)
      return 'error'
    }
    const fila = data as { template_name?: unknown; phone_e164?: unknown } | null
    const plantilla = typeof fila?.template_name === 'string' ? fila.template_name : null
    if (!decidirRespaldoBienvenida({ estado: s.estado, codigoError: s.codigoError, plantillaDelMensaje: plantilla })) {
      return 'no_corresponde'
    }
    const telefono = typeof fila?.phone_e164 === 'string' ? fila.phone_e164 : null
    if (!telefono) return 'no_corresponde'

    const tomado = await tomarRespaldo(s.waMessageId, telefono)
    if (!tomado) return 'ya_mandado'
    // Lo normal: la RPC volvió a encolar el trabajo de WhatsApp sin video, que sale con los
    // reintentos de la cola (auditoría de código, hallazgo 2). El webhook no llama a Meta.
    if (tomado.encolado) {
      console.log(`[video-bienvenida] Meta frenó ${plantilla} (${s.codigoError}); se encoló ${PLANTILLA_SIN_VIDEO} (contacto ${tomado.contactId})`)
      return 'encolado'
    }
    // Sin trabajo que reencolar: se manda en el momento, como último recurso.

    const { sendWhatsappTemplate } = await import('@/lib/integrations/whatsapp/core')
    const r = await sendWhatsappTemplate({
      to: telefono,
      templateName: PLANTILLA_SIN_VIDEO,
      languageCode: process.env.WHATSAPP_TEMPLATE_TASACION_LANG ?? 'es_AR',
      bodyParams: [tomado.nombre?.trim() || SALUDO_SIN_NOMBRE],
      origen: 'landing',
      aiGenerated: true,
      timeoutMs: 8000,
    })
    if (r.ok && !r.skipped) {
      console.log(`[video-bienvenida] Meta frenó ${plantilla} (${s.codigoError}); salió ${PLANTILLA_SIN_VIDEO} (contacto ${tomado.contactId})`)
      return 'mandado'
    }
    console.warn(`[video-bienvenida] el respaldo ${PLANTILLA_SIN_VIDEO} no salió (contacto ${tomado.contactId}):`, r.error ?? 'modo prueba')
    return 'fallido'
  } catch (e) {
    console.error('[video-bienvenida] no se pudo evaluar o mandar el respaldo', s.waMessageId, e)
    return 'error'
  }
}
