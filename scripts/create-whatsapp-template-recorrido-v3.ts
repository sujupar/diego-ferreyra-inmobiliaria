/**
 * Tercera versión de la plantilla del recorrido: texto del dueño + DOS botones.
 *
 * Por qué esta combinación (verificada contra Meta el 2026-08-02, probando las
 * dos y borrando las de prueba): Meta acepta tanto "2 botones URL" como
 * "URL + respuesta rápida". Elegimos la segunda.
 *
 *   [ Ver recorrido ]              → URL, abre /v/<token>
 *   [ Quiero agendar una visita ]  → RESPUESTA RÁPIDA
 *
 * La diferencia importa: dos botones URL apuntarían al mismo lugar (redundante),
 * mientras que la respuesta rápida hace que al tocarla ENTRE UN MENSAJE del
 * cliente. Eso hace tres cosas de una: abre la ventana de 24hs, deja registrada
 * la intención en el chat, y le da el pie exacto al agente de IA para pedir día
 * y horario. Un botón URL no genera ningún mensaje entrante y no habilita nada.
 *
 * Texto: el que escribió el dueño, corregido de tipeo y en voseo. Se conserva el
 * número de solicitud al pie porque es lo que sostiene la clasificación UTILITY
 * (ver el comentario largo de la v1).
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-recorrido-v3.ts          # estado
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-recorrido-v3.ts --create # crear
 */
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const TEMPLATE_NAME = 'recorrido_acceso_v3'
const LANGUAGE = 'es_AR'

/** {{1}} nombre de pila · {{2}} propiedad (con dirección) · {{3}} nº de solicitud */
const BODY_TEXT = `Hola {{1}}, ¿cómo estás?

Te envío el recorrido de {{2}}, tal como lo pediste recién.

Tocá el botón de abajo para verla 👇

Solicitud {{3}} · Diego Ferreyra Inmobiliaria`

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
    console.log(`  ${String(t.category).padEnd(9)} ${String(t.status).padEnd(9)} ${t.name}`)
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
        example: { body_text: [['Martín', 'el departamento de 4 ambientes en Monte Castro', 'Abc23Xyz99']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL', text: 'Ver recorrido',
            url: 'https://inmodf.com.ar/v/{{1}}',
            example: ['https://inmodf.com.ar/v/Abc23Xyz99'],
          },
          // Respuesta rápida a propósito: al tocarla entra un mensaje del
          // cliente, se abre la ventana de 24hs y el agente de IA puede
          // arrancar a coordinar el día. Un botón URL no generaría nada.
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
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
