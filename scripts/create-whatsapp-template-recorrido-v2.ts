/**
 * Crea la SEGUNDA versión de la plantilla del recorrido, más humana.
 *
 * Por qué existe: la v1 (`recorrido_acceso_util`) se aprobó como UTILITY pero al
 * cliente le llega parca — arranca con "📩 Acceso al recorrido" y un
 * "Solicitud #Abc23Xyz99" que a una persona no le dice nada. El dueño de la
 * inmobiliaria pidió un tono más cálido y profesional, rioplatense.
 *
 * OJO: Meta NO admite que la plantilla empiece ni termine con una variable
 * (subcode 2388299, "Las variables no pueden estar al principio ni al final").
 * Por eso el número de solicitud va seguido del nombre de la inmobiliaria.
 *
 * La tensión a manejar: lo que hace que Meta la clasifique UTILITY es el encuadre
 * transaccional (confirma algo que la persona pidió) + un número de referencia.
 * Si se calienta demasiado el texto, cae a MARKETING y se entrega peor.
 * Estrategia de esta versión: MANTENER la confirmación explícita ("tal como lo
 * pediste") y la referencia, pero moverla al pie y escribir todo lo demás como
 * le hablaría una persona a otra.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-recorrido-v2.ts          # estado
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-template-recorrido-v2.ts --create # crear
 */
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const TEMPLATE_NAME = 'recorrido_acceso_v2'
const LANGUAGE = 'es_AR'

/** {{1}} nombre de pila · {{2}} propiedad · {{3}} nº de solicitud */
const BODY_TEXT = `Hola {{1}} 👋

Te confirmamos el acceso al recorrido de {{2}}, tal como lo pediste recién.

Vas a poder verla entera, con calma y desde donde estés. Y si querés conocerla en persona, desde el mismo enlace elegís el día y el horario que te queden cómodos — del resto nos ocupamos nosotros.

¿Alguna duda? Respondé este mensaje y te contesta un asesor del equipo.

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
    `https://graph.facebook.com/${API_VERSION}/${waba}/message_templates?limit=50&fields=name,status,category,language,rejected_reason&access_token=${encodeURIComponent(token)}`,
  )
  const j0 = (await res0.json()) as { data?: Array<Record<string, string>> }
  console.log('Plantillas de la cuenta:')
  for (const t of j0.data ?? []) {
    console.log(`  ${String(t.category).padEnd(9)} ${String(t.status).padEnd(9)} ${t.language} ${t.name}`)
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
        buttons: [{
          type: 'URL', text: 'Ver el recorrido',
          url: 'https://inmodf.com.ar/v/{{1}}',
          example: ['https://inmodf.com.ar/v/Abc23Xyz99'],
        }],
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
