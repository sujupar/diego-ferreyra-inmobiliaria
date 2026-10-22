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
import { decidirRespaldo, type MotivoSinRespaldo } from './respaldo'
import { enmascararTelefono } from './contacto'
import type { EncuestaConVisita, EncuestaFila, MotivoOmision } from './tipos'

export class ReenvioNoPermitido extends Error {
  constructor(public readonly motivo: MotivoOmision) {
    super(`No se puede reenviar: ${TEXTO_MOTIVO_OMISION[motivo]}`)
    this.name = 'ReenvioNoPermitido'
  }
}

/** Ronda 1 de revisión: otro envío de ESTA MISMA encuesta está en curso (candado tomado). */
export class EnvioEnCurso extends Error {
  constructor() {
    super('Ya se está enviando, esperá unos segundos')
    this.name = 'EnvioEnCurso'
  }
}

/** Más que el techo de 8 s de `mandarPlantilla`: cubre la llamada a Meta completa con margen. */
const DURACION_CANDADO_SEGUNDOS = 30

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
    // Un envío que YA SALIÓ (enviada) o que YA FALLÓ (fallida, con su motivo guardado) no se pisa
    // con un "omitida": perdería el rastro de lo que pasó de verdad.
    if (encuesta.send_status !== 'enviada' && encuesta.send_status !== 'fallida' && decision.motivo !== 'ya_enviada') {
      await datos.registrarEnvio(encuesta.id, { send_status: 'omitida', send_skip_reason: decision.motivo, send_error: null })
    }
  } else {
    // Candado de corta duración (ronda 1 de revisión): hasta acá la decisión es la misma para
    // un doble toque de "Reenviar" o para dos personas reenviando casi juntas — nada escrito
    // todavía las distingue. Quien no consigue el candado no manda nada.
    const tieneCandado = await datos.reservarEnvio(encuesta.id, DURACION_CANDADO_SEGUNDOS)
    if (!tieneCandado) {
      if (o.reenvio) throw new EnvioEnCurso()
      // Envío automático en carrera con otro (otra pestaña, un reenvío simultáneo): la otra
      // llamada ya se está encargando, así que acá no hay nada más para hacer.
    } else {
      try {
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
            try {
              await datos.registrarEnvio(encuesta.id, {
                send_status: 'enviada', send_skip_reason: null, send_error: null,
                sent_at: o.ahora.toISOString(), sent_to: decision.telefono, wa_message_id: r.messageId,
              })
            } catch (e) {
              // Meta YA mandó el mensaje: si esto no queda guardado, un reintento podría volver a
              // mandarlo sin saber que ya salió. El rastro completo (a quién, con qué mensaje) va
              // en el log y en el mensaje del error para poder arreglarlo a mano.
              const rastro = `Meta mandó el mensaje (wa_message_id=${r.messageId ?? 'desconocido'}, a ${enmascararTelefono(decision.telefono) ?? '(teléfono no disponible)'}) pero no se pudo guardar el envío`
              console.error(`[encuesta] ${rastro}`, e)
              throw new Error(`${rastro}: ${e instanceof Error ? e.message : String(e)}`)
            }
          } else {
            await datos.registrarEnvio(encuesta.id, { send_status: 'fallida', send_skip_reason: null, send_error: motivoLegibleDeMeta(r.codigo, r.error) })
          }
        }
      } finally {
        await datos.liberarEnvio(encuesta.id)
      }
    }
  }
  const ficha = await encuestaParaFicha(visitaId, o.ahora)
  if (!ficha) throw new Error('la encuesta no se pudo releer')
  return ficha
}

export type ResultadoRespaldo = MotivoSinRespaldo | 'mandado' | 'fallido' | 'en_curso' | 'error'

/**
 * Lo llama el webhook de WhatsApp con cada estado de entrega. Si Meta descartó la invitación de
 * marketing por su freno (ver `respaldo.ts`), manda en el momento la de utilidad. NUNCA lanza: el
 * webhook tiene que responderle 200 a Meta pase lo que pase (si no, Meta reintenta y puede
 * deshabilitarlo). UNA llamada a Meta como mucho, con techo de 8 s.
 */
export async function mandarRespaldoSiCorresponde(
  s: { waMessageId: string; estado: string; codigoError: string | null },
  ahora: Date,
): Promise<ResultadoRespaldo> {
  // Por el webhook pasan cientos de "enviado/entregado/leído": esos no tocan la base.
  if (s.estado !== 'failed') return 'no_fallo'
  try {
    const plantilla = await datos.plantillaDelMensaje(s.waMessageId)
    const ec = await datos.leerEncuestaPorMensaje(s.waMessageId)
    const decision = decidirRespaldo({
      estado: s.estado, codigoError: s.codigoError, plantillaDelMensaje: plantilla, waMessageIdFallido: s.waMessageId,
      encuesta: ec ? {
        waMessageIdActual: ec.encuesta.wa_message_id, completada: ec.encuesta.completed_at !== null,
        vencida: estaVencida(ec.encuesta.expires_at, ahora),
      } : null,
    })
    if (!decision.mandar || !ec) return decision.mandar ? 'sin_encuesta' : decision.motivo
    const { encuesta, visita } = ec
    const telefono = encuesta.sent_to
    if (!telefono) return 'sin_encuesta'
    if (!(await datos.reservarEnvio(encuesta.id, DURACION_CANDADO_SEGUNDOS))) return 'en_curso'
    try {
      const envio = armarEnvioEncuesta(decision.plantilla, {
        nombre: visita.client_name, direccion: visita.propiedad?.address ?? null,
        fecha: fechaCorta(visita.scheduled_at), token: encuesta.token,
      })
      if (!envio) return 'plantilla_sin_respaldo'
      const r = await mandarPlantilla(envio, { telefono, leadId: visita.lead_id, propertyId: visita.property_id, sentBy: null })
      if (r.ok && !r.modoPrueba) {
        await datos.registrarEnvio(encuesta.id, {
          send_status: 'enviada', send_skip_reason: null, send_error: null,
          sent_at: ahora.toISOString(), sent_to: telefono, wa_message_id: r.messageId,
        })
        console.log(`[encuesta] Meta frenó la invitación de marketing (${s.codigoError}); salió el respaldo ${decision.plantilla} (encuesta ${encuesta.id})`)
        return 'mandado'
      }
      if (r.ok) return 'fallido'
      await datos.registrarEnvio(encuesta.id, {
        send_status: 'fallida', send_skip_reason: null,
        send_error: `Meta frenó la invitación de marketing y el respaldo también falló: ${motivoLegibleDeMeta(r.codigo, r.error)}`,
      })
      return 'fallido'
    } finally {
      await datos.liberarEnvio(encuesta.id)
    }
  } catch (e) {
    console.error('[encuesta] no se pudo evaluar o mandar el respaldo de la invitación', s.waMessageId, e)
    return 'error'
  }
}

export async function encuestaParaFicha(visitaId: string, ahora: Date): Promise<EncuestaParaFicha | null> {
  const ec = await datos.leerEncuestaConVisita({ visitId: visitaId })
  if (!ec) return null
  const wa = ec.encuesta.wa_message_id ? await datos.estadoDelMensaje(ec.encuesta.wa_message_id) : null
  const { decision } = await decidir(ec, true, ahora)
  // Visita reabierta (adenda, ronda 1 de revisión): ya no corresponde ofrecer el link ni
  // reenviar, aunque la decisión "pura" (que no sabe de la visita) diga que sí se podría.
  const visitaCompletada = ec.visita.status === 'completed'
  return armarEncuestaParaFicha(ec.encuesta, {
    wa, puedeReenviar: visitaCompletada && decision.enviar, linkDisponible: visitaCompletada, ahora, base: baseDeLaApp(),
  })
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
