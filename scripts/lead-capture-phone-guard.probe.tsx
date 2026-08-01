/**
 * Verificación del guard de teléfono en el popup de captura de leads
 * (`components/landing/LeadCaptureProvider.tsx`) y de la insignia del Inbox
 * (`app/(dashboard)/inbox/InboxClient.tsx`) SIN navegador.
 *
 * Por qué así: el submit real vive en un handler async (fetch + estado de
 * React) — happy-dom no arranca en este host (problema preexistente del
 * entorno) y Turbopack tampoco levanta local (acento del path del proyecto).
 * Este probe hace dos cosas:
 *
 *  1) Renderiza el componente de verdad con renderToStaticMarkup (mismo
 *     patrón que `scripts/landing-gallery-lock.probe.tsx`) para confirmar que
 *     el módulo carga y el popup cerrado sigue estructuralmente sano (no se
 *     rompió nada al agregar el import de `isWhatsappUsable`). Como el guard
 *     nuevo corre DENTRO de `submit` (un handler, no el render), no ramifica
 *     el DOM según ningún hook — no hay riesgo de hydration mismatch, y este
 *     render estático alcanza para confirmarlo.
 *  2) Verifica, contra el CÓDIGO FUENTE real del archivo, que:
 *     - el guard nuevo está DESPUÉS de la validación de nombre+contacto (no
 *       la reemplaza ni la reordena),
 *     - solo dispara cuando `form.phone.trim()` es verdadero (no bloquea con
 *       el campo vacío),
 *     - usa `isWhatsappUsable` (Task 2, ya mergeada — no reimplementa la
 *       validación),
 *     - el texto del error es EXACTAMENTE el del brief, en voseo.
 *
 * Uso: node --import tsx scripts/lead-capture-phone-guard.probe.tsx
 */
import React from 'react' // tsx compila JSX a React.createElement (sin jsx runtime acá)
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LeadCaptureProvider } from '../components/landing/LeadCaptureProvider'
// OJO: NO se importa `isWhatsappUsable` acá para llamarla en runtime. Al correr
// bajo `node --import tsx`, `lib/integrations/whatsapp/phone.ts` (un .ts común,
// se transpila a CJS) termina resolviendo `libphonenumber-js/max` de forma que
// `metadataJson.countries` da `undefined` — un problema del entorno tsx/CJS
// para ESE módulo puntual (reproducible incluso importando el archivo SOLO,
// sin tocar nada de este probe; no pasa con Vitest, que sí corre limpio: ver
// `phone.test.ts`, 8/8 verde). Por eso la decisión de `isWhatsappUsable` se
// verifica con Vitest, y este probe solo audita el WIRING del componente
// (código fuente + render estático), no vuelve a probar la librería.

let fallos = 0
function check(nombre: string, ok: boolean, detalle = '') {
  console.log(`${ok ? '✅' : '❌'} ${nombre}${ok ? '' : ` — ${detalle}`}`)
  if (!ok) fallos++
}

// ── Caso 1: render estático del popup cerrado (estado por defecto) ──────────
const html = renderToStaticMarkup(
  <LeadCaptureProvider propertyId="11111111-1111-1111-1111-111111111111" propertyTitle="Depto de prueba">
    <div>contenido de la landing</div>
  </LeadCaptureProvider>,
)
check('el módulo carga y renderiza sin tirar excepción', html.includes('contenido de la landing'))
check('el popup arranca CERRADO (no hay dialog en el HTML inicial)', !html.includes('role="dialog"'))

// ── Caso 2: el código fuente respeta el orden y la condición del guard ──────
const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, '../components/landing/LeadCaptureProvider.tsx'), 'utf8')

// 2026-08-02: el popup se simplificó a nombre + teléfono (se sacó el email),
// así que la regla vieja "nombre + (email o teléfono)" pasó a ser
// "nombre + teléfono", ambos obligatorios — el mismo guard de más abajo
// (`isWhatsappUsable`) sigue viviendo DESPUÉS de esa validación de campos.
const nombreContactoIdx = src.indexOf('Necesitamos tu nombre y tu teléfono')
// El validador se carga en DIFERIDO (`loadPhoneCheck`): `libphonenumber-js/max`
// son ~50 KB gzip y esta landing es tráfico pago, así que no entra en el bundle
// inicial. Por eso el guard no llama a `isWhatsappUsable` de forma directa.
const guardPhoneIdx = src.indexOf('if (form.phone.trim()) {')
const errorCopy = 'Revisá el número: puede que falte la característica o el indicativo del país (ej. +57 para Colombia).'
const lockIdx = src.indexOf('submittingRef.current = true')

check('la validación nombre+teléfono (ambos obligatorios) sigue intacta', nombreContactoIdx !== -1)
check('ya no queda rastro de la regla vieja "nombre + al menos un contacto (email o teléfono)"', !src.includes('al menos un contacto (email o teléfono)'))
check('el email ya NO es parte del formulario (popup simplificado a 2 campos)', !src.includes('form.email'))
check('el guard nuevo de teléfono existe', guardPhoneIdx !== -1)
check('el guard de teléfono va DESPUÉS de la regla nombre+teléfono (no la reemplaza)', guardPhoneIdx > nombreContactoIdx)
check('el guard solo corre si el campo tiene contenido (no bloquea vacío)', src.includes('if (form.phone.trim()) {'))
check('usa isWhatsappUsable de Task 2 (no reimplementa la validación)', src.includes("await import('@/lib/integrations/whatsapp/phone')"))
check('el validador se carga en diferido (no engorda el bundle de la landing paga)', !/^import .*whatsapp\/phone'/m.test(src))
// Regresión encontrada en la revisión adversarial: el `await` del import diferido
// reabría la ventana de doble submit (dos leads y dos WhatsApp al mismo cliente).
check('el lock anti-doble-submit se toma ANTES del await del validador', lockIdx !== -1 && lockIdx < guardPhoneIdx)
check('si el teléfono es inválido, el lock se LIBERA (si no, el form queda muerto)', src.includes('submittingRef.current = false'))
check('el texto de error es EXACTO al del brief', src.includes(errorCopy), 'no se encontró el string exacto')

// El error se muestra en el mismo párrafo que ya usaba el form (status==='err'),
// no en un elemento nuevo — confirma que reutilizamos el render existente.
check(
  'reutiliza el render de error existente (status === \'err\' && errorMsg)',
  /status === 'err' && errorMsg/.test(src),
)

// ── Popup simplificado a 2 campos (2026-08-02) ──────────────────────────────
check('el título por defecto pide los datos para el tour virtual', src.includes('Completá estos datos para recibir el tour virtual'))
check('ya no queda el título viejo "Dejanos tus datos"', !src.includes("'Dejanos tus datos'"))
check('el campo de nombre ahora dice "Nombre" (no "Nombre y apellido")', /Nombre <span/.test(src) && !src.includes('Nombre y apellido'))
check('ya no hay campo de email en el JSX (id="lc-email")', !src.includes('lc-email'))
check('ya no hay selector "¿Qué te interesa?" (id="lc-intent")', !src.includes('lc-intent'))
check('el <select> del intent ya no está en el JSX', !src.includes('<select'))
check('el botón de envío dice "Enviar recorrido por WhatsApp"', src.includes('Enviar recorrido por WhatsApp'))
check('el botón viejo "Me interesa, quiero que me contacten" ya no existe', !src.includes('Me interesa, quiero que me contacten'))
check('hay un ícono de WhatsApp SVG inline (no un emoji)', src.includes('function WhatsAppIcon') && src.includes('<svg'))
check('el mensaje de éxito promete el recorrido por WhatsApp "en los próximos segundos"', src.includes('Recibís el recorrido de la propiedad por WhatsApp en los próximos segundos'))
check('si el WhatsApp no salió, el texto es honesto (no promete un mensaje que no llegó)', src.includes('No pudimos enviarte el WhatsApp, pero ya podés ver el recorrido acá'))
check('el link de acceso (accessUrl) sigue siempre presente cuando existe — es el respaldo real', /\{accessUrl && \(/.test(src))

// ── Caso 3: la insignia del Inbox (código fuente, mismo motivo que Caso 2 —
// InboxClient.tsx hace fetch + useEffect, no vale la pena mockear todo eso
// para confirmar una condición de renderizado) ──────────────────────────────
const inboxSrc = readFileSync(
  join(__dirname, '../app/(dashboard)/inbox/InboxClient.tsx'),
  'utf8',
)
check(
  'InboxClient importa isWhatsappUsable de Task 2',
  inboxSrc.includes("import { isWhatsappUsable } from '@/lib/integrations/whatsapp/phone'"),
)
check(
  'la insignia solo aparece si HAY teléfono y no es usable (no confunde con "sin teléfono")',
  inboxSrc.includes('lead.phone && !isWhatsappUsable(lead.phone)'),
)
check(
  'la insignia es ámbar (bg-amber-500) con el texto pedido',
  /bg-amber-500 text-white[\s\S]{0,40}>\s*Teléfono no válido para WhatsApp/.test(inboxSrc),
)

console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} verificación(es) fallaron`)
process.exit(fallos === 0 ? 0 : 1)
