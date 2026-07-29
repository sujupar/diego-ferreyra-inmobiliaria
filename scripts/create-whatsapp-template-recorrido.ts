/**
 * Crea (o consulta) la plantilla de WhatsApp del recorrido como **UTILITY**.
 *
 * Por qué existe: la misma plantilla escrita en tono comercial la clasifica Meta
 * como MARKETING. La diferencia NO es el tema, es el encuadre. Comparando las dos
 * plantillas que ya tiene esta cuenta —`nueva_consulta_portal` (MARKETING) y
 * `consulta_portal_util` (UTILITY, aprobada)— el patrón que Meta acepta como
 * utilidad es:
 *   - encabezado neutro y factual ("Nueva consulta recibida") en vez de
 *     entusiasta ("🔥 NUEVO LEAD"),
 *   - un NÚMERO DE REFERENCIA de la operación,
 *   - redacción de aviso de sistema, sin adjetivos de venta ni invitaciones
 *     ("si te gusta", "no te lo pierdas"),
 *   - firma "_Sistema ..._" al pie del body.
 * Esta plantilla replica ese encuadre: confirma una solicitud que la persona
 * inició (se registró para ver el recorrido) y le entrega el acceso pedido.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-recorrido.ts          # muestra el estado
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-recorrido.ts --create # la crea
 *
 * NO envía mensajes. Solo crea/consulta la plantilla.
 */

const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const TEMPLATE_NAME = 'recorrido_acceso_util'
const LANGUAGE = 'es_AR'

/**
 * {{1}} = nombre de pila · {{2}} = propiedad · {{3}} = nº de solicitud (el token)
 * El nº de referencia es lo que más empuja la clasificación a UTILITY (es el
 * rasgo que distingue a `consulta_portal_util`, aprobada, de su gemela MARKETING).
 */
const BODY_TEXT = `📩 *Acceso al recorrido* — {{2}}
Solicitud #{{3}}

Hola {{1}}, registramos tu solicitud y te enviamos el acceso al recorrido de la propiedad.

Desde el mismo enlace podés indicar el día y el horario que prefieras para coordinar la visita.

_Sistema Diego Ferreyra Inmobiliaria_`

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta ${name} en el entorno`)
  return v
}

async function listTemplates(waba: string, token: string) {
  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${waba}/message_templates?limit=50&fields=name,status,category,language,rejected_reason&access_token=${encodeURIComponent(token)}`,
  )
  const j = (await res.json()) as {
    data?: Array<{ name: string; status: string; category: string; language: string; rejected_reason?: string }>
    error?: unknown
  }
  if (j.error) throw new Error(JSON.stringify(j.error))
  return j.data ?? []
}

async function main() {
  const waba = env('WHATSAPP_BUSINESS_ACCOUNT_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')
  const create = process.argv.includes('--create')

  const existing = await listTemplates(waba, token)
  const mine = existing.filter(t => t.name === TEMPLATE_NAME)

  console.log('Plantillas de la cuenta:')
  for (const t of existing) {
    const flag = t.name === TEMPLATE_NAME ? ' ←' : ''
    console.log(
      `  ${t.category.padEnd(9)} ${t.status.padEnd(9)} ${t.language.padEnd(6)} ${t.name}` +
        (t.rejected_reason && t.rejected_reason !== 'NONE' ? `  (rechazo: ${t.rejected_reason})` : '') +
        flag,
    )
  }

  if (mine.length > 0) {
    console.log(`\n"${TEMPLATE_NAME}" ya existe → ${mine[0].category} / ${mine[0].status}. No se crea de nuevo.`)
    return
  }
  if (!create) {
    console.log(`\n"${TEMPLATE_NAME}" no existe. Corré con --create para crearla.`)
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
        example: {
          body_text: [['Martín', 'el departamento de 3 ambientes en Villa Devoto', 'Abc23Xyz99']],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Ver el recorrido',
            // La variable va PEGADA al final: Meta concatena el token del cliente.
            url: 'https://inmodf.com.ar/v/{{1}}',
            example: ['https://inmodf.com.ar/v/Abc23Xyz99'],
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
  console.log(`\n✅ Creada: ${JSON.stringify(j)}`)
  console.log('   Categoría pedida: UTILITY. Meta puede reclasificarla al revisar —')
  console.log('   volvé a correr este script (sin --create) para ver en qué quedó.')
}

main().catch(e => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
