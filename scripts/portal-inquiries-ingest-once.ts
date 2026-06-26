#!/usr/bin/env tsx
/**
 * Ingesta ÚNICA de consultas de portales (sin esperar al cron ni a Netlify).
 * Lee Gmail con el token de .env.local, parsea, matchea contra portal_property_map
 * y guarda en portal_inquiries (idempotente por gmail_message_id). NO envía WhatsApp.
 *
 * Sirve para poblar la tabla y VER las consultas en la plataforma / Supabase
 * mientras se termina de configurar WhatsApp y se hace el deploy definitivo.
 *
 * Requiere en .env.local: GMAIL_OAUTH_* (o GMAIL_SA_*), NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY. Y haber corrido antes la migración de tablas.
 *
 * Uso:
 *   npx tsx scripts/portal-inquiries-ingest-once.ts --days 90 --dry-run   # ver qué haría
 *   npx tsx scripts/portal-inquiries-ingest-once.ts --days 90 --commit    # guardar
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { gmailConfigured, listMessages, getMessage } from '../lib/integrations/gmail/core'
import { buildGmailQuery, detectPortal, isLeadEmail, parseByPortal } from '../lib/integrations/portal-inquiries/index'
import { matchProperty } from '../lib/integrations/portal-inquiries/match'

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnvLocal()

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const DRY_RUN = !COMMIT
const daysIdx = args.indexOf('--days')
const DAYS = daysIdx >= 0 ? parseInt(args[daysIdx + 1] || '30', 10) : 30
const maxIdx = args.indexOf('--max')
const MAX = maxIdx >= 0 ? parseInt(args[maxIdx + 1] || '50', 10) : 50

async function main() {
  if (!gmailConfigured()) {
    console.error('❌ Gmail no configurado en .env.local. Corré antes scripts/gmail-oauth-setup.ts')
    process.exit(1)
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  console.log(`\n${DRY_RUN ? '🔎 DRY-RUN' : '✍️  COMMIT'} — leyendo Gmail (últimos ${DAYS} días, máx ${MAX})...\n`)
  const messages = await listMessages(buildGmailQuery(DAYS), MAX)

  const stats = { fetched: messages.length, leads: 0, inserted: 0, duplicates: 0, skippedNotLead: 0, ignored: 0, unmatched: 0, errors: 0 }

  for (const m of messages) {
    try {
      const full = await getMessage(m.id)
      const portal = detectPortal(full.from, full.subject)
      if (!portal) { stats.ignored++; continue }
      if (!isLeadEmail(full.from, full.subject, portal)) { stats.skippedNotLead++; continue }
      stats.leads++

      const parsed = parseByPortal(portal, { from: full.from, subject: full.subject, text: full.text, html: full.html })
      const match = await matchProperty(supabase, parsed)
      const isUnmatched = !match.assignedTo
      if (isUnmatched) stats.unmatched++

      const label = `${portal} · ${parsed.propertyAddress || parsed.propertyCode || parsed.propertyTitle || '(sin id)'} · ${parsed.leadName || parsed.leadEmail || '(sin nombre)'}`

      if (DRY_RUN) { console.log(`  ${label}  → ${isUnmatched ? 'sin asignar' : 'asignado'}`); continue }

      const { error, count } = await supabase
        .from('portal_inquiries')
        .upsert(
          {
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
            property_address: parsed.propertyAddress,
            matched_map_id: match.mapId,
            assigned_to: match.assignedTo,
            is_unmatched: isUnmatched,
            raw_subject: full.subject,
            raw_snippet: full.snippet,
          },
          { onConflict: 'gmail_message_id', ignoreDuplicates: true, count: 'exact' },
        )
      if (error) { console.error(`  ✗ ${label}: ${error.message}`); stats.errors++; continue }
      if (count && count > 0) { console.log(`  + ${label}`); stats.inserted++ }
      else { stats.duplicates++ }
    } catch (err) {
      console.error(`  ✗ error en ${m.id}: ${err instanceof Error ? err.message : err}`)
      stats.errors++
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`  Correos leídos: ${stats.fetched} · Consultas: ${stats.leads} · Ignorados (ruido): ${stats.skippedNotLead}`)
  if (DRY_RUN) {
    console.log(`  (DRY-RUN: no se guardó nada. Repetí con --commit para poblar la tabla.)`)
  } else {
    console.log(`  Insertadas: ${stats.inserted} · Ya existían: ${stats.duplicates} · Sin asignar: ${stats.unmatched} · Errores: ${stats.errors}`)
    console.log(`  Mirá la tabla en Supabase → Table Editor → portal_inquiries`)
  }
  console.log('')
}

main().catch(err => { console.error(err); process.exit(1) })
