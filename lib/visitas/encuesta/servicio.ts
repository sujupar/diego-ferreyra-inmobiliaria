import 'server-only'
/**
 * Crear el link de la encuesta y decidir/mandar el WhatsApp (adenda §11.4). Lo llaman
 * POST /api/visits/[id]/estado (al marcar "Se realizó") y POST /api/visits/[id]/encuesta.
 * UNA sola llamada a Meta por pedido (techo 8 s): cabe en el límite de Netlify.
 *
 * Regla que no se rompe: un envío que YA salió no se pisa con un "omitida" (pasa al reabrir una
 * visita y volver a marcarla realizada: el link es el mismo y la persona ya lo tiene).
 */
import { randomBytes } from 'node:crypto'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import * as datos from './datos'
import { mandarPlantilla } from './whatsapp'
import { tokenDesdeBytes, vencimientoDesde, estaVencida } from './link'
import { decidirEnvioEncuesta, type DecisionEnvio } from './envio'
import { armarEnvioEncuesta } from './plantillas'
import { motivoLegibleDeMeta, TEXTO_MOTIVO_OMISION } from './estado-envio'
import { armarEncuestaParaFicha, type EncuestaParaFicha } from './ficha'
import type { EncuestaConVisita, EncuestaFila, MotivoOmision } from './tipos'

export class ReenvioNoPermitido extends Error {
  constructor(public readonly motivo: MotivoOmision) {
    super(`No se puede reenviar: ${TEXTO_MOTIVO_OMISION[motivo]}`)
    this.name = 'ReenvioNoPermitido'
  }
}

function baseDeLaApp(): string {
  // `||`: una variable seteada pero VACÍA (vista previa mal configurada) no deja un link relativo.
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://inmodf.com.ar').replace(/\/+$/, '')
}

function plantillaConfigurada(): string | null {
  return process.env.WHATSAPP_TEMPLATE_ENCUESTA_VISITA?.trim() || null
}

/** "14/10" en hora argentina: es la fecha que la persona recuerda. */
function fechaCorta(iso: string): string {
  const [, mes, dia] = fechaEnArgentina(new Date(iso)).split('-')
  return `${dia}/${mes}`
}

/** Si no se puede leer el regalo, cuenta como "sin regalo": con "solo con regalo" eso FRENA el envío (fail-closed). */
async function tieneRegalo(propertyId: string): Promise<boolean> {
  try {
    return (await datos.leerRegalo(propertyId)) !== null
  } catch (e) {
    console.error('[encuesta] no se pudo leer el regalo; se trata como "sin regalo"', propertyId, e)
    return false
  }
}

export async function asegurarLinkDeEncuesta(visitaId: string, actorId: string | null, ahora: Date): Promise<EncuestaFila> {
  const existente = await datos.leerEncuestaDeVisita(visitaId)
  if (existente) return existente
  let ultimo: unknown = null
  // Un choque de token (128 bits: prácticamente imposible) haría fallar el INSERT por UNIQUE: otro intento con otro token.
  for (let intento = 0; intento < 2; intento++) {
    try {
      return await datos.asegurarEncuesta({ visitId: visitaId, token: tokenDesdeBytes(randomBytes(16)), expiresAt: vencimientoDesde(ahora), actorId })
    } catch (e) {
      ultimo = e
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error('no se pudo crear la encuesta')
}

async function decidir(ec: EncuestaConVisita, reenvio: boolean, ahora: Date): Promise<{ decision: DecisionEnvio; plantilla: string | null }> {
  const { encuesta, visita } = ec
  const plantilla = plantillaConfigurada()
  const decision = decidirEnvioEncuesta({
    ajustes: await datos.leerAjustesEncuesta(),
    tieneRegalo: await tieneRegalo(visita.property_id),
    telefono: visita.client_phone,
    plantilla,
    yaEnviada: encuesta.send_status === 'enviada',
    reenvio,
    completada: encuesta.completed_at !== null,
    vencida: estaVencida(encuesta.expires_at, ahora),
  }, normalizeWhatsappPhone)
  return { decision, plantilla }
}

export async function prepararYEnviarEncuesta(
  visitaId: string,
  o: { reenvio: boolean; actorId: string | null; ahora: Date },
): Promise<EncuestaParaFicha> {
  const fila = await asegurarLinkDeEncuesta(visitaId, o.actorId, o.ahora)
  const ec = await datos.leerEncuestaConVisita({ id: fila.id })
  if (!ec) throw new Error('la encuesta recién creada no se pudo leer')
  const { encuesta, visita } = ec
  const { decision, plantilla } = await decidir(ec, o.reenvio, o.ahora)

  if (!decision.enviar) {
    if (o.reenvio) throw new ReenvioNoPermitido(decision.motivo)
    if (encuesta.send_status !== 'enviada' && decision.motivo !== 'ya_enviada') {
      await datos.registrarEnvio(encuesta.id, { send_status: 'omitida', send_skip_reason: decision.motivo, send_error: null })
    }
  } else {
    const envio = armarEnvioEncuesta(plantilla, {
      nombre: visita.client_name, direccion: visita.propiedad?.address ?? null,
      fecha: fechaCorta(visita.scheduled_at), token: encuesta.token,
    })
    if (!envio) {
      await datos.registrarEnvio(encuesta.id, { send_status: 'omitida', send_skip_reason: 'plantilla_desconocida', send_error: null })
    } else {
      const r = await mandarPlantilla(envio, { telefono: decision.telefono, leadId: visita.lead_id, propertyId: visita.property_id, sentBy: o.actorId })
      if (r.ok && r.modoPrueba) {
        await datos.registrarEnvio(encuesta.id, { send_status: 'omitida', send_skip_reason: 'modo_prueba_whatsapp', send_error: null })
      } else if (r.ok) {
        await datos.registrarEnvio(encuesta.id, {
          send_status: 'enviada', send_skip_reason: null, send_error: null,
          sent_at: o.ahora.toISOString(), sent_to: decision.telefono, wa_message_id: r.messageId,
        })
      } else {
        await datos.registrarEnvio(encuesta.id, { send_status: 'fallida', send_skip_reason: null, send_error: motivoLegibleDeMeta(r.codigo, r.error) })
      }
    }
  }
  const ficha = await encuestaParaFicha(visitaId, o.ahora)
  if (!ficha) throw new Error('la encuesta no se pudo releer')
  return ficha
}

export async function encuestaParaFicha(visitaId: string, ahora: Date): Promise<EncuestaParaFicha | null> {
  const ec = await datos.leerEncuestaConVisita({ visitId: visitaId })
  if (!ec) return null
  const wa = ec.encuesta.wa_message_id ? await datos.estadoDelMensaje(ec.encuesta.wa_message_id) : null
  const { decision } = await decidir(ec, true, ahora)
  return armarEncuestaParaFicha(ec.encuesta, { wa, puedeReenviar: decision.enviar, ahora, base: baseDeLaApp() })
}

/** Para las rutas de la ficha: si la encuesta no se puede leer, la ficha se muestra igual (sin la tarjeta). */
export async function encuestaParaFichaSegura(visitaId: string, ahora: Date): Promise<EncuestaParaFicha | null> {
  try {
    return await encuestaParaFicha(visitaId, ahora)
  } catch (e) {
    console.error('[encuesta] no se pudo leer la encuesta de la ficha', visitaId, e)
    return null
  }
}
