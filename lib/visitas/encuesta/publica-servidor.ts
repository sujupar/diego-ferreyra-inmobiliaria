import 'server-only'
/**
 * Lo que necesita la página pública, leído en el servidor. NO marca "abierta" ni gasta escrituras:
 * el previsualizador de links de WhatsApp pide esta página sin correr JavaScript, y si el render del
 * servidor marcara la apertura, toda encuesta enviada figuraría "Abierta" (Review Focus 1).
 */
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import * as datos from './datos'
import { esTokenEncuesta } from './link'
import { armarEncuestaPublica, type ResultadoEncuestaPublica } from './publica'
import { decidirRegaloPorWhatsapp } from './envio'
import { SEGUNDOS_URL_PORTADA } from './regalo'
import type { RegaloDeLaPropiedad } from './tipos'

async function regaloSeguro(propertyId: string): Promise<RegaloDeLaPropiedad | null> {
  try {
    return await datos.leerRegalo(propertyId)
  } catch (e) {
    console.error('[encuesta] no se pudo leer el regalo para la página; sale sin regalo', propertyId, e)
    return null
  }
}

export async function leerEncuestaPublica(token: string, ahora: Date): Promise<ResultadoEncuestaPublica> {
  if (!esTokenEncuesta(token)) return { tipo: 'no_disponible' }
  const ec = await datos.leerEncuestaConVisita({ token })
  if (!ec || ec.visita.status !== 'completed') return { tipo: 'no_disponible' }
  const r = await regaloSeguro(ec.visita.property_id)
  let regalo: { titulo: string; portada: string | null } | null = null
  let prometeWhatsapp = false
  if (r) {
    regalo = { titulo: r.titulo, portada: r.portadaPath ? await datos.urlFirmada(r.portadaPath, SEGUNDOS_URL_PORTADA) : null }
    prometeWhatsapp = decidirRegaloPorWhatsapp({
      ajustes: await datos.leerAjustesEncuesta(), tieneRegalo: true,
      telefono: ec.encuesta.contact_phone ?? ec.visita.client_phone,
      plantilla: process.env.WHATSAPP_TEMPLATE_REGALO_VISITA?.trim() || null, yaEnviado: false,
    }, normalizeWhatsappPhone).enviar
  }
  return armarEncuestaPublica(ec, { regalo, regaloPorWhatsapp: prometeWhatsapp, ahora })
}
