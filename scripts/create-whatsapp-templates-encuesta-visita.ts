/**
 * Crea las dos plantillas de la encuesta post-visita (spec §11.8). Los cuerpos vienen de
 * lib/visitas/encuesta/plantillas.ts: el texto que se aprueba y el que se manda son el MISMO.
 *
 *   encuesta_visita_v1 → 4 datos + botón URL "Completar ficha" (el link también va en el cuerpo)
 *   regalo_visita_v1   → encabezado DOCUMENTO (el PDF) + 2 datos, sin botón
 *   encuesta_visita_v2 / regalo_visita_v3 → las de la guía de gastos (2026-10-17), mismos datos
 *   (regalo_visita_v2 quedó MARKETING: no se usa, ver lib/visitas/encuesta/plantillas.ts)
 *
 * Meta no acepta una URL de ejemplo para el encabezado: pide un `header_handle`, que se obtiene
 * subiendo un PDF de muestra por la Resumable Upload API (dos pasos; el segundo son los bytes crudos
 * con `file_offset: 0`). Para eso hay que pasar `--muestra=<url de un PDF>` (cualquier plano de una
 * propiedad, del bucket público property-files). El handle es SOLO para la aprobación.
 *
 * Uso (desde el worktree):
 *   node --env-file=../../../.env.local --import tsx scripts/create-whatsapp-templates-encuesta-visita.ts                     # estado
 *   node --env-file=../../../.env.local --import tsx scripts/create-whatsapp-templates-encuesta-visita.ts --create=encuesta
 *   node --env-file=../../../.env.local --import tsx scripts/create-whatsapp-templates-encuesta-visita.ts --create=regalo --muestra=https://…/plano.pdf
 *   … --create=encuesta-v2
 *   … --create=regalo-v3 --muestra=/ruta/local/guia.pdf      (la muestra puede ser un archivo local)
 *
 * Después de que Meta apruebe: correr scripts/sincronizar-cuerpos-plantillas.ts (para que el Inbox
 * muestre el texto real) y pedirle al dueño que cargue en Netlify WHATSAPP_TEMPLATE_ENCUESTA_VISITA
 * y/o WHATSAPP_TEMPLATE_REGALO_VISITA. Si una queda en MARKETING, NO se configura: se rediseña.
 */
import { readFile } from 'node:fs/promises'
import {
  PLANTILLA_ENCUESTA_V1, CUERPO_ENCUESTA_V1, BOTON_ENCUESTA_V1, PLANTILLA_REGALO_V1, CUERPO_REGALO_V1, IDIOMA_PLANTILLAS,
  PLANTILLA_ENCUESTA_V2, CUERPO_ENCUESTA_V2, BOTON_ENCUESTA_V2, PLANTILLA_ENCUESTA_V3, CUERPO_ENCUESTA_V3, BOTON_ENCUESTA_V3, PLANTILLA_REGALO_V3, CUERPO_REGALO_V3,
} from '../lib/visitas/encuesta/plantillas'

/** Qué crea cada valor de --create. Las cuatro comparten datos de ejemplo: mismas variables. */
const PEDIDOS = {
  encuesta: { tipo: 'encuesta', nombre: PLANTILLA_ENCUESTA_V1, cuerpo: CUERPO_ENCUESTA_V1, boton: BOTON_ENCUESTA_V1 },
  'encuesta-v2': { tipo: 'encuesta', nombre: PLANTILLA_ENCUESTA_V2, cuerpo: CUERPO_ENCUESTA_V2, boton: BOTON_ENCUESTA_V2 },
  'encuesta-v3': { tipo: 'encuesta', nombre: PLANTILLA_ENCUESTA_V3, cuerpo: CUERPO_ENCUESTA_V3, boton: BOTON_ENCUESTA_V3 },
  regalo: { tipo: 'regalo', nombre: PLANTILLA_REGALO_V1, cuerpo: CUERPO_REGALO_V1, boton: null },
  'regalo-v3': { tipo: 'regalo', nombre: PLANTILLA_REGALO_V3, cuerpo: CUERPO_REGALO_V3, boton: null },
} as const
// regalo_visita_v2 se sigue mostrando en el estado (Meta la aprobó como MARKETING): que se vea por qué no se usa.
const NOMBRES = new Set<string>([...Object.values(PEDIDOS).map(p => p.nombre), 'regalo_visita_v2'])

const API = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const TOKEN_EJEMPLO = 'Ab3xK9pQ2rTz8LmN4vWq1Y'

function env(nombre: string): string {
  const v = process.env[nombre]
  if (!v) throw new Error(`Falta ${nombre} en el entorno`)
  return v
}

function argumento(nombre: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${nombre}=`))
  return a ? a.slice(nombre.length + 3) : null
}

async function subirMuestra(url: string): Promise<string> {
  const appId = env('META_APP_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')
  let bytes: Buffer
  if (url.startsWith('https://')) {
    const archivo = await fetch(url)
    if (!archivo.ok) throw new Error(`No se pudo bajar la muestra (${archivo.status}): ${url}`)
    bytes = Buffer.from(await archivo.arrayBuffer())
  } else {
    bytes = await readFile(url)
  }
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error(`La muestra no es un PDF: ${url}`)
  const sesion = await fetch(
    `https://graph.facebook.com/${API}/${appId}/uploads?file_length=${bytes.length}&file_type=application%2Fpdf&access_token=${encodeURIComponent(token)}`,
    { method: 'POST' },
  )
  const sj = (await sesion.json()) as { id?: string; error?: unknown }
  if (!sesion.ok || !sj.id) throw new Error(`No se pudo abrir la subida: ${JSON.stringify(sj.error ?? sj)}`)
  const subida = await fetch(`https://graph.facebook.com/${API}/${sj.id}`, {
    method: 'POST',
    headers: { authorization: `OAuth ${token}`, file_offset: '0' },
    body: new Uint8Array(bytes),
  })
  const uj = (await subida.json()) as { h?: string; error?: unknown }
  if (!subida.ok || !uj.h) throw new Error(`No se pudieron subir los bytes: ${JSON.stringify(uj.error ?? uj)}`)
  return uj.h
}

async function estado(waba: string, token: string): Promise<Array<Record<string, string>>> {
  const r = await fetch(`https://graph.facebook.com/${API}/${waba}/message_templates?limit=200&fields=name,status,category,rejected_reason&access_token=${encodeURIComponent(token)}`)
  const j = (await r.json()) as { data?: Array<Record<string, string>>; error?: unknown }
  if (!r.ok || j.error) throw new Error(`Meta rechazó la consulta: ${JSON.stringify(j.error ?? j).slice(0, 300)}`)
  return (j.data ?? []).filter(t => NOMBRES.has(t.name))
}

async function crear(waba: string, token: string, cuerpo: Record<string, unknown>): Promise<void> {
  const r = await fetch(`https://graph.facebook.com/${API}/${waba}/message_templates?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
  })
  const j = (await r.json()) as Record<string, unknown>
  if (!r.ok || j.error) throw new Error(`Meta rechazó la creación: ${JSON.stringify(j.error ?? j)}`)
  console.log(`✅ ${String(cuerpo.name)} enviada a aprobación: ${JSON.stringify(j)}`)
}

async function main() {
  const waba = env('WHATSAPP_BUSINESS_ACCOUNT_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')
  const actuales = await estado(waba, token)
  console.log('Plantillas de la encuesta en la cuenta:')
  for (const t of actuales) {
    console.log(`  ${String(t.category).padEnd(9)} ${String(t.status).padEnd(9)} ${t.name}` +
      (t.rejected_reason && t.rejected_reason !== 'NONE' ? `  (${t.rejected_reason})` : ''))
    if (t.status === 'APPROVED' && t.category !== 'UTILITY') {
      console.log(`  ⚠️  ${t.name} quedó como ${t.category}: NO configurarla en Netlify (Meta retiene las de marketing).`)
    }
  }
  const pedido = argumento('create')
  if (!pedido) { console.log('\nSin --create: solo estado.'); return }
  if (!Object.hasOwn(PEDIDOS, pedido)) throw new Error(`--create tiene que ser uno de: ${Object.keys(PEDIDOS).join(', ')}`)
  const p = PEDIDOS[pedido as keyof typeof PEDIDOS]
  if (actuales.some(t => t.name === p.nombre)) { console.log(`\n"${p.nombre}" ya existe: no se vuelve a crear.`); return }

  if (p.tipo === 'encuesta' && p.boton) {
    await crear(waba, token, {
      name: p.nombre, language: IDIOMA_PLANTILLAS, category: 'UTILITY',
      components: [
        { type: 'BODY', text: p.cuerpo, example: { body_text: [['Mariana', 'Doblas 248', '14/10', TOKEN_EJEMPLO]] } },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: p.boton.texto, url: p.boton.url, example: [`https://inmodf.com.ar/encuesta/${TOKEN_EJEMPLO}`] }] },
      ],
    })
    return
  }
  const muestra = argumento('muestra')
  if (!muestra) throw new Error('Para la del regalo hace falta --muestra=<url o ruta de un PDF>')
  const handle = await subirMuestra(muestra)
  await crear(waba, token, {
    name: p.nombre, language: IDIOMA_PLANTILLAS, category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [handle] } },
      { type: 'BODY', text: p.cuerpo, example: { body_text: [['Mariana', 'Doblas 248']] } },
    ],
  })
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
