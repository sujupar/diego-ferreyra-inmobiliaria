/**
 * Cuarta versión de la plantilla del recorrido. Cambia DOS cosas respecto de la
 * v3, las dos pedidas por el dueño el 2026-08-03 después de probarla en su
 * propio teléfono:
 *
 * 1. **Se va el "Solicitud <token>" del pie.** El número suelto no le decía
 *    nada al cliente y ensuciaba el mensaje. En su lugar va el LINK completo,
 *    que cumple la misma función de referencia de trámite (sostiene la
 *    clasificación UTILITY) pero además sirve para algo.
 *
 * 2. **El link va TAMBIÉN en el cuerpo, no solo en el botón.** En WhatsApp de
 *    computadora el botón de la v3 no abre nada al hacerle clic — un link de
 *    texto sí abre el navegador del sistema. El botón se queda para el celular,
 *    donde funciona bien.
 *
 * Lo que NO cambia: la respuesta rápida "Quiero agendar una visita". Es la que
 * hace ENTRAR un mensaje del cliente, y sin eso el agente de IA no existe.
 *
 * OJO — no queda en uso por crearla: la elige la env var
 * `WHATSAPP_TEMPLATE_RECORRIDO` en Netlify. Hasta que ese valor diga
 * `recorrido_acceso_v4`, se sigue mandando la que esté configurada hoy.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-recorrido-v4.ts          # estado
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-recorrido-v4.ts --create # crear
 */
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const TEMPLATE_NAME = 'recorrido_acceso_v4'
const LANGUAGE = 'es_AR'

/** {{1}} nombre de pila · {{2}} propiedad (con dirección) · {{3}} link completo del recorrido */
const BODY_TEXT = `Hola {{1}}, ¿cómo estás?

Te envío el recorrido de {{2}}, tal como lo pediste recién.

Podés verlo acá: {{3}}

Diego Ferreyra Inmobiliaria`

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
    `https://graph.facebook.com/${API_VERSION}/${waba}/message_templates?limit=50&fields=name,status,category,rejected_reason&access_token=${encodeURIComponent(token)}`,
  )
  const j0 = (await res0.json()) as { data?: Array<Record<string, string>> }
  console.log('Plantillas de la cuenta:')
  for (const t of j0.data ?? []) {
    console.log(`  ${String(t.category).padEnd(9)} ${String(t.status).padEnd(9)} ${t.name}${t.rejected_reason && t.rejected_reason !== 'NONE' ? `  (${t.rejected_reason})` : ''}`)
  }
  const mine = (j0.data ?? []).filter(t => t.name === TEMPLATE_NAME)
  if (mine.length > 0) {
    console.log(`\n"${TEMPLATE_NAME}" ya existe → ${mine[0].category} / ${mine[0].status}`)
    return
  }
  if (!create) { console.log(`\n"${TEMPLATE_NAME}" no existe. Corré con --create.`); return }

  const payload = {
    name: TEMPLATE_NAME,
    language: LANGUAGE,
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: BODY_TEXT,
        example: {
          body_text: [['Martín', 'la casa de Lares de Canning, Tristán Suárez', 'https://inmodf.com.ar/v/Abc23Xyz99']],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL', text: 'Ver recorrido',
            url: 'https://inmodf.com.ar/v/{{1}}',
            example: ['https://inmodf.com.ar/v/Abc23Xyz99'],
          },
          { type: 'QUICK_REPLY', text: 'Quiero agendar una visita' },
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
  console.log(`\n✅ Creada: ${JSON.stringify(j)}`)
  console.log('Queda pendiente de aprobación. NO se usa hasta que WHATSAPP_TEMPLATE_RECORRIDO diga', TEMPLATE_NAME)
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
