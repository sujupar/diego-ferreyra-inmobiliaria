/**
 * Task 5 (selector de teléfono con bandera + país automático) y Task 6
 * (frenar el bot del formulario) — verificación SIN navegador.
 *
 * Por qué así: los tests de componente (happy-dom) no arrancan en este host
 * (problema del entorno), y Turbopack tampoco levanta local (acento del path
 * del proyecto — ver CLAUDE.md). Mismo patrón que
 * `scripts/lead-capture-phone-guard.probe.tsx` (Task 2, ya mergeada):
 *   A) `renderToStaticMarkup` del popup CERRADO y de `PhoneField` solo, para
 *      confirmar que los módulos cargan y no hay nada estructuralmente roto.
 *   B) Auditoría del CÓDIGO FUENTE real de los archivos tocados: confirma
 *      wiring, orden de guards, y que NINGÚN camino nuevo rechaza un lead
 *      (regla dura: "nunca se rechaza, solo se marca").
 *   C) Ronda contra la base REAL (Supabase), con datos `[TEST-...]` propios,
 *      dejados en la papelera (soft-delete) al final — nunca un DELETE real,
 *      nunca toca leads existentes.
 *
 * NO invoca `POST /api/leads` de verdad: esta base tiene `WHATSAPP_TEST_MODE=false`
 * (envíos reales habilitados) y dispara email/WhatsApp/CAPI — prohibido en este
 * trabajo. Por eso la parte C inserta directo en Supabase, con el MISMO shape
 * que usa la ruta, no a través de la ruta.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/phone-selector-and-antibot.probe.tsx
 */
import React from 'react' // tsx compila JSX a React.createElement (sin jsx runtime acá)
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { LeadCaptureProvider } from '../components/landing/LeadCaptureProvider'
import { PhoneField } from '../components/landing/PhoneField'
import { detectFillerLeadData, issueLeadTicket, isValidLeadTicket } from '../lib/leads/anti-bot'

let fallos = 0
function check(nombre: string, ok: boolean, detalle = '') {
  console.log(`${ok ? '✅' : '❌'} ${nombre}${ok ? '' : ` — ${detalle}`}`)
  if (!ok) fallos++
}

const __dirname = dirname(fileURLToPath(import.meta.url))
function readSrc(relPath: string): string {
  return readFileSync(join(__dirname, relPath), 'utf8')
}

// ═══════════════════ A) render estático ════════════════════════════════════

const popupHtml = renderToStaticMarkup(
  <LeadCaptureProvider propertyId="11111111-1111-1111-1111-111111111111" propertyTitle="Depto de prueba">
    <div>contenido de la landing</div>
  </LeadCaptureProvider>,
)
check('LeadCaptureProvider carga y renderiza sin excepción', popupHtml.includes('contenido de la landing'))
check('el popup arranca CERRADO (sin riesgo de mismatch de hidratación)', !popupHtml.includes('role="dialog"'))

const phoneFieldHtml = renderToStaticMarkup(
  <PhoneField id="lc-phone-test" value="" onChange={() => {}} country="AR" onCountryChange={() => {}} />,
)
check('PhoneField renderiza sin excepción', phoneFieldHtml.includes('lc-phone-test'))
check('PhoneField arranca con el dropdown CERRADO', !phoneFieldHtml.includes('role="listbox"'))
check('PhoneField muestra la bandera de fallback (AR) antes de cargar la lista completa', phoneFieldHtml.includes('🇦🇷'))

// ═══════════════════ B) auditoría de código fuente ═════════════════════════

const providerSrc = readSrc('../components/landing/LeadCaptureProvider.tsx')

check('importa PhoneField', providerSrc.includes("import { PhoneField } from './PhoneField'"))
check('importa composePhoneForSubmit (no reimplementa la composición)', providerSrc.includes("composePhoneForSubmit } from '@/lib/landing/phone-country'"))
check(
  '"libphonenumber-js/max" solo aparece como `import type` (nunca estático en runtime)',
  !/^import (?!type ).*libphonenumber-js\/max/m.test(providerSrc),
)

// Regresión: el lock anti-doble-submit se sigue tomando ANTES del primer await.
const lockIdx = providerSrc.indexOf('submittingRef.current = true')
const guardPhoneIdx = providerSrc.indexOf('if (form.phone.trim()) {')
check('el lock anti-doble-submit sigue ANTES del guard de teléfono (no se movió)', lockIdx !== -1 && lockIdx < guardPhoneIdx)

// El guard ahora usa la región elegida, no adivina AR.
check(
  'el guard de teléfono valida con la región elegida (`country`), no adivina AR',
  /\(await loadPhoneCheck\(\)\)\(form\.phone, country as CountryCode\)/.test(providerSrc),
)

// Geo: se pide UNA vez, gateado en isOpen, nunca bloquea.
check('pide el país a /api/geo', providerSrc.includes("fetch('/api/geo')"))
check('el fetch de geo está gateado en `isOpen` (no corre en cada visita, solo al abrir el popup)', /if \(!isOpen \|\| geoFetchedRef\.current\) return/.test(providerSrc))

// Ticket: se pide cada vez que se abre el popup.
check('pide la ficha a /api/leads/ticket', providerSrc.includes("fetch('/api/leads/ticket')"))
check('el fetch de la ficha está gateado en `isOpen`', /if \(!isOpen\) return\s+setTicket\(null\)/.test(providerSrc))

// El POST manda el teléfono COMPUESTO (con indicativo) y la ficha.
// El POST manda el número YA CANÓNICO (E.164). `composePhoneForSubmit` queda
// como respaldo para cuando el normalizador no pudo cargar o no resolvió.
// Sin esto, "15 6123 4567" pasaba la validación y se guardaba como
// "+54 15 6123 4567", imposible de renormalizar → lead incontactable.
check('el POST manda el teléfono ya normalizado, no el pegoteo', /phone: phoneParaGuardar,/.test(providerSrc))
check('composePhoneForSubmit queda como respaldo', /composePhoneForSubmit\(form\.phone, callingCode\)/.test(providerSrc))
check('el canónico se calcula con el normalizador diferido', /loadPhoneNormalizer\(\)/.test(providerSrc) && /phoneParaGuardar = `\+\$\{e164\}`/.test(providerSrc))
check('el POST manda `ticket`', /\bticket,\n\s*\}\),/.test(providerSrc))

// El campo de teléfono en el JSX usa PhoneField, no un <input> crudo.
check('el JSX usa <PhoneField ... /> para el campo de teléfono', providerSrc.includes('<PhoneField'))
check('ya no hay un <input type="tel" id="lc-phone"> crudo', !providerSrc.includes('id="lc-phone"\n                      type="tel"'))

const phoneFieldSrc = readSrc('../components/landing/PhoneField.tsx')
check(
  '"libphonenumber-js/max" NO se importa de forma estática en PhoneField (solo `import type` + `import()` diferido)',
  !/^import (?!type ).*libphonenumber-js\/max/m.test(phoneFieldSrc),
)
check('carga getCountries/getCountryCallingCode con import() diferido', phoneFieldSrc.includes("await import('libphonenumber-js/max')"))
check('usa Intl.DisplayNames para el nombre del país (sin paquete de banderas/nombres)', phoneFieldSrc.includes('Intl.DisplayNames'))
check('Escape en el buscador cierra SOLO el dropdown (stopPropagation, no cierra todo el popup)', /e\.key === 'Escape'[\s\S]{0,40}e\.stopPropagation\(\)/.test(phoneFieldSrc))

const routeSrc = readSrc('../app/api/leads/route.ts')
check('importa evaluateLeadSubmission de lib/leads/anti-bot', routeSrc.includes("import { evaluateLeadSubmission } from '@/lib/leads/anti-bot'"))
check('el schema acepta `ticket` (opcional, nunca obligatorio)', /ticket: z\.string\(\)\.max\(200\)\.nullable\(\)\.optional\(\)/.test(routeSrc))
check('el INSERT escribe suspected_bot', routeSrc.includes('suspected_bot: antiBot.suspectedBot'))
check('el INSERT escribe bot_reason', routeSrc.includes('bot_reason: antiBot.reason'))
check('el INSERT usa el cliente sin el genérico (getAdminRaw) para poder escribir esas columnas', /getAdminRaw\(\)\s*\.from\('property_leads'\)\s*\.insert/.test(routeSrc))
check(
  'NINGÚN camino nuevo devuelve error/rechazo por sospecha de bot (solo se loguea con console.warn — "nunca se rechaza")',
  !/if \(antiBot\.suspectedBot\)[\s\S]{0,120}NextResponse\.json/.test(routeSrc),
)

const ticketRouteSrc = readSrc('../app/api/leads/ticket/route.ts')
check('GET /api/leads/ticket usa issueLeadTicket', ticketRouteSrc.includes('issueLeadTicket()'))

const geoRouteSrc = readSrc('../app/api/geo/route.ts')
check('GET /api/geo lee el header x-nf-geo', geoRouteSrc.includes("req.headers.get('x-nf-geo')"))
check('GET /api/geo nunca tira 5xx (try/catch con fallback)', /catch[\s\S]{0,80}country: 'AR'/.test(geoRouteSrc))

// ═══════════════════ C) ronda contra la base real ══════════════════════════

async function dbRoundTrip() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: anyProp, error: propErr } = await supabase
    .from('properties')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (propErr || !anyProp) {
    check('hay una propiedad real para usar de FK', false, propErr?.message ?? 'ninguna propiedad encontrada')
    return
  }
  const propertyId = anyProp.id as string

  // Mismo shape EXACTO que arma `POST /api/leads` tras `evaluateLeadSubmission`.
  const reason = detectFillerLeadData({ name: 'John Doe', email: 'john.doe@probe.test', phone: '+54 11 1234 5678' })
  const { data: inserted, error: insErr } = await supabase
    .from('property_leads')
    .insert([
      {
        property_id: propertyId,
        name: '[TEST-ANTIBOT] John Doe',
        email: 'john.doe@probe.test',
        phone: '+54 11 1234 5678',
        message: 'Coordinar una visita · closing',
        source: 'landing',
        utm: {},
        suspected_bot: reason !== null,
        bot_reason: reason,
      },
      {
        property_id: propertyId,
        name: '[TEST-ANTIBOT] Lead real',
        email: 'lead-real@probe.test',
        phone: '+54 11 6123 4567',
        message: 'Coordinar una visita · cta',
        source: 'landing',
        utm: {},
        suspected_bot: false,
        bot_reason: null,
      },
    ])
    .select('id, name, suspected_bot, bot_reason')
  if (insErr || !inserted || inserted.length !== 2) {
    check('INSERT con suspected_bot/bot_reason funciona contra la base real', false, insErr?.message ?? 'no se insertaron 2 filas')
    return
  }
  check('INSERT con suspected_bot/bot_reason funciona contra la base real', true)

  const bot = inserted.find(r => r.name.includes('John Doe'))!
  const real = inserted.find(r => r.name.includes('Lead real'))!
  check('el lead con datos de relleno quedó suspected_bot=true', bot.suspected_bot === true)
  check('el lead con datos de relleno tiene bot_reason auditable', typeof bot.bot_reason === 'string' && bot.bot_reason.includes('John Doe'))
  check('el lead real quedó suspected_bot=false', real.suspected_bot === false)
  check('el lead real tiene bot_reason=null', real.bot_reason === null)

  // Limpieza: SIEMPRE soft-delete, nunca un DELETE real.
  const { error: cleanupErr } = await supabase
    .from('property_leads')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', inserted.map(r => r.id))
  check('limpieza: los 2 leads de prueba quedaron soft-deleted (nunca un DELETE real)', !cleanupErr, cleanupErr?.message)

  // Confirmación end-to-end de que los "John Doe" reales ya están marcados
  // (script `mark-johndoe-leads-suspected.ts`, corrido antes que este probe).
  const { data: johnDoes } = await supabase
    .from('property_leads')
    .select('lead_number, suspected_bot, bot_reason, deleted_at')
    .in('lead_number', [1001, 1008])
  check(
    'los 2 "John Doe" reales (#1001, #1008) están marcados suspected_bot=true y en la papelera',
    (johnDoes ?? []).length === 2 && (johnDoes ?? []).every(r => r.suspected_bot === true && r.deleted_at != null),
    JSON.stringify(johnDoes),
  )
}

async function main() {
  // Un ticket real emitido/validado de punta a punta (además de los tests unitarios de Vitest).
  const t = issueLeadTicket()
  check('un ticket recién emitido es válido de punta a punta', isValidLeadTicket(t))

  await dbRoundTrip()

  console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} verificación(es) fallaron`)
  process.exit(fallos === 0 ? 0 : 1)
}

main()
