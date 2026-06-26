#!/usr/bin/env tsx
/**
 * Envía UN WhatsApp de prueba con la plantilla `nueva_consulta_portal` para
 * confirmar que el número, el token y la plantilla quedaron bien conectados,
 * ANTES de activar el sistema en serio.
 *
 * SIEMPRE envía de verdad (ignora WHATSAPP_TEST_MODE).
 *
 * Requiere en .env.local: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
 * WHATSAPP_TEMPLATE_NAME, WHATSAPP_TEMPLATE_LANG (y opcional WHATSAPP_API_VERSION).
 *
 * Uso:
 *   npx tsx scripts/whatsapp-test-send.ts --to 5491155667788
 *   (el número va con código de país, sin '+'; si va sin 54 se lo agrego)
 */
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

// Forzar envío real para la prueba (el resto del sistema sigue respetando el flag).
process.env.WHATSAPP_TEST_MODE = 'false'

import { sendWhatsappTemplate, whatsappConfigured, normalizePhone } from '../lib/integrations/whatsapp/core'

async function main() {
  const args = process.argv.slice(2)
  const toIdx = args.indexOf('--to')
  const rawTo = toIdx >= 0 ? args[toIdx + 1] : ''
  const to = normalizePhone(rawTo)

  if (!whatsappConfigured()) {
    console.error('❌ Faltan WHATSAPP_PHONE_NUMBER_ID y/o WHATSAPP_ACCESS_TOKEN en .env.local.')
    process.exit(1)
  }
  if (!to) {
    console.error('❌ Pasá el número destino: --to 5491155667788 (con código de país, sin +).')
    process.exit(1)
  }

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME ?? 'nueva_consulta_portal'
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_AR'

  // 10 parámetros, en el MISMO orden que la plantilla nueva_consulta_portal.
  const bodyParams = [
    'LUCAS', // {{1}} asesor
    '#PRUEBA', // {{2}} número de lead
    'ZonaProp', // {{3}} portal
    'WhatsApp', // {{4}} tipo
    'Santo Tomé 2600', // {{5}} propiedad
    'Santo Tomé 2600', // {{6}} aviso
    'Marisa García (PRUEBA)', // {{7}} nombre
    '+54 9 11 2461 5396', // {{8}} tel
    'marisa.prueba@gmail.com', // {{9}} email
    'https://wa.me/5491124615396?text=Hola%20Marisa', // {{10}} responder
  ]

  console.log(`\nEnviando plantilla "${templateName}" (${languageCode}) a ${to}...\n`)
  const res = await sendWhatsappTemplate({ to, templateName, languageCode, bodyParams })

  if (res.ok && res.messageId) {
    console.log(`✅ Enviado. messageId: ${res.messageId}`)
    console.log('   Revisá tu WhatsApp — debería llegar en segundos.\n')
  } else {
    console.error(`❌ No se envió. Error: ${res.error}`)
    console.error('\nCausas típicas:')
    console.error('  • "template name does not exist / not approved": la plantilla todavía no está APROBADA, o el nombre/idioma no coinciden (revisá WHATSAPP_TEMPLATE_NAME y WHATSAPP_TEMPLATE_LANG vs WhatsApp Manager).')
    console.error('  • "Recipient phone number not in allowed list": agregá tu número como destinatario de prueba en WhatsApp → Configuración de la API.')
    console.error('  • "(#10) ... permission": al token le falta whatsapp_business_messaging, o no le asignaste la WABA al usuario de sistema.')
    console.error('  • número de parámetros: la plantilla debe tener exactamente 10 {{1..10}} en el body.\n')
    process.exit(1)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
