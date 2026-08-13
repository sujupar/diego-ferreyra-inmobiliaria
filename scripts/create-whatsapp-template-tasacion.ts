/**
 * Plantilla del primer WhatsApp a quien pide una TASACIÓN en la landing.
 *
 * Es la pieza que cumple lo que ahora promete el formulario ("Te escribimos por
 * WhatsApp en los próximos segundos") y, sobre todo, la que ABRE la ventana de
 * 24 h: sin un mensaje del cliente entrando, Meta no deja mandar texto libre y
 * el agente no puede coordinar nada. Por eso los DOS botones son respuestas
 * rápidas: cualquiera de las dos que toque hace entrar un mensaje suyo.
 *
 * Decisiones de contenido (pedido del dueño, 2026-08-13):
 *   - CORTA. Saluda, dice de dónde salió el contacto y pregunta UNA sola cosa.
 *   - La persona elige el canal: por acá o que la llamen. Elegir es un toque,
 *     no una respuesta escrita — la fricción más baja posible.
 *   - Sin promesas de horario: la visita la confirma el equipo.
 *
 * UTILITY (no MARKETING): es el seguimiento de una solicitud que la persona
 * acaba de hacer en la web. Nombrar el pedido explícitamente es lo que sostiene
 * esa categoría ante la revisión de Meta.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-tasacion.ts           # estado
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-tasacion.ts --create  # crear
 */
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const TEMPLATE_NAME = 'tasacion_coordinar_util'
const LANGUAGE = 'es_AR'

/** {{1}} nombre de pila */
const BODY_TEXT = `Hola {{1}}, ¿cómo estás?

Te escribo de Diego Ferreyra Inmobiliaria por la tasación gratuita que pediste recién en nuestra web.

Es presencial, sin costo y sin compromiso. ¿Cómo preferís que la coordinemos?`

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
  const mine = (j0.data ?? []).filter(t => t.name === TEMPLATE_NAME)
  if (mine.length > 0) {
    console.log(`"${TEMPLATE_NAME}" ya existe → ${mine[0].category} / ${mine[0].status}`)
    if (mine[0].rejected_reason && mine[0].rejected_reason !== 'NONE') {
      console.log(`  motivo del rechazo: ${mine[0].rejected_reason}`)
    }
    return
  }
  if (!create) {
    console.log(`"${TEMPLATE_NAME}" no existe todavía. Corré con --create.`)
    return
  }

  const payload = {
    name: TEMPLATE_NAME,
    language: LANGUAGE,
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: BODY_TEXT,
        example: { body_text: [['Martín']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          // El texto de cada botón es EXACTAMENTE lo que llega como mensaje del
          // cliente: el agente lo lee para saber qué canal eligió.
          { type: 'QUICK_REPLY', text: 'Coordinar por acá' },
          { type: 'QUICK_REPLY', text: 'Prefiero que me llamen' },
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
    console.log('❌ Meta rechazó la creación:')
    console.log(JSON.stringify(j.error ?? j, null, 2))
    process.exit(1)
  }
  console.log(`✅ Creada: ${JSON.stringify(j)}`)
  console.log('Queda PENDIENTE de aprobación de Meta (suele tardar de minutos a unas horas).')
  console.log(`Cuando esté aprobada, setear WHATSAPP_TEMPLATE_TASACION=${TEMPLATE_NAME} en Netlify.`)
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
