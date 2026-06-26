#!/usr/bin/env tsx
/**
 * Diagnóstico de la conexión a Gmail + identificación de correos de portales.
 *
 * NO toca la base de datos ni envía WhatsApp. Sirve para validar, ANTES de
 * correr el SQL, que:
 *   1. La cuenta de servicio + delegación (DWD) funcionan (lee la casilla).
 *   2. Encontramos los correos de MercadoLibre / ZonaProp / Argenprop.
 *   3. El parser extrae bien lead + propiedad de cada uno.
 *   4. Descubrimos los remitentes REALES (para calibrar PORTAL_SENDERS si hace falta).
 *
 * Uso:
 *   npx tsx scripts/gmail-portal-diagnostic.ts                 # últimos 45 días
 *   npx tsx scripts/gmail-portal-diagnostic.ts --days 90
 *   npx tsx scripts/gmail-portal-diagnostic.ts --days 30 --max 50
 *
 * Requiere en .env.local (una sola línea cada uno):
 *   GMAIL_SA_CLIENT_EMAIL=...
 *   GMAIL_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *   GMAIL_IMPERSONATE_EMAIL=contacto@diegoferreyrainmobiliaria.com
 */
import fs from 'node:fs'
import path from 'node:path'
import { gmailConfigured, listMessages, getMessage } from '../lib/integrations/gmail/core'
import { parseInquiry, detectPortal, isLeadEmail, buildGmailQuery } from '../lib/integrations/portal-inquiries/index'

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
const daysIdx = args.indexOf('--days')
const DAYS = daysIdx >= 0 ? parseInt(args[daysIdx + 1] || '45', 10) : 45
const maxIdx = args.indexOf('--max')
const MAX = maxIdx >= 0 ? parseInt(args[maxIdx + 1] || '30', 10) : 30

function emailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim().toLowerCase()
}

async function main() {
  console.log('\n=== Diagnóstico Gmail · consultas de portales ===\n')

  if (!gmailConfigured()) {
    console.error('❌ Faltan env vars de Gmail en .env.local:')
    if (!process.env.GMAIL_SA_CLIENT_EMAIL) console.error('   - GMAIL_SA_CLIENT_EMAIL')
    if (!process.env.GMAIL_SA_PRIVATE_KEY) console.error('   - GMAIL_SA_PRIVATE_KEY')
    if (!process.env.GMAIL_IMPERSONATE_EMAIL) console.error('   - GMAIL_IMPERSONATE_EMAIL')
    console.error('\nCargalas y volvé a correr. Ver docs/setup-consultas-portales.md §2.')
    process.exit(1)
  }
  console.log(`Casilla: ${process.env.GMAIL_IMPERSONATE_EMAIL}`)
  console.log(`Ventana: últimos ${DAYS} días · máximo ${MAX} correos\n`)

  // Búsqueda AMPLIA por marca (sin TLD) para descubrir los remitentes reales,
  // incluso subdominios que la query del sistema todavía no contemple.
  const discovery = `newer_than:${DAYS}d (from:mercadolibre OR from:mercadolivre OR from:zonaprop OR from:argenprop)`
  console.log(`Query de descubrimiento: ${discovery}`)

  let msgs: { id: string; threadId: string }[]
  try {
    msgs = await listMessages(discovery, MAX)
  } catch (err) {
    console.error('\n❌ No pude leer Gmail. Error:', err instanceof Error ? err.message : err)
    console.error('\nCausas típicas:')
    console.error('  • "unauthorized_client": falta autorizar el Client ID en Admin Console (DWD, paso §2b).')
    console.error('  • "invalid_grant"/firma: la GMAIL_SA_PRIVATE_KEY quedó mal pegada (debe ir en UNA línea con \\n).')
    console.error('  • La casilla GMAIL_IMPERSONATE_EMAIL no es del dominio del Workspace.')
    process.exit(1)
  }

  if (msgs.length === 0) {
    console.log('\n⚠️  No encontré correos de portales en la ventana. Probá con --days 90,')
    console.log('   o confirmá que las consultas de los portales llegan a ESTA casilla.')
    return
  }

  const senderCount = new Map<string, number>()
  const sendersNotConfigured = new Set<string>()
  const counts = { mercadolibre: 0, zonaprop: 0, argenprop: 0, noReconocido: 0 }
  let leads = 0
  let noise = 0

  console.log(`\nEncontré ${msgs.length} correo(s). Detalle:\n`)

  for (const [i, m] of msgs.entries()) {
    let full
    try {
      full = await getMessage(m.id)
    } catch (err) {
      console.log(`  [${i + 1}] (no pude leer el mensaje ${m.id}: ${err instanceof Error ? err.message : err})`)
      continue
    }
    const addr = emailAddress(full.from)
    senderCount.set(addr, (senderCount.get(addr) ?? 0) + 1)

    const portal = detectPortal(full.from, full.subject)
    const lead = portal ? isLeadEmail(full.from, full.subject, portal) : false
    if (portal) counts[portal]++
    else counts.noReconocido++
    if (lead) leads++
    else noise++

    console.log(`  [${i + 1}] ${full.date ? full.date.toLocaleString('es-AR') : '(sin fecha)'}`)
    console.log(`       De:      ${full.from}`)
    console.log(`       Asunto:  ${full.subject}`)
    console.log(`       Portal:  ${portal ?? '⚠️ NO RECONOCIDO'}   ·   Es consulta: ${lead ? '✅ sí' : '⏭️  no (factura/marketing/soporte → se ignora)'}`)

    if (lead && portal) {
      const parsed = parseInquiry({ from: full.from, subject: full.subject, text: full.text, html: full.html })!
      console.log(`       → Tipo: ${parsed.inquiryType} · Nombre: ${parsed.leadName ?? '—'} · Tel: ${parsed.leadPhone ?? '—'} · Email: ${parsed.leadEmail ?? '—'}`)
      console.log(`       → Código: ${parsed.propertyCode ?? '—'} · Dirección: ${parsed.propertyAddress ?? '—'}`)
      console.log(`       → Título: ${parsed.propertyTitle ?? '—'}`)
    }
    console.log('')
  }

  void sendersNotConfigured
  console.log('=== Resumen ===')
  console.log(`  Por portal → MercadoLibre: ${counts.mercadolibre} · ZonaProp: ${counts.zonaprop} · Argenprop: ${counts.argenprop} · No reconocidos: ${counts.noReconocido}`)
  console.log(`  Consultas reales: ${leads} · Ignorados (factura/marketing/soporte): ${noise}`)
  console.log('\n  Remitentes encontrados:')
  for (const [addr, n] of [...senderCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${addr}  (${n})`)
  }
  console.log(`\n  Query que usa el cron: ${buildGmailQuery(2)}`)
  console.log('\n✅ Revisá que las "consultas reales" estén bien parseadas (nombre/tel/email/código/dirección).\n')
}

main().catch(err => { console.error(err); process.exit(1) })
