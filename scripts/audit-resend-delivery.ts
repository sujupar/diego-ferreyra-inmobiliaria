#!/usr/bin/env tsx
/**
 * Diagnóstico empírico contra Resend API:
 *  - Estado del dominio inmodf.com.ar (verified / failed / not_started)
 *  - Status real de los últimos 30-60 días de emails enviados
 *  - Filtra los emails dirigidos a los recipients de Diego
 *  - Cruza con email_report_log para detectar discrepancias
 *    (la DB dice "sent" pero Resend dice "bounced" o sin "delivered")
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

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

const RESEND_KEY = process.env.RESEND_API_KEY
if (!RESEND_KEY) {
  console.error('Necesito RESEND_API_KEY en .env.local para correr este diagnóstico.')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RECIPIENTS_OF_INTEREST = ['contacto.julianparra@gmail.com', 'ferrdiego32@gmail.com']

function section(t: string) {
  console.log('\n' + '═'.repeat(76))
  console.log(' ' + t)
  console.log('═'.repeat(76))
}

async function resend<T = any>(path: string): Promise<T> {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend ${path}: ${res.status} ${body}`)
  }
  return res.json()
}

async function listDomains() {
  section('1. Estado del dominio')
  const data = await resend<{ data: any[] }>('/domains')
  for (const d of data.data || []) {
    console.log(`  ${d.name.padEnd(30)} status=${d.status.padEnd(14)} region=${d.region}  created=${d.created_at}`)
    if (d.status !== 'verified') {
      console.log(`    ⚠️  NO VERIFICADO — los emails desde este dominio van a fallar o caer en spam`)
    }
    // Get detail for DKIM/SPF/etc.
    try {
      const detail = await resend<any>(`/domains/${d.id}`)
      if (detail.records) {
        const failing = detail.records.filter((r: any) => r.status && r.status !== 'verified')
        if (failing.length > 0) {
          console.log(`    Registros DNS con problemas:`)
          for (const r of failing) console.log(`      ${r.record} (${r.name}) → status=${r.status}`)
        } else {
          console.log(`    Todos los registros DNS están verificados ✓`)
        }
      }
    } catch {}
  }
}

async function listRecentEmails() {
  section('2. Emails enviados según Resend API (últimos 100)')
  const data = await resend<{ data: any[] }>('/emails?limit=100')
  if (!data.data || data.data.length === 0) {
    console.log('  Resend reporta 0 emails enviados con esta API key.')
    return []
  }
  console.log(`  Total: ${data.data.length} emails en el historial reciente.\n`)

  const statusCount: Record<string, number> = {}
  for (const e of data.data) {
    statusCount[e.last_event || 'unknown'] = (statusCount[e.last_event || 'unknown'] || 0) + 1
  }
  console.log('  Distribución por status:')
  for (const [s, n] of Object.entries(statusCount).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${s.padEnd(20)} ${n}`)
  }
  return data.data
}

async function emailsToDiego(allEmails: any[]) {
  section('3. Emails dirigidos a Diego (julianparra + ferrdiego32)')
  const toDiego = allEmails.filter((e: any) => {
    const tos: string[] = Array.isArray(e.to) ? e.to : [e.to]
    return tos.some(t => RECIPIENTS_OF_INTEREST.some(r => (t || '').toLowerCase().includes(r.toLowerCase())))
  })
  console.log(`  ${toDiego.length} de los emails recientes van a destinatarios de Diego.\n`)

  const statusBreakdown: Record<string, number> = {}
  for (const e of toDiego) {
    statusBreakdown[e.last_event || 'unknown'] = (statusBreakdown[e.last_event || 'unknown'] || 0) + 1
  }
  console.log('  Status real de los emails a Diego:')
  for (const [s, n] of Object.entries(statusBreakdown).sort((a, b) => b[1] - a[1])) {
    const meaning =
      s === 'delivered' ? 'llegó al inbox o spam — el destinatario tiene acceso' :
      s === 'sent' ? 'Resend lo aceptó pero el servidor de destino aún no confirmó entrega' :
      s === 'bounced' ? '🔴 rechazado por el servidor de destino — NO llegó' :
      s === 'complained' ? '🔴 marcado como spam por el destinatario' :
      s === 'delivery_delayed' ? '🟡 demorado, puede entregarse o caducar' :
      s === 'opened' ? '✓ delivered + abierto' :
      s === 'clicked' ? '✓ delivered + clickeado' :
      'estado desconocido'
    console.log(`    ${s.padEnd(22)} ${String(n).padEnd(4)}  ${meaning}`)
  }

  console.log('\n  Últimos 15 emails a Diego:')
  for (const e of toDiego.slice(0, 15)) {
    const subj = (e.subject || '').slice(0, 55)
    console.log(`    ${e.created_at}  [${(e.last_event || '?').padEnd(20)}]  ${subj}`)
    console.log(`      to: ${JSON.stringify(e.to)}  id: ${e.id}`)
  }
  return toDiego
}

async function crossCheckWithDb(emailsToDiego: any[]) {
  section('4. Discrepancias entre email_report_log y Resend')
  const { data: log } = await supabase
    .from('email_report_log')
    .select('sent_at, report_type, status, recipients')
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(100)
  console.log(`  La DB tiene ${log?.length || 0} registros marcados como "sent" en email_report_log.`)

  if (!log) return
  // Match each db record to a Resend email by approximate timestamp
  for (const dbRow of log.slice(0, 15)) {
    const dbTime = new Date(dbRow.sent_at).getTime()
    const match = emailsToDiego.find(e => {
      const t = new Date(e.created_at).getTime()
      return Math.abs(t - dbTime) < 5 * 60 * 1000 // dentro de 5 min
    })
    const resStatus = match?.last_event || 'NO ENCONTRADO en Resend'
    const flag = !match ? '🔴' :
      match.last_event === 'bounced' ? '🔴' :
      match.last_event === 'complained' ? '🔴' :
      match.last_event === 'delivered' || match.last_event === 'opened' || match.last_event === 'clicked' ? '✓' :
      '🟡'
    console.log(`  ${flag} ${dbRow.sent_at}  ${dbRow.report_type.padEnd(10)} → Resend dice: ${resStatus}`)
  }
}

async function checkSingleEmail(allEmails: any[]) {
  if (allEmails.length === 0) return
  section('5. Detalle del último envío a Diego (eventos completos)')
  const lastToDiego = allEmails.find((e: any) => {
    const tos: string[] = Array.isArray(e.to) ? e.to : [e.to]
    return tos.some(t => RECIPIENTS_OF_INTEREST.some(r => (t || '').toLowerCase().includes(r.toLowerCase())))
  })
  if (!lastToDiego) {
    console.log('  Ningún email reciente fue a destinatarios de Diego.')
    return
  }
  try {
    const detail = await resend<any>(`/emails/${lastToDiego.id}`)
    console.log(`  ID:          ${detail.id}`)
    console.log(`  Subject:     ${detail.subject}`)
    console.log(`  From:        ${detail.from}`)
    console.log(`  To:          ${JSON.stringify(detail.to)}`)
    console.log(`  Created:     ${detail.created_at}`)
    console.log(`  Last event:  ${detail.last_event}`)
    if (detail.events) {
      console.log(`  Eventos:`)
      for (const ev of detail.events) {
        console.log(`    ${ev.created_at}  ${ev.type}`)
      }
    }
  } catch (e: any) {
    console.log(`  No se pudo obtener detalle: ${e.message}`)
  }
}

async function main() {
  console.log('Diagnóstico empírico Resend — ' + new Date().toISOString())
  await listDomains()
  const all = await listRecentEmails()
  const toDiego = await emailsToDiego(all)
  await crossCheckWithDb(toDiego)
  await checkSingleEmail(all)

  console.log('\n' + '═'.repeat(76))
  console.log(' INTERPRETACIÓN')
  console.log('═'.repeat(76))
  console.log(`
  Si en la sección 3 ves muchos "delivered" → los emails SÍ llegaron, problema
    está en filtros de Gmail / carpetas / reglas del destinatario.
  Si ves "bounced" o "complained" → hay problema técnico de entrega (DNS,
    reputación de dominio, o un destinatario reportó como spam).
  Si ves "sent" sin pasar a "delivered" → Resend no recibió confirmación
    del servidor de destino — probable problema de DNS o lista bloqueada.
  Si en la sección 4 hay registros en DB que no aparecen en Resend →
    confirma que la función scheduled marca "sent" en la DB pero el POST a
    Resend nunca se hizo (probable falla del fetch sin manejo de error).
  `)
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
