import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { resolveFunnelMapping, type FunnelKind } from '@/lib/funnel/create-funnel-lead'
import type { TipoDeTrabajo } from '@/lib/funnel/jobs-logic'

/**
 * Los cinco avisos de un envío del embudo, ya fuera del camino crítico.
 *
 * Cada uno TIRA cuando falla: quien decide si se reintenta y con qué espera es
 * el worker (`side-effects-worker.ts`), no el aviso. Eso es lo que cambió
 * respecto del código viejo, donde cada uno se tragaba su propio error con un
 * `console.warn` y la falla se perdía para siempre.
 *
 * `'skipped'` es un resultado legítimo y distinto de `'done'`: quiere decir "no
 * correspondía hacer nada" (no hay sesión anónima que vincular, no hay
 * `event_id` del Píxel, Mailchimp está apagado). Se distingue para que mirar la
 * cola diga la verdad sobre qué pasó con cada lead.
 */
export type ResultadoTrabajo = 'done' | 'skipped'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function texto(payload: Record<string, unknown>, clave: string): string | null {
  const v = payload[clave]
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function requerido(payload: Record<string, unknown>, clave: string): string {
  const v = texto(payload, clave)
  if (!v) throw new Error(`falta "${clave}" en el payload del trabajo`)
  return v
}

/** Tarea para las coordinadoras: "entró un lead, completá los datos". */
async function tareaDeCoordinacion(p: Record<string, unknown>): Promise<ResultadoTrabajo> {
  const funnel = requerido(p, 'funnel') as FunnelKind
  const map = resolveFunnelMapping(funnel)
  const nombre = requerido(p, 'nombre')
  const { createTaskForRole } = await import('@/lib/supabase/tasks')
  await createTaskForRole('coordinador', {
    type: 'update_contact',
    title: `${map.placeholderLabel}: ${nombre}`,
    description: `Lead capturado desde la landing de ${funnel === 'clase' ? 'Clase Gratuita' : 'Tasación Directa'}. Completar datos.`,
    deal_id: requerido(p, 'dealId'),
    contact_id: requerido(p, 'contactId'),
  })
  return 'done'
}

/**
 * El email al equipo. Cada evento del embudo tiene su propia pieza y no se
 * mezclan: una SOLICITUD de tasación no es una tasación AGENDADA (ver CLAUDE.md).
 *
 * No usa `notifyWithEscalation`: acá la escalación a los admins la dispara el
 * worker recién cuando el trabajo agota sus reintentos. Escalar en el primer
 * intento —como hacía el código viejo, que no tenía segundo intento— mandaba un
 * "[URGENTE]" por cada hipo de Resend.
 *
 * ESTE ERA EL ÚNICO TRABAJO QUE NO PODÍA FALLAR, y eso desarmaba el motivo de
 * toda la cola: `sendEmail` NUNCA tira (devuelve `{ok,sent,failed,errors}`), así
 * que un vencimiento de Resend —el incidente del 2026-08-08 que originó este
 * rediseño— salía por acá como 'done'. El trabajo quedaba marcado como hecho,
 * no se reintentaba, no escalaba, y `SELECT status FROM funnel_lead_jobs` le
 * mentía al operador. Ahora se mira el resultado y se TIRA si algún destinatario
 * quedó sin su email; el worker decide si reintenta.
 *
 * Un envío parcial (2 destinatarios, 1 falla) también tira: la idempotencia de
 * `sendEmail` es POR DESTINATARIO (`alreadySentToRecipient`), así que el
 * reintento le manda solo al que faltaba, no dos veces al que ya recibió.
 */
async function avisoPorEmail(p: Record<string, unknown>): Promise<ResultadoTrabajo> {
  const funnel = requerido(p, 'funnel') as FunnelKind
  const dealId = requerido(p, 'dealId')
  const esClase = resolveFunnelMapping(funnel).notify === 'class'

  const resultado = esClase
    ? await (await import('@/lib/email/notifications/class-registration'))
        .notifyClassRegistration({ dealId })
    : await (await import('@/lib/email/notifications/appraisal-request'))
        .notifyAppraisalRequest({ dealId })

  // `null` = ni siquiera se llegó a intentar (el deal no se pudo leer, o no hay
  // un solo destinatario activo). NO es 'skipped': 'skipped' significa "no
  // correspondía hacer nada" y se decide por lo que trae el PAYLOAD (sin anonId
  // no hay stitching, sin event_id no hay conversión). Acá el trabajo existe
  // justamente porque entró un lead y hay que avisarle a una persona; que el
  // email no haya salido es un fallo, y como fallo tiene que reintentarse y,
  // si insiste, escalar.
  if (resultado === null) {
    throw new Error(
      `el aviso por email no se llegó a intentar para el deal ${dealId}: ` +
        'no se pudo leer el deal o no hay destinatarios activos',
    )
  }

  // Se mira `ok`, no solo `failed`: `sendEmail` devuelve `ok:false` con
  // `failed:0` cuando falta `RESEND_API_KEY` (no llega a intentar ningún envío).
  // Chequear únicamente `failed > 0` dejaría pasar como 'done' el caso en que no
  // se mandó absolutamente nada, que es justo el peor.
  if (!resultado.ok) {
    const detalle = resultado.errors.join(' | ') || 'sin detalle'
    throw new Error(
      `el aviso por email no salió completo (enviados: ${resultado.sent}, ` +
        `fallados: ${resultado.failed}): ${detalle}`,
    )
  }
  return 'done'
}

async function sincronizarMailchimp(p: Record<string, unknown>): Promise<ResultadoTrabajo> {
  const { mailchimpSyncEnabled } = await import('@/lib/integrations/mailchimp/client')
  if (!mailchimpSyncEnabled()) return 'skipped'
  const { syncDealToMailchimp } = await import('@/lib/integrations/mailchimp/sync-deal')
  await syncDealToMailchimp(requerido(p, 'dealId'))
  return 'done'
}

/** Vincula la sesión anónima de video con el contacto (back-fill del mapa de calor). */
async function vincularSesionAnonima(p: Record<string, unknown>): Promise<ResultadoTrabajo> {
  const anonId = texto(p, 'anonId')
  if (!anonId) return 'skipped'
  const { error } = await admin().rpc('link_anon_to_contact', {
    p_anon_id: anonId,
    p_contact_id: requerido(p, 'contactId'),
  })
  if (error) throw new Error(error.message)
  return 'done'
}

/**
 * Conversión server-side a Meta, con el MISMO `event_id` que mandó el Píxel
 * desde el navegador (Meta dedupea por ese id, así que reintentar es seguro).
 *
 * AMBOS embudos disparan `CompleteRegistration`: los adsets optimizan por
 * COMPLETE_REGISTRATION. Cambiarlo desalinearía el conteo de resultados en Ads
 * Manager — decisión 2026-07-17.
 */
async function eventoDeConversion(p: Record<string, unknown>): Promise<ResultadoTrabajo> {
  const eventId = texto(p, 'eventId')
  if (!eventId) return 'skipped'

  const funnel = requerido(p, 'funnel') as FunnelKind
  const nombre = requerido(p, 'nombre')
  const [primerNombre, ...resto] = nombre.trim().split(/\s+/)
  const eventTime = typeof p.eventTimeUnixSeconds === 'number' ? p.eventTimeUnixSeconds : undefined

  const { sendCapiEvent } = await import('@/lib/marketing/meta-capi')
  const r = await sendCapiEvent({
    eventName: 'CompleteRegistration',
    eventId,
    eventSourceUrl: requerido(p, 'eventSourceUrl'),
    eventTimeUnixSeconds: eventTime,
    userData: {
      email: texto(p, 'email'),
      phone: texto(p, 'phone'),
      firstName: primerNombre ?? null,
      lastName: resto.join(' ') || null,
      city: funnel === 'tasacion' ? texto(p, 'propertyLocation') : null,
      countryCode: 'ar',
      externalId: texto(p, 'contactId'),
      fbp: texto(p, 'fbp'),
      fbc: texto(p, 'fbc'),
      clientIpAddress: texto(p, 'ip'),
      clientUserAgent: texto(p, 'userAgent'),
    },
    customData: { contentName: texto(p, 'contentName') ?? undefined },
    testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
  })
  // `sendCapiEvent` devuelve `{ok:false}` en vez de tirar. Acá SÍ tiramos: es
  // tráfico pago y una conversión que no llega a Meta empeora la optimización
  // de los adsets. Que la reintente el worker.
  if (!r.ok) throw new Error(`Meta CAPI: ${r.error ?? 'error desconocido'}`)
  return 'done'
}

/**
 * El primer WhatsApp a quien pidió una tasación. Es lo único de esta cola que
 * le llega a una PERSONA DE AFUERA, y cumple lo que el formulario le prometió
 * ("te escribimos por WhatsApp en los próximos segundos").
 *
 * Además de avisar, hace algo que ninguna otra pieza puede hacer: al tocar
 * cualquiera de los dos botones, ENTRA un mensaje del cliente y eso abre la
 * ventana de 24 h de Meta. Sin esa ventana no se puede mandar texto libre, así
 * que sin este mensaje no hay coordinación posible por chat.
 *
 * Apagado por defecto: sin `WHATSAPP_TEMPLATE_TASACION` no manda nada y devuelve
 * 'skipped'. Así el código puede estar en producción antes de que Meta apruebe
 * la plantilla, sin que nadie reciba un mensaje a medias.
 */
async function primerWhatsappDeTasacion(p: Record<string, unknown>): Promise<ResultadoTrabajo> {
  // Solo el embudo de tasación: en la clase, la entrega es la clase misma en la
  // página de gracias y un WhatsApp encima sería ruido que nadie pidió.
  if (requerido(p, 'funnel') !== 'tasacion') return 'skipped'

  const plantilla = process.env.WHATSAPP_TEMPLATE_TASACION
  if (!plantilla) return 'skipped' // todavía sin plantilla aprobada

  const phoneCrudo = texto(p, 'phone')
  if (!phoneCrudo) return 'skipped'

  const { normalizeWhatsappPhone } = await import('@/lib/integrations/whatsapp/phone')
  const destino = normalizeWhatsappPhone(phoneCrudo)
  // Un número que WhatsApp no puede usar no es un error a reintentar cinco
  // veces: es un dato que no sirve. Se registra como 'skipped' y sigue.
  if (!destino) return 'skipped'

  const primerNombre = requerido(p, 'nombre').trim().split(/\s+/)[0] ?? ''

  // El envío ya deja el mensaje en `whatsapp_messages` (ver `logOutbound` dentro
  // de `sendWhatsappTemplate`), así que acá no se registra nada a mano.
  // `aiGenerated: true` es importante río abajo: el agente solo reconoce como
  // "algo que ya dije yo" los mensajes marcados así, y sin eso volvería a
  // preguntar lo que esta plantilla ya preguntó.
  const { sendWhatsappTemplate } = await import('@/lib/integrations/whatsapp/core')
  const r = await sendWhatsappTemplate({
    to: destino,
    templateName: plantilla,
    languageCode: process.env.WHATSAPP_TEMPLATE_TASACION_LANG ?? 'es_AR',
    bodyParams: [primerNombre],
    origen: 'landing',
    aiGenerated: true,
    bodyText:
      `Hola ${primerNombre}, ¿cómo estás?\n\n` +
      'Te escribo de Diego Ferreyra Inmobiliaria por la tasación gratuita que pediste recién en nuestra web.\n\n' +
      'Es presencial, sin costo y sin compromiso. ¿Cómo preferís que la coordinemos?',
  })
  // Modo prueba / sin credenciales: no salió nada, y decirlo es información.
  if (r.skipped) return 'skipped'
  if (!r.ok) throw new Error(`WhatsApp: ${r.error ?? 'error desconocido'}`)
  return 'done'
}

const MANEJADORES: Record<TipoDeTrabajo, (p: Record<string, unknown>) => Promise<ResultadoTrabajo>> = {
  whatsapp: primerWhatsappDeTasacion,
  coordinator_task: tareaDeCoordinacion,
  notify: avisoPorEmail,
  mailchimp: sincronizarMailchimp,
  anon_stitch: vincularSesionAnonima,
  capi: eventoDeConversion,
}

export async function ejecutarTrabajo(
  kind: TipoDeTrabajo,
  payload: Record<string, unknown>,
): Promise<ResultadoTrabajo> {
  const manejador = MANEJADORES[kind]
  if (!manejador) throw new Error(`tipo de trabajo desconocido: ${kind}`)
  return manejador(payload ?? {})
}
