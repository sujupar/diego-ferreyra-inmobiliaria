import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseWebhookPayload, verifySignature, type InboundMessage, type StatusUpdate } from '@/lib/integrations/whatsapp/webhook'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { mapMetaStatus } from '@/lib/integrations/whatsapp/log'
import { downloadAndStoreInboundMedia } from '@/lib/integrations/whatsapp/media'

export const dynamic = 'force-dynamic'

/**
 * POST/GET /api/webhooks/whatsapp
 *
 * Webhook de la Cloud API de WhatsApp (Meta). Hasta esta tarea (2026-07-30) no
 * existía: una respuesta de un cliente se perdía en silencio, y los estados de
 * entrega (enviado/entregado/leído/falló) que loguea `logOutbound` nunca se
 * actualizaban después del envío inicial ('accepted').
 *
 * GET  → verificación de suscripción de Meta (hub.challenge).
 * POST → mensajes entrantes (`value.messages[]`) y actualizaciones de estado
 *        (`value.statuses[]`). SIEMPRE responde 200 ante un payload
 *        auténtico (firma OK), aunque el guardado en base falle — un 4xx/5xx
 *        hace que Meta reintente en loop y puede terminar deshabilitando el
 *        webhook.
 *
 * `whatsapp_messages` NO está en `types/database.types.ts` (mismo motivo que
 * `lib/integrations/whatsapp/log.ts`): cliente admin SIN el genérico
 * `<Database>` + cast manual.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * Busca el lead más reciente cuyo teléfono normalizado coincide con el del
 * mensaje entrante. No hay columna de teléfono normalizado en `property_leads`
 * (el dato se guarda tal cual lo tipeó el lead/asesor), así que acotamos con
 * un `ilike` por los últimos 8 dígitos (barato, evita un table scan) y recién
 * ahí confirmamos con `normalizeWhatsappPhone` para no dar falsos positivos
 * por coincidencia de sufijo entre países distintos.
 *
 * Si no hay ningún match, devuelve `null` — la fila se guarda igual con
 * `lead_id` en NULL (nunca se descarta un mensaje por esto).
 */
async function findLeadIdByPhone(
  supabase: ReturnType<typeof admin>,
  normalizedFrom: string,
): Promise<{ leadId: string; propertyId: string | null } | null> {
  // OJO: el prefiltro usa los ÚLTIMOS 4 dígitos, no 8. Los teléfonos se guardan
  // TAL CUAL los escribió la persona ("+54 11 1234 5678", "11 2233-4455"), así
  // que un `ilike` con los últimos 8 dígitos NO matchea: el espacio o el guion
  // caen justo dentro de esos 8 y el patrón falla. Con 4 dígitos el prefiltro es
  // más laxo (trae más candidatos) y la coincidencia REAL la decide
  // `normalizeWhatsappPhone` abajo, que es exacta. Límite alto por eso.
  // Si algún día hay decenas de miles de leads, conviene una columna generada
  // con el teléfono normalizado + índice, y volver a un prefiltro exacto.
  const suffix = normalizedFrom.slice(-4)
  if (suffix.length < 4) return null // demasiado corto para acotar de forma útil

  try {
    const { data, error } = await supabase
      .from('property_leads')
      .select('id, phone, created_at, property_id')
      .not('phone', 'is', null)
      // Los leads en la papelera no se consideran: atar un mensaje entrante a un
      // lead que alguien archivó lo haría reaparecer de rebote en el CRM. El
      // mensaje se guarda igual, solo queda sin `lead_id` — nunca se descarta.
      .is('deleted_at', null)
      .ilike('phone', `%${suffix}%`)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error || !data) return null

    for (const row of data as Array<{ id: string; phone: string | null; property_id: string | null }>) {
      if (normalizeWhatsappPhone(row.phone) === normalizedFrom) {
        return { leadId: row.id, propertyId: row.property_id ?? null }
      }
    }
    return null
  } catch (err) {
    console.warn('[whatsapp-webhook] no se pudo buscar lead por teléfono (continuando):', err)
    return null
  }
}

/** Persiste un mensaje entrante. Nunca lanza — un fallo de guardado no puede tumbar el 200 a Meta. */
async function persistInbound(supabase: ReturnType<typeof admin>, msg: InboundMessage): Promise<void> {
  try {
    const normalized = normalizeWhatsappPhone(msg.from)
    // Meta ya manda `from` en formato E.164 sin '+' (es la fuente canónica, no
    // texto tipeado por un usuario) — si por lo que sea no valida contra
    // libphonenumber, igual lo persistimos tal cual llegó: perder el mensaje
    // de un cliente es peor que guardar un teléfono que no pudimos normalizar.
    const phoneE164 = normalized ?? msg.from
    // Guardamos TAMBIÉN la propiedad del lead: sin esto, un mensaje entrante
    // quedaba sin propiedad y el chat no podía ofrecer "enviar información de la
    // propiedad" ni validar sus fotos.
    const ctxLead = await findLeadIdByPhone(supabase, normalized ?? msg.from)
    const leadId = ctxLead?.leadId ?? null
    const leadPropertyId = ctxLead?.propertyId ?? null

    // ORDEN DELIBERADO: PRIMERO se guarda el mensaje, DESPUÉS se baja el adjunto.
    // Al revés (que era como estaba), la descarga —hasta 8s de Meta + 8s del
    // binario + la subida a Storage— corría antes del insert: si la función se
    // pasaba del límite de tiempo, el mensaje del cliente NO quedaba guardado y
    // Meta reintentaba contra el mismo camino lento. Perder el mensaje de un
    // cliente es justo lo que este sistema existe para evitar.
    const { error } = await supabase
      .from('whatsapp_messages')
      .upsert(
        {
          direction: 'in',
          phone_e164: phoneE164,
          wa_id: msg.from,
          wa_message_id: msg.waMessageId,
          contact_name: msg.contactName,
          lead_id: leadId,
          property_id: leadPropertyId,
          body_preview: msg.bodyPreview,
          payload: msg.payload as never,
          status: 'received',
          media_mime_type: msg.mediaMimeType,
          media_filename: msg.mediaFilename,
          media_type: msg.mediaId ? msg.type : null,
        },
        { onConflict: 'wa_message_id', ignoreDuplicates: true },
      )
    if (error) {
      console.warn('[whatsapp-webhook] no se pudo guardar el mensaje entrante (continuando):', error.message)
    }

    // Ya está a salvo: ahora sí bajamos el adjunto y completamos la fila. Si esto
    // falla o se corta, el mensaje YA quedó registrado y visible en el chat (sin
    // la imagen). El reintento de Meta vuelve a intentar la descarga sin duplicar
    // la fila, porque el upsert de arriba es idempotente por `wa_message_id`.
    if (msg.mediaId) {
      const media = await downloadAndStoreInboundMedia({
        mediaId: msg.mediaId,
        waMessageId: msg.waMessageId,
        filenameHint: msg.mediaFilename,
      })
      if (media) {
        const { error: mediaError } = await supabase
          .from('whatsapp_messages')
          .update({
            media_url: media.storagePath,
            media_mime_type: media.mimeType,
            media_filename: media.filename,
          })
          .eq('wa_message_id', msg.waMessageId)
        if (mediaError) {
          console.warn('[whatsapp-webhook] no se pudo adjuntar el archivo al mensaje:', mediaError.message)
        }
      }
    }
  } catch (err) {
    console.warn('[whatsapp-webhook] excepción guardando mensaje entrante (continuando):', err)
  }
}

/**
 * Progreso de un mensaje saliente. Meta REINTENTA los webhooks y NO garantiza el
 * orden, así que un `sent` que llega tarde no debe pisar un `delivered` o un
 * `read` que ya mostramos. `failed` gana siempre: es la información que más
 * importa y la que motivó todo este trabajo.
 */
const ORDEN_ESTADO: Record<string, number> = {
  skipped: 0, accepted: 1, sent: 2, delivered: 3, read: 4, failed: 99,
}

/** Actualiza el estado de un mensaje saliente ya logueado por `logOutbound`. Nunca lanza. */
async function persistStatus(supabase: ReturnType<typeof admin>, s: StatusUpdate): Promise<void> {
  try {
    const nuevo = mapMetaStatus(s.status)

    const { data: actual } = await supabase
      .from('whatsapp_messages')
      .select('id, status')
      .eq('wa_message_id', s.waMessageId)
      .maybeSingle()

    if (!actual) {
      // Carrera estrecha pero real: el estado llegó antes de que `logOutbound`
      // escribiera la fila. Sin este aviso el evento se perdía sin dejar rastro,
      // justo lo contrario de lo que este sistema existe para garantizar.
      console.warn(
        `[whatsapp-webhook] llegó el estado "${s.status}" para un mensaje que todavía no está registrado (wa_message_id=${s.waMessageId}) — se descarta`,
      )
      return
    }

    const rankActual = ORDEN_ESTADO[(actual as { status: string }).status] ?? -1
    const rankNuevo = ORDEN_ESTADO[nuevo] ?? -1
    if (rankNuevo < rankActual) {
      console.log(
        `[whatsapp-webhook] estado "${nuevo}" descartado por llegar fuera de orden (ya estaba en "${(actual as { status: string }).status}")`,
      )
      return
    }

    const { error } = await supabase
      .from('whatsapp_messages')
      .update({
        status: nuevo,
        error_code: s.errorCode,
        error_message: s.errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('wa_message_id', s.waMessageId)
    if (error) {
      console.warn('[whatsapp-webhook] no se pudo actualizar el estado (continuando):', error.message)
    }
  } catch (err) {
    console.warn('[whatsapp-webhook] excepción actualizando estado (continuando):', err)
  }
}

/**
 * GET — verificación de suscripción del webhook (Meta la dispara al guardar
 * la config en el panel de la app). Responde el `hub.challenge` en texto
 * plano SOLO si `hub.verify_token` matchea `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
 * Fail closed: sin la env var configurada, siempre 403 (nunca 500).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  if (!expected || mode !== 'subscribe' || token !== expected || !challenge) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  return new NextResponse(challenge, { status: 200 })
}

/**
 * POST — mensajes entrantes + actualizaciones de estado. Ver comentario de
 * arriba del archivo para el contrato de respuesta (siempre 200 ante payload
 * auténtico).
 */
export async function POST(request: NextRequest) {
  // El body CRUDO es imprescindible: la firma HMAC es sobre los bytes tal
  // cual los mandó Meta, re-serializar con JSON.stringify() no da el mismo
  // resultado (orden de keys, espacios, etc.).
  const raw = await request.text()
  const signatureHeader = request.headers.get('x-hub-signature-256')

  const validSignature = verifySignature(raw, signatureHeader, process.env.WHATSAPP_APP_SECRET)
  if (!validSignature) {
    // Fail closed: sin WHATSAPP_APP_SECRET o con firma que no matchea, 403.
    // Preferimos perder un mensaje entrante a aceptar payloads sin autenticar
    // en un endpoint público que escribe en la base.
    console.warn('[whatsapp-webhook] firma inválida o ausente — rechazado')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  let body: unknown = null
  try {
    body = JSON.parse(raw)
  } catch (err) {
    console.warn('[whatsapp-webhook] body no es JSON válido (firma OK, se ignora):', err)
    return NextResponse.json({ ok: true })
  }

  const { inbound, statuses } = parseWebhookPayload(body)
  const supabase = admin()

  // Secuencial: son pocos eventos por POST (Meta agrupa, pero rara vez manda
  // más de un puñado por request) y evita saturar la conexión a Supabase.
  for (const msg of inbound) {
    await persistInbound(supabase, msg)
  }
  for (const s of statuses) {
    await persistStatus(supabase, s)
  }

  return NextResponse.json({ ok: true, inbound: inbound.length, statuses: statuses.length })
}
