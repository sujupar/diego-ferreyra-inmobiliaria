import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseWebhookPayload, verifySignature, type InboundMessage, type StatusUpdate } from '@/lib/integrations/whatsapp/webhook'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { mapMetaStatus } from '@/lib/integrations/whatsapp/log'
import { downloadAndStoreInboundMedia } from '@/lib/integrations/whatsapp/media'
import { runConversationAnalysis } from '@/lib/ai/analyze-conversation'
import { runSchedulingAgent } from '@/lib/ai/scheduling-agent'
import { esPalabraDeReinicio, reiniciarPrueba, reenviarApertura, mensajeDeConfirmacion } from '@/lib/ai/reset-prueba'
import { sendWhatsappText } from '@/lib/integrations/whatsapp/core'

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
 * El POST corre en TRES fases y ese orden es parte del contrato: (1) se guardan
 * TODOS los mensajes entrantes, sin gates de tiempo en el medio; (2) se aplican
 * las actualizaciones de estado, que son baratas; (3) recién ahí, y solo si
 * queda presupuesto de tiempo (`AI_BUDGET_MS`), corre UN único pipeline de IA
 * —el del último mensaje entrante del lote—. Guardar el mensaje del cliente
 * nunca se saltea; el análisis sí, y se recupera solo en el próximo entrante.
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

/**
 * Contexto resuelto de un mensaje entrante — lo que necesita el agente de IA
 * (task 3) para correr SIN volver a resolver lead/propiedad por su cuenta.
 */
interface InboundContext {
  phoneE164: string
  leadId: string | null
  propertyId: string | null
  contactName: string | null
  /** El texto tal cual lo escribió la persona — lo lee la palabra de reinicio. */
  textoEntrante: string | null
}

/**
 * Persiste un mensaje entrante. Nunca lanza — un fallo de guardado no puede
 * tumbar el 200 a Meta. Devuelve el contexto resuelto (phone/lead/propiedad)
 * para que el caller pueda encadenar el análisis de IA + el agente que
 * agenda SIN repetir el lookup de lead — `null` si algo impidió resolverlo
 * (nunca se usa para decidir si el mensaje se guardó: eso ya se logueó arriba
 * con `console.warn`).
 */
async function persistInbound(supabase: ReturnType<typeof admin>, msg: InboundMessage): Promise<InboundContext | null> {
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

    return { phoneE164, leadId, propertyId: leadPropertyId, contactName: msg.contactName, textoEntrante: msg.bodyPreview ?? null }
  } catch (err) {
    console.warn('[whatsapp-webhook] excepción guardando mensaje entrante (continuando):', err)
    return null
  }
}

/**
 * Task 3, 2026-08-03 — el "engancharse acá" que pide el brief: analiza la
 * conversación (task 2) y, en el MISMO ciclo, deja correr al agente que
 * agenda (task 3) con el resultado FRESCO de ese análisis. `wantsToSchedule`/
 * `proposedSlot` viajan SOLO en el retorno de `runConversationAnalysis` — no
 * se persisten en ninguna tabla — así que esto NO puede separarse en un
 * proceso aparte que lea el estado más tarde. Nunca lanza: un fallo acá no
 * puede tumbar el 200 a Meta.
 *
 * NO hay acá ningún chequeo del interruptor `ai_agent_settings.analysis_enabled`,
 * y es a propósito: vive adentro de `analyzeConversation`
 * (`lib/ai/analyze-conversation.ts`), que es el chokepoint por donde pasa la
 * única llamada al modelo. Ponerlo TAMBIÉN acá sería cubrir un solo caller —
 * este— y dejar la falsa sensación de que el freno está puesto en el borde: el
 * día que alguien agregue un cron o un botón de "re-analizar", ese camino
 * llamaría al modelo igual. Un solo lugar, el más profundo, sin copias que se
 * desincronicen. Con el análisis apagado, `runConversationAnalysis` devuelve
 * `analyzed: false` y el `return` de abajo corta antes del agente que escribe.
 */
async function runAiPipeline(ctx: InboundContext): Promise<void> {
  try {
    // Sin propiedad asociada no hay datos que contestar, y un agente que
    // improvisa es peor que uno callado: se analiza para ordenar la bandeja y
    // nada más.
    if (!ctx.propertyId) {
      await runConversationAnalysis(ctx.phoneE164)
      // ...salvo que sea alguien que pidió una TASACIÓN por la landing. Esas
      // conversaciones nacen sin propiedad (la del cliente todavía no existe en
      // el sistema), así que caían acá y nadie les contestaba. El agente de
      // tasación sigue un guion cerrado —canal, cuándo, dónde— y se apaga solo
      // ante cualquier cosa fuera de guion. Tiene su propio interruptor y no
      // comparte nada con el agente de propiedades. Nunca lanza.
      if (ctx.textoEntrante) {
        const { runTasacionAgent } = await import('@/lib/ai/tasacion-agent')
        await runTasacionAgent({
          phoneE164: ctx.phoneE164,
          mensaje: ctx.textoEntrante,
          contactName: ctx.contactName,
        })
      }
      return
    }
    // Con propiedad, el agente hace TODO el turno: carga la propiedad y sus
    // datos, hace la ÚNICA llamada al modelo (que entiende y redacta), y actúa.
    await runSchedulingAgent({
      phoneE164: ctx.phoneE164,
      leadId: ctx.leadId,
      propertyId: ctx.propertyId,
      contactName: ctx.contactName,
    })
  } catch (err) {
    console.warn('[whatsapp-webhook] excepción en el pipeline de IA (continuando):', err)
  }
}

/**
 * Presupuesto de tiempo POR REQUEST para el pipeline de IA — o sea: cuánto se
 * puede haber consumido ya del request para que todavía tenga sentido ARRANCAR
 * el pipeline. El techo de 12s del modelo es POR LLAMADA, no por request.
 *
 * La cuenta, con los techos que REALMENTE existen hoy en el código (leídos, no
 * estimados), contra el techo de Netlify (~26s; `export const maxDuration` es
 * una directiva de Vercel y acá NO hace nada — ver CLAUDE.md § "nunca encadenar
 * varias llamadas de IA dentro de UN request"):
 *
 *   análisis (llamada al modelo)   12s   ANALYSIS_TIMEOUT_MS
 *                                        — lib/ai/analyze-conversation.ts:50
 *   WhatsApp que manda el agente    8s   WHATSAPP_TIMEOUT_DEFAULT_MS
 *                                        — lib/integrations/whatsapp/core.ts:24,
 *                                          aplicado en :146 (`sendWhatsappText`)
 *   mail al equipo + escrituras    SIN TECHO. `sendEmail` no le pone
 *   en Supabase                    `AbortSignal` a nada y recorre los
 *                                  destinatarios EN SERIE
 *                                  (lib/email/resend-client.ts:68); ninguna
 *                                  query de la cadena tiene timeout tampoco.
 *   margen para responderle 200     1s
 *   ------------------------------------------------------------------
 *
 * Y acá está la parte incómoda: 12 + 8 + 1 = 21s ya comprometidos, y el término
 * que falta (mail + base) NO TIENE COTA. Si le asignamos 4s —una ESTIMACIÓN,
 * no una garantía— el peor caso de UN pipeline queda en ~25s y el gate honesto
 * es 26 − 25 = 1s. Ese es el número de abajo. La cuenta anterior (9s) partía de
 * "el agente tarda ~4s" sin haber mirado los techos reales: un solo pipeline
 * arrancando a los 9s podía terminar cerca de los 34s.
 *
 * Consecuencia directa: como MUCHO UN pipeline por POST (ver FASE 3). Meta
 * agrupa eventos, pero dos teléfonos en un mismo request son dos llamadas al
 * modelo encadenadas — exactamente lo que la regla dura de CLAUDE.md prohíbe.
 * El segundo teléfono se analiza cuando llegue su propio webhook.
 *
 * PERO 1s ERA UN INTERRUPTOR DE APAGADO, NO UNA PRECAUCIÓN. Verificado en
 * producción el 2026-08-03: guardar el mensaje entrante ya se lleva más de un
 * segundo (dos roundtrips a Supabase: buscar el lead y hacer el upsert), así
 * que el gate NUNCA se cumplía y el análisis no corría jamás. El dueño escribía
 * y el agente no contestaba nada — ni siquiera lo leía.
 *
 * El error de razonamiento: sumé el PEOR caso de cada término como si todos
 * ocurrieran a la vez, y usé ese total para fijar el gate. El peor caso importa
 * para decidir si hay que sacar el pipeline del request; no para decidir si
 * arrancarlo hoy. El gate solo tiene que evitar ARRANCAR cuando ya se consumió
 * tanto tiempo que ni el caso NORMAL entra: análisis ~2-4s + envío ~1-2s.
 *
 * Con 5s de gate: el caso normal (guardado ~1s → pipeline ~5s) termina cómodo, y
 * un lote pesado que ya se comió 5s se saltea el análisis en vez de arriesgar el
 * 200 — que sigue siendo el criterio correcto.
 *
 * Lo que queda abierto, y hay que decirlo igual: un pipeline que toque TODOS sus
 * techos a la vez (12 + 8 + un mail lento) puede pasarse de los 26s. Cerrarlo de
 * verdad pide ponerle `AbortSignal` al mail y a las queries del agente, o sacar
 * el pipeline del request (cola/segundo endpoint, como ya hacen los carruseles y
 * meta-launch-v2). Es la deuda pendiente de esta pieza.
 *
 * Qué se saltea y qué no: se saltea el ANÁLISIS, nunca el guardado. Guardar el
 * mensaje del cliente es lo primero que hace el POST y es sagrado. El análisis
 * salteado se recupera solo en el próximo mensaje entrante de esa conversación,
 * porque el pipeline se dispara por mensaje entrante.
 *
 * Por qué importa tanto: si el POST no devuelve 200 a tiempo, Meta reintenta en
 * loop y puede terminar DESHABILITANDO el webhook — se dejan de recibir TODOS
 * los mensajes entrantes, no solo los del agente. Es la falla más cara posible
 * de este sistema.
 */
const AI_BUDGET_MS = 5_000

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
  // Momento de arranque del REQUEST. Todo el presupuesto de IA se mide contra
  // este instante, no contra el arranque de cada llamada — ver `AI_BUDGET_MS`.
  const inicioRequest = Date.now()

  // El body CRUDO es imprescindible: la firma HMAC es sobre los bytes tal
  // cual los mandó Meta, re-serializar con JSON.stringify() no da el mismo
  // resultado (orden de keys, espacios, etc.).
  //
  // Si la lectura del stream se corta, NO hay bytes contra los cuales validar
  // la firma: es indistinguible de un payload sin firmar, así que fail closed
  // (403), igual que cuando la firma no matchea. No escribimos nada, y el
  // reintento de Meta puede traer el body completo. Lo que NO puede pasar es
  // que esto salga como 500 sin loguear.
  let raw: string
  try {
    raw = await request.text()
  } catch (err) {
    console.warn('[whatsapp-webhook] no se pudo leer el body del request — no hay firma que verificar:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }
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

  // TODO lo que sigue va envuelto: con la firma ya validada, el payload es
  // auténtico y la respuesta DEBE ser 200 pase lo que pase. Cualquier excepción
  // acá adentro —`admin()` sin env vars, un shape inesperado, la base caída—
  // antes se iba como 500, y un 500 hace que Meta reintente en loop el mismo
  // payload y pueda terminar deshabilitando el webhook (se dejan de recibir
  // TODOS los mensajes entrantes). El único no-200 que queda es el 403 por
  // firma inválida, arriba.
  try {
    const { inbound, statuses } = parseWebhookPayload(body)
    const supabase = admin()

    // FASE 1 — GUARDAR. Primero se persiste TODO lo entrante, sin ningún gate de
    // tiempo en el medio. Esto es lo sagrado del endpoint: el sistema existe para
    // que no se pierda el mensaje de un cliente. Secuencial: son pocos eventos por
    // POST y así no se satura la conexión a Supabase.
    const contextos: InboundContext[] = []
    for (const msg of inbound) {
      const ctx = await persistInbound(supabase, msg)
      // Si `persistInbound` no pudo resolver el contexto (fallo raro), no hay nada
      // seguro que analizar: se omite sin romper el 200 a Meta.
      if (ctx) contextos.push(ctx)
    }

    // FASE 2 — ESTADOS DE ENTREGA. Van ANTES del pipeline de IA a propósito: son
    // 2 roundtrips baratos por estado y mantienen al día el enviado/entregado/
    // leído/falló que motivó todo este trabajo. Detrás de una llamada al modelo
    // quedaban a merced de que el request llegara vivo hasta acá, y encima fuera
    // de todo presupuesto. Ahora, si consumen tiempo, lo que se saltea es el
    // análisis (que se recupera solo), no ellos.
    for (const s of statuses) {
      await persistStatus(supabase, s)
    }

    // FASE 3 — ANALIZAR. COMO MUCHO UN pipeline por POST, y es el del ÚLTIMO
    // mensaje entrante del lote. Dos motivos:
    //  1) Encadenar dos llamadas al modelo en un mismo request es justo lo que
    //     prohíbe la regla dura de CLAUDE.md; con los techos reales (ver
    //     `AI_BUDGET_MS`) el peor caso de UNO solo ya raspa los 26s de Netlify.
    //  2) No se pierde casi nada: el cooldown de 2 minutos del análisis hace que
    //     el segundo teléfono del lote casi siempre no aportara nada, y cuando sí
    //     aporta, se analiza en su propio webhook (Meta manda un POST por evento
    //     salvo cuando agrupa).
    // El ÚLTIMO es el más informativo, y el análisis relee la conversación
    // completa de la base, que en este punto ya tiene todo lo de la fase 1.
    const aAnalizar = contextos.length ? contextos[contextos.length - 1] : null

    // FASE 2.5 — ¿ES LA PALABRA DE REINICIO? Va DESPUÉS de guardar (el mensaje
    // queda en el historial como cualquier otro) y ANTES del pipeline: si se
    // reinicia, no se analiza ese mismo turno — analizarlo volvería a llenar la
    // memoria que se acaba de vaciar.
    //
    // Solo funciona desde un teléfono de la lista de prueba. Para cualquier otra
    // persona la frase es un mensaje común y el agente le contesta normal.
    if (aAnalizar && esPalabraDeReinicio(aAnalizar.textoEntrante)) {
      const r = await reiniciarPrueba(aAnalizar.phoneE164, aAnalizar.propertyId, aAnalizar.leadId)
      if (r.reiniciado) {
        console.log(`[whatsapp-webhook] prueba reiniciada para ${aAnalizar.phoneE164}: ${r.limpiado.join(', ')}`)
        // 1) La confirmación primero, para que el chat se lea en el orden en que
        //    pasaron las cosas.
        await sendWhatsappText({
          to: aAnalizar.phoneE164,
          text: mensajeDeConfirmacion(r.limpiado),
          leadId: aAnalizar.leadId,
          propertyId: aAnalizar.propertyId,
          sentBy: null,
          aiGenerated: true,
          timeoutMs: 8000,
        })
        // 2) Y después la apertura de verdad: la misma plantilla, con el mismo
        //    plano en el encabezado, que recibe alguien que consulta un portal.
        //    Sin esto el reinicio dejaba la conversación limpia pero muda.
        let apertura = 'sin propiedad asociada'
        if (aAnalizar.propertyId) {
          const a = await reenviarApertura(aAnalizar.phoneE164, aAnalizar.propertyId, aAnalizar.leadId)
          apertura = a.detalle
          if (!a.ok) console.warn(`[whatsapp-webhook] no se pudo reenviar la apertura: ${a.detalle}`)
        }
        return NextResponse.json({
          ok: true,
          inbound: inbound.length,
          statuses: statuses.length,
          reiniciado: true,
          apertura,
        })
      }
      // No autorizado o falló: se sigue como un mensaje normal. No se le avisa
      // nada al que lo mandó — si no está en la lista, para el sistema es un
      // cliente escribiendo, y merece la atención de siempre.
      console.log(`[whatsapp-webhook] palabra de reinicio ignorada (${r.motivo})`)
    }

    if (aAnalizar) {
      const transcurrido = Date.now() - inicioRequest
      if (transcurrido >= AI_BUDGET_MS) {
        // Se acabó el presupuesto: en este request NO se analiza. No se pierde
        // nada permanente — el próximo mensaje entrante de esa conversación
        // vuelve a disparar el pipeline con el request limpio. Lo que sí se
        // protege es el 200 a Meta.
        console.warn(
          `[whatsapp-webhook] presupuesto de IA agotado (${transcurrido}ms de ${AI_BUDGET_MS}ms) — la conversación ${aAnalizar.phoneE164} no se analiza en este request; los mensajes YA quedaron guardados`,
        )
      } else {
        await runAiPipeline(aAnalizar)
      }
    }

    return NextResponse.json({ ok: true, inbound: inbound.length, statuses: statuses.length })
  } catch (err) {
    console.error('[whatsapp-webhook] excepción inesperada procesando el payload (se responde 200 igual):', err)
    return NextResponse.json({ ok: true, processed: false })
  }
}
