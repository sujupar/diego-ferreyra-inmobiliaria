/**
 * Plantillas v2 de respuesta a consultas de portal — cortas, con el enlace del
 * aviso y la pregunta por el video en el mismo mensaje.
 *
 * Por qué CUATRO y no dos: el enlace del aviso solo llega en los mails de
 * Argenprop (38 de 40). ZonaProp, que es el 83% del volumen, no lo manda nunca.
 * Y Meta RECHAZA el envío entero si un parámetro va vacío, así que no se puede
 * tener una sola plantilla con el enlace opcional. Van dos variantes por
 * categoría: con enlace y sin enlace.
 *
 * Por qué el botón de respuesta rápida y no "respondé este mensaje": al tocarlo
 * ENTRA un mensaje del cliente. Eso hace tres cosas de una — abre la ventana de
 * 24hs, deja la intención registrada en el chat, y le da al agente el pie exacto
 * para seguir. Un texto que pide responder no genera nada si la persona no
 * escribe. Es el mismo patrón ya aprobado en `recorrido_acceso_v3/v4`.
 *
 * Uso:
 *   node crear-plantillas.mjs            # estado, no crea nada
 *   node crear-plantillas.mjs --create   # crea las que falten
 */
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)

const V = env.WHATSAPP_API_VERSION ?? 'v21.0'
const WABA = env.WHATSAPP_BUSINESS_ACCOUNT_ID
const TOKEN = env.WHATSAPP_ACCESS_TOKEN
const LANG = 'es_AR'

/** Los dos botones: cubren los dos caminos que puede querer la persona, en un toque. */
const BOTONES = {
  type: 'BUTTONS',
  buttons: [
    { type: 'QUICK_REPLY', text: 'Sí, mandame el video' },
    { type: 'QUICK_REPLY', text: 'Quiero coordinar una visita' },
  ],
}

const PLANTILLAS = [
  {
    name: 'consulta_v2',
    category: 'MARKETING',
    // {{1}} nombre de pila · {{2}} propiedad · {{3}} enlace del aviso
    body: `Hola {{1}}, soy del equipo de Diego Ferreyra Inmobiliaria. Te paso el aviso de {{2}}: {{3}}

¿Te mando el video de la propiedad?`,
    example: [['Martín', 'la casa de Pico 4690, Saavedra', 'https://www.argenprop.com/aviso--19963489']],
  },
  {
    name: 'consulta_sin_enlace_v2',
    category: 'MARKETING',
    // {{1}} nombre de pila · {{2}} propiedad
    body: `Hola {{1}}, soy del equipo de Diego Ferreyra Inmobiliaria, por tu consulta sobre {{2}}.

¿Te mando el video de la propiedad?`,
    example: [['Martín', 'la casa de Pico 4690, Saavedra']],
  },
  {
    name: 'consulta_v2_util',
    category: 'UTILITY',
    body: `Hola {{1}}. Recibimos tu consulta por {{2}}. Acá está el aviso: {{3}}

¿Querés que te mandemos el video de la propiedad?`,
    example: [['Martín', 'la casa de Pico 4690, Saavedra', 'https://www.argenprop.com/aviso--19963489']],
  },
  {
    name: 'consulta_sin_enlace_v2_util',
    category: 'UTILITY',
    body: `Hola {{1}}. Recibimos tu consulta por {{2}}.

¿Querés que te mandemos el video de la propiedad?`,
    example: [['Martín', 'la casa de Pico 4690, Saavedra']],
  },
]

async function main() {
  if (!WABA || !TOKEN) throw new Error('Faltan WHATSAPP_BUSINESS_ACCOUNT_ID o WHATSAPP_ACCESS_TOKEN')
  const crear = process.argv.includes('--create')

  const r = await fetch(
    `https://graph.facebook.com/${V}/${WABA}/message_templates?limit=100&fields=name,status,category&access_token=${encodeURIComponent(TOKEN)}`,
  )
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  const existentes = new Map((j.data ?? []).map(t => [t.name, t]))

  for (const p of PLANTILLAS) {
    const ya = existentes.get(p.name)
    if (ya) {
      console.log(`  ya existe   ${p.name.padEnd(28)} ${ya.category} / ${ya.status}`)
      continue
    }
    if (!crear) {
      console.log(`  falta       ${p.name.padEnd(28)} (${p.category})`)
      continue
    }
    const res = await fetch(`https://graph.facebook.com/${V}/${WABA}/message_templates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        name: p.name,
        language: LANG,
        category: p.category,
        components: [
          { type: 'BODY', text: p.body, example: { body_text: p.example } },
          BOTONES,
        ],
      }),
    })
    const jr = await res.json()
    if (jr.error) {
      console.log(`  ✗ ERROR     ${p.name.padEnd(28)} ${jr.error.error_user_msg ?? jr.error.message}`)
    } else {
      console.log(`  ✓ creada    ${p.name.padEnd(28)} id=${jr.id} categoría=${jr.category ?? p.category} estado=${jr.status ?? 'PENDING'}`)
    }
  }
}

main().catch(e => { console.error('falló:', e.message); process.exit(1) })
