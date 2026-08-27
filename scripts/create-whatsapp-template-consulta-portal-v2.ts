/**
 * `consulta_portal_v2` — el aviso de consulta, ahora CON botón.
 *
 * Es la misma pieza que `consulta_portal_util` (aprobada, UTILITY) con un botón
 * URL al pie: **[ Responder al interesado ]** → `inmodf.com.ar/r/<código>`, el
 * acortador propio, que rebota al chat del interesado con el saludo precargado.
 *
 * ## Por qué el link SIGUE en el cuerpo, además del botón
 *
 * No es redundancia. En WhatsApp de COMPUTADORA los botones de plantilla no
 * abren nada — lo verificó el dueño en su propio equipo el 2026-08-03 y por eso
 * `recorrido_acceso_v4` bajó el link al cuerpo. El botón es para el celular; el
 * link de texto es lo que salva la compu. Los dos apuntan al mismo lado.
 *
 * ## El cuerpo es CALCADO del aprobado, a propósito
 *
 * Meta ya clasificó este texto como UTILITY (la gemela `nueva_consulta_portal`,
 * con el mismo formato pero tono de "NUEVO LEAD", cayó en MARKETING y Meta la
 * RETIENE por el tope diario: no se entrega). Cambiar el cuerpo sería volver a
 * jugarse la categoría. Ver CLAUDE.md § portal_inquiries_whatsapp.
 *
 * ## Después de que Meta la apruebe
 *
 * NO se usa por existir: hay que poner `WHATSAPP_TEMPLATE_NAME=consulta_portal_v2`
 * en Netlify. El código ya está listo (`PLANTILLAS_CON_BOTON` en
 * `lib/integrations/portal-inquiries/notify.ts`) y hasta ese momento sigue
 * mandando la de hoy, sin botón. También conviene correr después
 * `scripts/sincronizar-cuerpos-plantillas.ts`, para que el Inbox muestre el
 * texto real de lo que se envió.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-consulta-portal-v2.ts          # estado
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-consulta-portal-v2.ts --create # crear
 */
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const TEMPLATE_NAME = 'consulta_portal_v2'
const LANGUAGE = 'es_AR'
const BASE_CORTA = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar').replace(/\/+$/, '')

/**
 * Idéntico, carácter por carácter, al cuerpo aprobado de `consulta_portal_util`.
 * {{1}} asesor · {{2}} nº de consulta · {{3}} portal · {{4}} tipo · {{5}} propiedad
 * {{6}} aviso · {{7}} interesado · {{8}} teléfono · {{9}} email · {{10}} link corto
 */
const BODY_TEXT = `📩 *Nueva consulta recibida* para {{1}}
   Consulta #{{2}}

   🏢 *Portal:* {{3}}
   📌 *Tipo:* {{4}}
   🏠 *Propiedad:* {{5}}
   🧾 *Aviso:* {{6}}

   👤 *Interesado:* {{7}}
   📞 *Tel:* {{8}}
   📧 *Email:* {{9}}

   💬 *Responder al interesado:*
   {{10}}

_Sistema Diego Ferreyra Inmobiliaria_`

const EJEMPLO = [
  'DIEGO', '291', 'ZonaProp', 'Mail', 'Entre Ríos 2300',
  'https://www.zonaprop.com.ar/propiedades/clasificado/duplex-4-ambientes-59885245.html',
  'Viviana López', '541154974791', 'svivilopez@yahoo.com.ar', `${BASE_CORTA}/r/Kx7mQ2p`,
]

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta ${name} en el entorno`)
  return v
}

async function main() {
  const waba = env('WHATSAPP_BUSINESS_ACCOUNT_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')
  const create = process.argv.includes('--create')

  const res0 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${waba}/message_templates?limit=100&fields=name,status,category,rejected_reason&access_token=${encodeURIComponent(token)}`,
  )
  const j0 = (await res0.json()) as { data?: Array<Record<string, string>> }
  const mias = (j0.data ?? []).filter(t => t.name.startsWith('consulta_portal'))
  console.log('Plantillas de consulta de portal en la cuenta:')
  for (const t of mias) {
    console.log(`  ${String(t.category).padEnd(9)} ${String(t.status).padEnd(9)} ${t.name}` +
      (t.rejected_reason && t.rejected_reason !== 'NONE' ? `  (${t.rejected_reason})` : ''))
  }

  const yaEsta = mias.find(t => t.name === TEMPLATE_NAME)
  if (yaEsta) {
    console.log(`\n"${TEMPLATE_NAME}" ya existe → ${yaEsta.category} / ${yaEsta.status}`)
    if (yaEsta.status === 'APPROVED') {
      console.log(`\n👉 Falta el último paso: poner WHATSAPP_TEMPLATE_NAME=${TEMPLATE_NAME} en Netlify.`)
      if (yaEsta.category !== 'UTILITY') {
        console.log(`⚠️  OJO: quedó como ${yaEsta.category}, no UTILITY. Meta RETIENE las de marketing`)
        console.log('   por el tope diario por persona: parte de los avisos no se entregarían.')
      }
    }
    return
  }
  if (!create) { console.log(`\n"${TEMPLATE_NAME}" no existe todavía. Corré con --create.`); return }

  const payload = {
    name: TEMPLATE_NAME,
    language: LANGUAGE,
    category: 'UTILITY',
    components: [
      { type: 'BODY', text: BODY_TEXT, example: { body_text: [EJEMPLO] } },
      {
        type: 'BUTTONS',
        buttons: [
          {
            // 25 caracteres es el tope de Meta para el texto de un botón.
            type: 'URL',
            text: 'Responder al interesado',
            // La parte fija vive acá; al enviar solo viaja el código ({{1}}).
            url: `${BASE_CORTA}/r/{{1}}`,
            example: [`${BASE_CORTA}/r/Kx7mQ2p`],
          },
        ],
      },
    ],
  }

  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${waba}/message_templates?access_token=${encodeURIComponent(token)}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
  )
  const j = (await res.json()) as Record<string, unknown>
  if (!res.ok || j.error) {
    console.log('\n❌ Meta rechazó la creación:')
    console.log(JSON.stringify(j.error ?? j, null, 2))
    process.exit(1)
  }
  console.log(`\n✅ Enviada a aprobación: ${JSON.stringify(j)}`)
  console.log('\nMeta suele tardar de minutos a 1-2 días. Volvé a correr este script (sin --create)')
  console.log('para ver el estado. Recién cuando diga APPROVED se cambia la variable en Netlify.')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
