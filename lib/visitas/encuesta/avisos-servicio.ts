import 'server-only'
/**
 * Procesa los avisos de UNA encuesta terminada (y el barrido de las pendientes). Cada canal:
 * reserva atómica (pendiente → enviando), envío, cierre. La reserva es lo que evita que la pantalla
 * de gracias (con dos pestañas abiertas) y el cron manden dos veces lo mismo.
 * Un `cerrarAviso` que falla deja el canal "enviando": se detecta con la consulta del CLAUDE.md.
 */
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { notificarEncuestaRespondida } from '@/lib/email/notifications/visit-survey-answered'
import { enviarRegaloPorEmail } from '@/lib/email/notifications/visit-survey-gift'
import * as datos from './datos'
import { mandarPlantilla } from './whatsapp'
import { armarEnvioRegalo, nombreDePila } from './plantillas'
import { ocultarEmailsEnTexto } from './contacto'
import { decidirRegaloPorWhatsapp } from './envio'
import { motivoLegibleDeMeta } from './estado-envio'
import { respuestasParaFicha } from './ficha'
import { nombreDeDescarga, SEGUNDOS_URL_WHATSAPP } from './regalo'
import { urlDescargaDelRegalo } from './publica'
import { canalesPendientes, canalesSegunEstadoVisita, puedeEmpezar, cierreDeEmail, cierreTrasFallo, rangoDelBarrido, MAX_INTENTOS_AVISO, LIMITE_INICIO_MS } from './avisos'
import type { CanalAviso, EncuestaConVisita } from './tipos'

export type ResultadoCanal = 'enviado' | 'fallido' | 'no_corresponde' | 'pendiente' | 'ocupado' | 'sin_tiempo'
export interface ContextoAvisos { inicio: number; ahora: Date; reloj?: () => number }

interface Cierre {
  estado: 'enviado' | 'fallido' | 'no_corresponde' | 'pendiente'
  error?: string | null
  waMessageId?: string | null
}

function baseDeLaApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://inmodf.com.ar').replace(/\/+$/, '')
}

async function ejecutar(canal: CanalAviso, ec: EncuestaConVisita): Promise<Cierre> {
  const { encuesta: e, visita: v } = ec
  const direccion = v.propiedad?.address?.trim() || 'la propiedad'
  switch (canal) {
    case 'equipo': {
      const respuestas = respuestasParaFicha(e)
      if (!respuestas) return { estado: 'no_corresponde', error: 'la encuesta no tiene respuestas' }
      const r = await notificarEncuestaRespondida({ visitaId: v.id, asesorId: v.advisor_id, direccion, persona: v.client_name, scheduledAt: v.scheduled_at, respuestas })
      if (r === null) return { estado: 'no_corresponde', error: 'no hay nadie activo para avisarle' }
      const estado = cierreDeEmail(r)
      // Un error de Resend puede traer el email del destinatario (p. ej. "send failed to x@y.com"):
      // no queda ni en notice_error (texto libre, sin RLS) ni en el log de Netlify.
      return estado === 'enviado' ? { estado } : { estado, error: ocultarEmailsEnTexto(r.errors[0] ?? 'el email no salió') }
    }
    case 'regalo_whatsapp': {
      // Un error de la base acá LANZA: el canal vuelve a pendiente y se reintenta (no se pierde el regalo).
      const regalo = await datos.leerRegalo(v.property_id)
      const plantilla = process.env.WHATSAPP_TEMPLATE_REGALO_VISITA?.trim() || null
      const decision = decidirRegaloPorWhatsapp({
        ajustes: await datos.leerAjustesEncuesta(), tieneRegalo: regalo !== null,
        telefono: e.contact_phone ?? v.client_phone, plantilla, yaEnviado: e.gift_wa_message_id !== null,
      }, normalizeWhatsappPhone)
      const envio = armarEnvioRegalo(plantilla, { nombre: v.client_name, direccion })
      if (!decision.enviar || !regalo || !envio) return { estado: 'no_corresponde' }
      const link = await datos.urlFirmada(regalo.archivoPath, SEGUNDOS_URL_WHATSAPP)
      if (!link) throw new Error('no se pudo firmar el PDF para WhatsApp')
      const r = await mandarPlantilla(envio, {
        telefono: decision.telefono, leadId: v.lead_id, propertyId: v.property_id, sentBy: null,
        documento: { link, nombre: nombreDeDescarga(regalo.archivoNombre) },
      })
      if (r.ok && r.modoPrueba) return { estado: 'no_corresponde', error: 'WhatsApp en modo prueba' }
      if (r.ok) return { estado: 'enviado', waMessageId: r.messageId }
      // Un rechazo de Meta no se arregla reintentando: queda fallido, con el motivo legible.
      return { estado: 'fallido', error: motivoLegibleDeMeta(r.codigo, r.error) }
    }
    case 'regalo_email': {
      if (!e.contact_email) return { estado: 'no_corresponde' }
      const regalo = await datos.leerRegalo(v.property_id)
      if (!regalo) return { estado: 'no_corresponde' }
      const r = await enviarRegaloPorEmail({
        encuestaId: e.id, email: e.contact_email, nombre: nombreDePila(v.client_name, ''), direccion,
        titulo: regalo.titulo, urlDescarga: `${baseDeLaApp()}${urlDescargaDelRegalo(e.token)}`,
      })
      const estado = cierreDeEmail(r)
      return estado === 'enviado' ? { estado } : { estado, error: ocultarEmailsEnTexto(r.errors[0] ?? 'el email no salió') }
    }
  }
}

export async function procesarAvisosDeEncuesta(encuestaId: string, ctx: ContextoAvisos): Promise<Partial<Record<CanalAviso, ResultadoCanal>>> {
  const reloj = ctx.reloj ?? Date.now
  const ec = await datos.leerEncuestaConVisita({ id: encuestaId })
  if (!ec) return {}
  const id = ec.encuesta.id
  let intentos = ec.encuesta.notice_attempts
  const resultado: Partial<Record<CanalAviso, ResultadoCanal>> = {}
  const canales = canalesSegunEstadoVisita(canalesPendientes(ec.encuesta), ec.visita.status)
  for (const canal of canales) {
    if (!puedeEmpezar(canal, reloj() - ctx.inicio)) { resultado[canal] = 'sin_tiempo'; continue }
    if (!(await datos.reservarAviso(id, canal))) { resultado[canal] = 'ocupado'; continue }
    let cierre: Cierre
    try {
      cierre = await ejecutar(canal, ec)
    } catch (err) {
      cierre = { estado: 'pendiente', error: err instanceof Error ? err.message : String(err) }
    }
    if (cierre.estado === 'pendiente') {
      const t = cierreTrasFallo(intentos)
      intentos = t.intentos
      console.error('[encuesta/avisos] el canal no salió', canal, id, cierre.error)
      await datos.cerrarAviso(id, canal, t.estado, { error: cierre.error ?? 'falló sin detalle', intentos })
      resultado[canal] = t.estado
      continue
    }
    if (cierre.estado === 'fallido') console.error('[encuesta/avisos] el canal falló y no se reintenta', canal, id, cierre.error)
    await datos.cerrarAviso(id, canal, cierre.estado, {
      ...(cierre.error ? { error: cierre.error } : {}),
      ...(cierre.waMessageId !== undefined ? { waMessageId: cierre.waMessageId } : {}),
    })
    resultado[canal] = cierre.estado
  }
  return resultado
}

export interface ResumenBarrido { revisadas: number; canalesEnviados: number; sinTiempo: number }

export async function barrerAvisosPendientes(ctx: ContextoAvisos): Promise<ResumenBarrido> {
  const reloj = ctx.reloj ?? Date.now
  await datos.liberarAvisosTrabados(ctx.ahora)
  const ids = await datos.encuestasConAvisosPendientes(rangoDelBarrido(ctx.ahora), MAX_INTENTOS_AVISO)
  const r: ResumenBarrido = { revisadas: ids.length, canalesEnviados: 0, sinTiempo: 0 }
  for (const id of ids) {
    if (reloj() - ctx.inicio >= LIMITE_INICIO_MS.regalo_email) { r.sinTiempo++; continue }
    const res = await procesarAvisosDeEncuesta(id, ctx)
    r.canalesEnviados += Object.values(res).filter(x => x === 'enviado').length
  }
  return r
}
