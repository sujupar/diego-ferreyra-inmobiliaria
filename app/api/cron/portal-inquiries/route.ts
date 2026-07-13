import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gmailConfigured, getMessage, listMessages } from '@/lib/integrations/gmail/client'
import { buildGmailQuery, detectPortal, isLeadEmail, parseByPortal } from '@/lib/integrations/portal-inquiries'
import { matchProperty } from '@/lib/integrations/portal-inquiries/match'
import { notifyInquiry } from '@/lib/integrations/portal-inquiries/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // segundos

/**
 * GET /api/cron/portal-inquiries
 *
 * Cron del escaneo de consultas de portales — corre cada 5 min vía Netlify
 * Scheduled Function. Auth: header `x-cron-secret` == env CRON_SECRET.
 *
 * Pipeline:
 *   1. Gmail API: lista mensajes recientes de los remitentes de portales.
 *   2. Para cada mensaje NO procesado (dedup por gmail_message_id):
 *      parsea → matchea propiedad/asesor → inserta en portal_inquiries.
 *   3. Notifica por WhatsApp al asesor asignado + a Diego (dueño).
 *   4. Persiste stats de la corrida en portal_inquiry_poll_state (observabilidad).
 *
 * TODO el handler está envuelto en try/catch que SIEMPRE persiste estado —
 * para no repetir el bug histórico de "cron que falla en silencio".
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const startedAt = new Date()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const stats = {
    fetched: 0,
    parsed: 0,
    inserted: 0,
    duplicates: 0,
    ignored: 0, // remitente no reconocido
    skippedNotLead: 0, // del portal pero no es consulta (factura/marketing/soporte)
    unmatched: 0, // sin asesor → fallback a Diego
    notifySent: 0,
    notifySkipped: 0,
    notifyFailed: 0,
    errors: 0,
    errorDetails: [] as Array<{ id: string; message: string }>,
  }

  const persistState = async (extra: Record<string, unknown>) => {
    const finishedAt = new Date()
    // upsert (no update) para no perder el estado en silencio si la fila
    // singleton no existe — lección "cron que falla en silencio".
    await supabase.from('portal_inquiry_poll_state').upsert({
      id: 1,
      last_polled_at: startedAt.toISOString(),
      last_run_started_at: startedAt.toISOString(),
      last_run_finished_at: finishedAt.toISOString(),
      last_run_stats: { ...stats, errorDetails: stats.errorDetails.slice(0, 10), ...extra },
      updated_at: finishedAt.toISOString(),
    })
  }

  try {
    if (!gmailConfigured()) {
      await persistState({ status: 'skipped', message: 'Gmail no configurado (faltan GMAIL_SA_* env vars)' })
      return NextResponse.json({ ok: false, skipped: true, reason: 'gmail_not_configured' })
    }

    const messages = await listMessages(buildGmailQuery(2), 50)
    stats.fetched = messages.length

    for (const m of messages) {
      try {
        // Dedup temprano: evita gastar una llamada a Gmail.get si ya lo procesamos.
        const { count } = await supabase
          .from('portal_inquiries')
          .select('id', { count: 'exact', head: true })
          .eq('gmail_message_id', m.id)
        if ((count ?? 0) > 0) {
          stats.duplicates++
          continue
        }

        const full = await getMessage(m.id)
        const portal = detectPortal(full.from, full.subject)
        if (!portal) {
          stats.ignored++
          continue
        }
        // Filtrar facturas/marketing/soporte: solo procesar consultas reales.
        if (!isLeadEmail(full.from, full.subject, portal)) {
          stats.skippedNotLead++
          continue
        }
        const parsed = parseByPortal(portal, { from: full.from, subject: full.subject, text: full.text, html: full.html })
        stats.parsed++

        const match = await matchProperty(supabase, parsed)
        const isUnmatched = !match.assignedTo
        if (isUnmatched) stats.unmatched++

        // Auto-aprendizaje del mapa: si matcheó por DIRECCIÓN y la consulta trae
        // código, guardamos ese código en la fila del mapa → las próximas consultas
        // de ese aviso (que pueden venir SIN dirección, típico de algunos portales)
        // matchean por código directo. Solo desde matches por dirección (alta
        // confianza); NUNCA por título (ambiguo, envenenaría el mapa). Best-effort.
        if (match.method === 'address' && match.mapId && parsed.propertyCode) {
          try {
            await supabase.from('portal_property_map')
              .update({ external_code: parsed.propertyCode })
              .eq('id', match.mapId)
              .is('external_code', null)
          } catch (e) {
            console.warn('[portal-inquiries] no se pudo auto-aprender el código', e)
          }
        }

        const { data: inserted, error: insErr } = await supabase
          .from('portal_inquiries')
          .insert({
            portal: parsed.portal,
            inquiry_type: parsed.inquiryType,
            gmail_message_id: full.id,
            gmail_thread_id: full.threadId,
            received_at: full.date ? full.date.toISOString() : null,
            lead_name: parsed.leadName,
            lead_email: parsed.leadEmail,
            lead_phone: parsed.leadPhone,
            lead_message: parsed.message,
            property_external_code: parsed.propertyCode,
            property_url: parsed.propertyUrl,
            property_address: parsed.propertyAddress ?? match.address, // si el email no trajo dirección pero matcheó, guardamos la del mapa (identificable en el inbox)
            matched_map_id: match.mapId,
            property_id: match.propertyId, // FK real a properties (null = sin identificar)
            assigned_to: match.assignedTo, // null si unmatched → notify usa al dueño
            is_unmatched: isUnmatched,
            raw_subject: full.subject,
            raw_snippet: full.snippet,
          })
          .select('id, seq')
          .single()

        if (insErr) {
          // 23505 = carrera con otra corrida; lo tratamos como duplicado.
          if ((insErr as { code?: string }).code === '23505') {
            stats.duplicates++
            continue
          }
          stats.errors++
          stats.errorDetails.push({ id: m.id, message: insErr.message })
          continue
        }
        stats.inserted++

        // Propiedad identificable para el WhatsApp: si la consulta MATCHEÓ una
        // propiedad, usar su dirección/título REALES del mapa (no el código pelado
        // que a veces trae el email, típico de Argenprop). Sin match: lo que trajo
        // el email; el código solo como último recurso, formateado como "Aviso #".
        const propertyLabel =
          match.address || parsed.propertyAddress || match.title || parsed.propertyTitle ||
          (parsed.propertyCode ? `Aviso #${parsed.propertyCode}` : null) ||
          parsed.propertyUrl || '(propiedad sin identificar)'
        // El "Aviso" SIEMPRE muestra el LINK al aviso del portal cuando lo tenemos:
        // del mail (ML/Argenprop) o del mapa scrapeado (ZonaProp). Clickeable → Diego
        // abre la propiedad en el portal directo.
        const avisoLabel =
          match.external_url || parsed.propertyUrl || match.title || parsed.propertyTitle || parsed.propertyCode || propertyLabel

        const n = await notifyInquiry(supabase, {
          id: inserted.id,
          seq: inserted.seq as number,
          portal: parsed.portal,
          inquiryType: parsed.inquiryType,
          propertyLabel,
          avisoLabel,
          leadName: parsed.leadName,
          leadPhone: parsed.leadPhone,
          leadEmail: parsed.leadEmail,
          message: parsed.message,
          assignedTo: match.assignedTo,
        })
        stats.notifySent += n.sent
        stats.notifySkipped += n.skipped
        stats.notifyFailed += n.failed
      } catch (err) {
        stats.errors++
        stats.errorDetails.push({ id: m.id, message: err instanceof Error ? err.message : String(err) })
      }
    }

    await persistState({ status: 'ok' })
    const finishedAt = new Date()
    return NextResponse.json({ ok: true, durationMs: finishedAt.getTime() - startedAt.getTime(), ...stats })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[portal-inquiries] fatal:', msg)
    await persistState({ status: 'failed', message: msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

/**
 * POST → delega al GET. pg_net (pg_cron) solo hace http_post, así que el job de
 * Supabase pega por POST. La validación del x-cron-secret y todo el pipeline viven
 * en el GET. (El scheduler de Netlify no dispara en este sitio — ver CLAUDE.md.)
 */
export async function POST(req: NextRequest) {
  return GET(req)
}
