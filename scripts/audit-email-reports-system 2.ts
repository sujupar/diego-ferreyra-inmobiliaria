#!/usr/bin/env tsx
/**
 * Auditoría del sistema de reportes por email.
 *
 * Verifica:
 *  - Existencia y contenido de la tabla `report_settings`
 *  - Histórico de `email_report_log` (últimos 30 días)
 *  - Status del dominio Resend (inmodf.com.ar verificado o no)
 *  - Histórico de envíos según Resend API
 *  - Variables de entorno requeridas presentes
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESEND_KEY = process.env.RESEND_API_KEY

function section(title: string) {
  console.log('\n' + '='.repeat(72))
  console.log(title)
  console.log('='.repeat(72))
}

async function checkEnvVars() {
  section('1. VARIABLES DE ENTORNO LOCALES (.env.local)')
  const required = {
    'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
    'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'RESEND_API_KEY': process.env.RESEND_API_KEY,
    'EMAIL_FROM_REPORTS': process.env.EMAIL_FROM_REPORTS,
    'EMAIL_FROM_DEFAULT': process.env.EMAIL_FROM_DEFAULT,
    'EMAIL_FROM_INVITATIONS': process.env.EMAIL_FROM_INVITATIONS,
    'EMAIL_REPLY_TO': process.env.EMAIL_REPLY_TO,
    'GHL_API_KEY': process.env.GHL_API_KEY,
    'GHL_LOCATION_ID': process.env.GHL_LOCATION_ID,
    'META_ACCESS_TOKEN': process.env.META_ACCESS_TOKEN,
    'META_AD_ACCOUNT_ID': process.env.META_AD_ACCOUNT_ID,
  }
  for (const [k, v] of Object.entries(required)) {
    const status = v ? '✓ presente' : '✗ AUSENTE'
    const display = v ? (k.includes('KEY') || k.includes('TOKEN') ? `<${v.length} chars>` : v) : ''
    console.log(`  ${status.padEnd(12)} ${k.padEnd(28)} ${display}`)
  }
  console.log('\n  Nota: estas son variables LOCALES, no las de Netlify. Las de Netlify hay que verificarlas manualmente desde el dashboard.')
}

async function checkReportSettings() {
  section('2. TABLA report_settings')
  const { data, error } = await supabase.from('report_settings').select('*')
  if (error) {
    console.log('  ✗ ERROR al leer tabla:', error.message)
    if (error.code === '42P01') console.log('  → LA TABLA NO EXISTE.')
    return
  }
  if (!data || data.length === 0) {
    console.log('  ✗ La tabla existe pero está VACÍA. Ningún reporte se va a disparar.')
    return
  }
  console.log(`  ✓ La tabla existe con ${data.length} fila(s).`)
  for (const row of data) {
    console.log('\n  Fila:', row.id || '(sin id)')
    for (const [k, v] of Object.entries(row)) {
      console.log(`    ${k.padEnd(24)} ${JSON.stringify(v)}`)
    }
  }
}

async function checkReportLog() {
  section('3. HISTÓRICO email_report_log (últimos 30 días)')
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data, error } = await supabase
    .from('email_report_log')
    .select('*')
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(50)
  if (error) {
    console.log('  ✗ ERROR al leer tabla:', error.message)
    if (error.code === '42P01') console.log('  → LA TABLA NO EXISTE.')
    return
  }
  if (!data || data.length === 0) {
    console.log('  ✗ No hay registros en los últimos 30 días.')
    console.log('  → Significa que las funciones scheduled NUNCA escribieron en la tabla.')
    console.log('  → O bien las funciones nunca corrieron, o fallan antes de loggear.')
    return
  }
  console.log(`  ✓ ${data.length} registros encontrados.\n`)
  const summary: Record<string, { sent: number; failed: number; last: string }> = {}
  for (const r of data) {
    const k = r.report_type || 'unknown'
    if (!summary[k]) summary[k] = { sent: 0, failed: 0, last: '' }
    if (r.status === 'sent') summary[k].sent++
    else summary[k].failed++
    if (!summary[k].last || r.sent_at > summary[k].last) summary[k].last = r.sent_at
  }
  for (const [type, s] of Object.entries(summary)) {
    console.log(`  ${type.padEnd(12)} sent: ${s.sent}  failed: ${s.failed}  último: ${s.last}`)
  }
  console.log('\n  Últimos 10 registros:')
  for (const r of data.slice(0, 10)) {
    console.log(`    ${r.sent_at}  [${r.status}]  ${r.report_type}  to: ${JSON.stringify(r.recipients).slice(0, 60)}  err: ${(r.error_message || '').slice(0, 80)}`)
  }
}

async function checkResendDomain() {
  section('4. DOMINIO RESEND (inmodf.com.ar)')
  if (!RESEND_KEY) {
    console.log('  ✗ RESEND_API_KEY ausente, no puedo consultar Resend.')
    return
  }
  const res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  })
  if (!res.ok) {
    console.log(`  ✗ Resend API error: ${res.status} ${res.statusText}`)
    console.log('  ', await res.text())
    return
  }
  const data = await res.json()
  if (!data.data || data.data.length === 0) {
    console.log('  ✗ No hay dominios registrados en esta cuenta Resend.')
    return
  }
  console.log(`  ✓ ${data.data.length} dominio(s) en la cuenta:\n`)
  for (const d of data.data) {
    console.log(`    Nombre:   ${d.name}`)
    console.log(`    Status:   ${d.status}  ${d.status === 'verified' ? '✓' : '✗ NO VERIFICADO'}`)
    console.log(`    Región:   ${d.region}`)
    console.log(`    Created:  ${d.created_at}`)
    console.log('')
  }
}

async function checkResendEmails() {
  section('5. ENVÍOS RECIENTES VÍA RESEND API (últimos 30)')
  if (!RESEND_KEY) {
    console.log('  ✗ RESEND_API_KEY ausente.')
    return
  }
  const res = await fetch('https://api.resend.com/emails?limit=30', {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  })
  if (!res.ok) {
    console.log(`  ✗ Resend API: ${res.status} ${res.statusText}`)
    console.log('  ', await res.text())
    return
  }
  const data = await res.json()
  if (!data.data || data.data.length === 0) {
    console.log('  ✗ Resend reporta 0 emails enviados desde esta API key.')
    console.log('  → CONFIRMA QUE LAS FUNCIONES SCHEDULED NUNCA ENVIARON UN EMAIL.')
    return
  }
  console.log(`  ✓ ${data.data.length} emails recientes:\n`)
  for (const e of data.data.slice(0, 15)) {
    console.log(`    ${e.created_at}  [${e.last_event || 'unknown'}]  from: ${e.from}  to: ${JSON.stringify(e.to).slice(0, 60)}  subj: ${(e.subject || '').slice(0, 60)}`)
  }
}

async function listTables() {
  section('6. TABLAS RELEVANTES EN SUPABASE (existen?)')
  const tables = [
    'report_settings',
    'email_report_log',
    'meta_ads_daily',
    'ghl_pipeline_daily',
    'ghl_commercial_actions_daily',
    'deals',
    'profiles',
  ]
  for (const t of tables) {
    const { error, count } = await supabase.from(t).select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`  ✗ ${t.padEnd(32)} ${error.message}`)
    } else {
      console.log(`  ✓ ${t.padEnd(32)} ${count ?? 0} filas`)
    }
  }
}

async function main() {
  console.log('Auditoría sistema de reportes — ' + new Date().toISOString())
  await checkEnvVars()
  await listTables()
  await checkReportSettings()
  await checkReportLog()
  await checkResendDomain()
  await checkResendEmails()
}

main().catch(e => {
  console.error('FAILED:', e)
  process.exit(1)
})
