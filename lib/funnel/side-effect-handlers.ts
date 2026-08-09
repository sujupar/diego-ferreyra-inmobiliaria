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
 */
async function avisoPorEmail(p: Record<string, unknown>): Promise<ResultadoTrabajo> {
  const funnel = requerido(p, 'funnel') as FunnelKind
  const dealId = requerido(p, 'dealId')
  if (resolveFunnelMapping(funnel).notify === 'class') {
    const { notifyClassRegistration } = await import('@/lib/email/notifications/class-registration')
    await notifyClassRegistration({ dealId })
  } else {
    const { notifyAppraisalRequest } = await import('@/lib/email/notifications/appraisal-request')
    await notifyAppraisalRequest({ dealId })
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

const MANEJADORES: Record<TipoDeTrabajo, (p: Record<string, unknown>) => Promise<ResultadoTrabajo>> = {
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
