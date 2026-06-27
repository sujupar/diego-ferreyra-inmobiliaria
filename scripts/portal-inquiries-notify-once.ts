#!/usr/bin/env tsx
/**
 * PRUEBA CONTROLADA del flujo de notificación consulta→WhatsApp.
 *
 * Reenvía la notificación de UNA consulta REAL (la más reciente, o --inquiry <id>)
 * pasando por el MISMO código que el cron (notifyInquiry → buildBodyParams →
 * sendWhatsappTemplate), pero forzando el envío REAL solo en este proceso local
 * (NO toca WHATSAPP_TEST_MODE de producción).
 *
 * Por defecto es DRY-RUN: muestra a quién le llegaría y con qué teléfono, sin enviar.
 * Con --send envía de verdad. Por seguridad ABORTA si el dueño (Diego) tiene
 * teléfono cargado, salvo que pases --allow-owner (así el test no spamea a Diego).
 *
 *   node --env-file=.env.local --import tsx scripts/portal-inquiries-notify-once.ts --as-advisor <profileId>
 *   node --env-file=.env.local --import tsx scripts/portal-inquiries-notify-once.ts --as-advisor <profileId> --send
 *
 * Flags:
 *   --inquiry <id>     consulta a usar (default: la más reciente)
 *   --as-advisor <id>  fuerza el asesor asignado (para rutear el test a un perfil con teléfono)
 *   --send             envía de verdad (sin esto, dry-run)
 *   --allow-owner      permite notificar también al dueño (default: aborta si el dueño tiene teléfono)
 *
 * NOTA: la idempotencia bloquea reenvíos con status='sent'. Para re-testear la misma
 * consulta/teléfono: DELETE FROM portal_inquiry_notifications WHERE inquiry_id='<id>' AND status='sent';
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

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

async function main() {
  const args = process.argv.slice(2)
  const send = args.includes('--send')
  const allowOwner = args.includes('--allow-owner')
  const inqIdx = args.indexOf('--inquiry')
  const inquiryId = inqIdx >= 0 ? args[inqIdx + 1] : null
  const advIdx = args.indexOf('--as-advisor')
  const asAdvisor = advIdx >= 0 ? args[advIdx + 1] : null

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 1) Cargar la consulta (por id o la más reciente)
  let query = supabase.from('portal_inquiries').select('*')
  query = inquiryId
    ? query.eq('id', inquiryId)
    : query.order('created_at', { ascending: false }).limit(1)
  const { data: rows, error } = await query
  if (error) { console.error('Error leyendo portal_inquiries:', error.message); process.exit(1) }
  if (!rows?.length) { console.error('No encontré ninguna consulta.'); process.exit(1) }
  const inq = rows[0] as Record<string, any>

  const assignedTo: string | null = asAdvisor ?? inq.assigned_to ?? null

  // 2) Resolver destinatarios para mostrarlos (mismo criterio que notifyInquiry)
  const { data: owner } = await supabase
    .from('profiles').select('id, full_name, phone, role')
    .eq('role', 'dueno').eq('is_active', true).limit(1).maybeSingle()
  const { data: adv } = assignedTo
    ? await supabase.from('profiles').select('id, full_name, phone, role').eq('id', assignedTo).eq('is_active', true).maybeSingle()
    : { data: null as any }

  console.log('\n── Consulta ──')
  console.log(`  #${inq.seq}  ${inq.portal}  ${inq.property_address || inq.property_external_code || inq.property_url || ''}`)
  console.log(`  Lead: ${inq.lead_name ?? '(sin nombre)'}  tel=${inq.lead_phone ?? '—'}  email=${inq.lead_email ?? '—'}`)
  console.log('── Destinatarios ──')
  console.log(`  Asesor asignado: ${adv ? `${adv.full_name} → ${adv.phone ?? '(SIN TEL → skipped)'}` : '(ninguno)'}`)
  console.log(`  Dueño: ${owner ? `${owner.full_name} → ${owner.phone ?? '(SIN TEL → fallback env)'}` : '(ninguno)'}`)

  if (owner?.phone && !allowOwner) {
    console.error('\n⚠️  El dueño tiene teléfono cargado → también recibiría el test.')
    console.error('    Para incluirlo a propósito pasá --allow-owner. Aborto para no notificarlo sin querer.\n')
    process.exit(1)
  }

  if (!send) {
    console.log('\n(DRY-RUN) No envié nada. Agregá --send para enviar de verdad.\n')
    return
  }

  // 3) Forzar envío REAL solo en este proceso y notificar por el código real
  process.env.WHATSAPP_TEST_MODE = 'false'
  const { notifyInquiry } = await import('../lib/integrations/portal-inquiries/notify')
  const propertyLabel =
    inq.property_address || inq.property_title || inq.property_external_code || inq.property_url || '(propiedad)'
  const avisoLabel = inq.property_title || inq.property_external_code || inq.property_url || propertyLabel

  console.log('\nEnviando (real)...')
  const res = await notifyInquiry(supabase, {
    id: inq.id,
    seq: inq.seq,
    portal: inq.portal,
    inquiryType: inq.inquiry_type,
    propertyLabel,
    avisoLabel,
    leadName: inq.lead_name,
    leadPhone: inq.lead_phone,
    leadEmail: inq.lead_email,
    message: inq.lead_message ?? inq.message ?? null,
    assignedTo,
  })
  console.log('Resultado:', JSON.stringify(res))
  console.log(res.sent > 0 ? '\n✅ Enviado. Revisá tu WhatsApp.\n' : '\n⚠️ No se envió (revisá portal_inquiry_notifications: skipped/failed).\n')
}

main().catch(err => { console.error(err); process.exit(1) })
