/**
 * Plantilla del primer WhatsApp a quien pide una TASACIÓN en la landing, en la
 * etapa en que la tasación se coordina POR TELÉFONO (decisión del dueño,
 * 2026-08-27).
 *
 * REEMPLAZA a `tasacion_coordinar_util` / `tasacion_coordinar_v2`, que abrían
 * una conversación por chat con dos botones ("Coordinar por acá" / "Prefiero
 * que me llamen"). Acá no hay pregunta ni botones: el mensaje AVISA que
 * recibimos la solicitud y que una persona del equipo llama para coordinarla.
 *
 * QUÉ CAMBIA RÍO ABAJO, y hay que tenerlo presente:
 *   - Sin botones no entra ningún mensaje del cliente, y un mensaje entrante es
 *     LO ÚNICO que abre la ventana de 24 h de Meta (`lib/integrations/whatsapp/
 *     window.ts`). O sea: este WhatsApp es una vía de SALIDA, no de ida y
 *     vuelta. Si nadie llama, no hay segundo camino automático.
 *   - El agente de tasación se apaga JUNTO con el cambio de la env var
 *     (`scripts/interruptor-agente-tasacion-pg.ts --apagar`). Prendido con esta
 *     plantilla, le pediría día, horario y dirección por chat a quien acaba de
 *     leer que lo van a llamar. Los dos pasos van pegados: ver
 *     `docs/whatsapp-plantilla-tasacion.md`, § "Cómo se estrena".
 *
 * UTILITY (no MARKETING): es la confirmación de algo que la persona acaba de
 * pedir en la web. El arranque —"recibimos tu solicitud de tasación"— es
 * textualmente el que Meta ya aceptó como UTILITY en `tasacion_coordinar_v2`, y
 * no aparece ninguna de las tres palabras que en esta cuenta dispararon la
 * reclasificación a MARKETING ("gratuita", "sin costo", "sin compromiso" — ver
 * CLAUDE.md, § "Meta reclasifica la plantilla a MARKETING por el vocabulario").
 * RESULTADO REAL: se pidió UTILITY y Meta la aprobó UTILITY el mismo día
 * (2026-08-27). O sea que ni el "¡…!" del encabezado, ni el cierre social, ni el
 * teléfono literal la voltearon: el disparador es el vocabulario de venta.
 *
 * EL TELÉFONO VA LITERAL EN EL CUERPO, no como variable: cambiar de número o de
 * persona obliga a crear otra plantilla y esperar otra aprobación.
 *
 * Uso (tsx está roto con Node 24.19; el stripping nativo alcanza porque este
 * script no usa alias `@/`):
 *   node --experimental-strip-types --env-file=.env.local scripts/create-whatsapp-template-tasacion-llamada.ts           # estado
 *   node --experimental-strip-types --env-file=.env.local scripts/create-whatsapp-template-tasacion-llamada.ts --create  # crear
 *
 * Correr SIN flags después de crearla dice en qué categoría quedó de verdad: la
 * que se pide no es siempre la que se obtiene.
 */
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const TEMPLATE_NAME = 'tasacion_llamada_v1'
const LANGUAGE = 'es_AR'

/** {{1}} nombre de pila */
const BODY_TEXT = `Hola {{1}}, ¡recibimos tu solicitud de tasación!

Te llamará Paula desde el número +54 9 11 2292-6434 para coordinarla

Seguimos en contacto`

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
    if (mine[0].category !== 'UTILITY') {
      console.log('  ⚠️  Quedó fuera de UTILITY: los mensajes de marketing tienen tope de')
      console.log('     frecuencia por persona y Meta puede NO entregarlos. Con esta plantilla')
      console.log('     ese mensaje es todo el contacto — no hay agente que lo repare después.')
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
      // Sin BUTTONS a propósito: la coordinación pasó al teléfono. Ver el
      // encabezado de este archivo por lo que eso implica en la ventana de 24 h.
      {
        type: 'BODY',
        text: BODY_TEXT,
        example: { body_text: [['Martín']] },
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
  console.log('Cuando esté APROBADA, en este orden:')
  console.log('  1. node --experimental-strip-types --env-file=.env.local scripts/sincronizar-cuerpos-plantillas.ts')
  console.log('     (y commitear lib/integrations/whatsapp/cuerpos-aprobados.ts + deployar)')
  console.log(`  2. recién ahí: WHATSAPP_TEMPLATE_TASACION=${TEMPLATE_NAME} en Netlify`)
  console.log('  Al revés, los leads del intervalo quedan con el nombre suelto como texto del chat.')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
