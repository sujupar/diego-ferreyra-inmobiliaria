/**
 * Plantillas del primer WhatsApp CON VIDEO a quien pide una tasación (change OpenSpec
 * `tasacion-video-bienvenida`, design.md D1). Son dos, y se piden las dos a la vez:
 *
 *   - `tasacion_video_caso_v1`  (la elegida por el dueño): cuenta el caso de los USD 16.606.
 *   - `tasacion_video_sobria_v1` (respaldo): mismo esqueleto, sin cifras.
 *
 * Las dos se piden como UTILITY. Meta decide la categoría al aprobar, y en esta cuenta ya
 * reclasificó a MARKETING plantillas con vocabulario de venta (CLAUDE.md, § "Meta reclasifica
 * la plantilla a MARKETING por el vocabulario"). Un mensaje de marketing tiene tope por persona y
 * puede no llegar: por eso la regla es
 *   la del caso si quedó UTILITY → si no, la sobria si quedó UTILITY → si no, tasacion_llamada_v1.
 * Este script, sin flags, la aplica y dice cuál poner en WHATSAPP_TEMPLATE_TASACION.
 *
 * Los textos salen de `lib/video-bienvenida/cuerpos.ts` (un test compara lo pedido con lo
 * aprobado cuando se sincroniza). Botón URL "Ver el video" → https://inmodf.com.ar/t/{{1}}, con
 * el código; el enlace completo va también en el cuerpo porque en WhatsApp de computadora el
 * botón no abre nada.
 *
 * Uso:
 *   node --env-file=<.env.local> --import tsx scripts/create-whatsapp-template-tasacion-video.ts           # estado y recomendación
 *   node --env-file=<.env.local> --import tsx scripts/create-whatsapp-template-tasacion-video.ts --create  # pedir las que falten
 *
 * Meta puede reclasificar DESPUÉS de aprobar: volver a correrlo sin flags una semana después.
 */
import { CUERPOS_PEDIDOS, TEXTO_DEL_BOTON, URL_DEL_BOTON } from '../lib/video-bienvenida/cuerpos'

const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const LANGUAGE = 'es_AR'
const ORDEN = ['tasacion_video_caso_v1', 'tasacion_video_sobria_v1'] as const
const SIN_VIDEO = 'tasacion_llamada_v1'
const CODIGO_EJEMPLO = 'k7Hq2mXb9T'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta ${name} en el entorno`)
  return v
}

interface Plantilla { name: string; status: string; category: string; rejected_reason?: string }

async function leerEstado(waba: string, token: string): Promise<Map<string, Plantilla>> {
  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${waba}/message_templates?limit=200&fields=name,status,category,rejected_reason&access_token=${encodeURIComponent(token)}`,
  )
  const j = (await res.json()) as { data?: Plantilla[]; error?: unknown }
  if (!res.ok || j.error) throw new Error(`Meta no devolvió las plantillas: ${JSON.stringify(j.error ?? j)}`)
  return new Map((j.data ?? []).filter((t) => (ORDEN as readonly string[]).includes(t.name)).map((t) => [t.name, t]))
}

function recomendar(estado: Map<string, Plantilla>): string {
  for (const n of ORDEN) {
    const t = estado.get(n)
    if (t && t.status === 'APPROVED' && t.category === 'UTILITY') return n
  }
  return SIN_VIDEO
}

async function crear(waba: string, token: string, nombre: (typeof ORDEN)[number]) {
  const payload = {
    name: nombre,
    language: LANGUAGE,
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: CUERPOS_PEDIDOS[nombre],
        example: { body_text: [['Ana', `https://inmodf.com.ar/t/${CODIGO_EJEMPLO}`]] },
      },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: TEXTO_DEL_BOTON, url: URL_DEL_BOTON, example: [`https://inmodf.com.ar/t/${CODIGO_EJEMPLO}`] }],
      },
    ],
  }
  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${waba}/message_templates?access_token=${encodeURIComponent(token)}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
  )
  const j = (await res.json()) as Record<string, unknown>
  if (!res.ok || j.error) {
    console.log(`❌ Meta rechazó la creación de ${nombre}:`)
    console.log(JSON.stringify(j.error ?? j, null, 2))
    return false
  }
  console.log(`✅ ${nombre} pedida: ${JSON.stringify(j)}`)
  return true
}

async function main() {
  const waba = env('WHATSAPP_BUSINESS_ACCOUNT_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')

  if (process.argv.includes('--create')) {
    const antes = await leerEstado(waba, token)
    let ok = true
    for (const n of ORDEN) {
      if (antes.has(n)) console.log(`"${n}" ya existe → ${antes.get(n)!.category} / ${antes.get(n)!.status}`)
      else ok = (await crear(waba, token, n)) && ok
    }
    if (!ok) process.exit(1)
    console.log('\nQuedan PENDIENTES de aprobación de Meta (de minutos a unas horas).')
  }

  const estado = await leerEstado(waba, token)
  console.log('\nEstado en Meta:')
  for (const n of ORDEN) {
    const t = estado.get(n)
    if (!t) { console.log(`  ${n}: no existe`); continue }
    const motivo = t.rejected_reason && t.rejected_reason !== 'NONE' ? ` · motivo: ${t.rejected_reason}` : ''
    const aviso = t.category !== 'UTILITY' ? '  ⚠️ fuera de UTILITY: puede no entregarse' : ''
    console.log(`  ${n}: ${t.category} / ${t.status}${motivo}${aviso}`)
  }
  const usar = recomendar(estado)
  console.log(`\nPara WHATSAPP_TEMPLATE_TASACION corresponde: ${usar}`)
  if (usar !== SIN_VIDEO) {
    console.log('Antes de ponerla en Netlify:')
    console.log('  1. scripts/sincronizar-cuerpos-plantillas.ts (y commitear cuerpos-aprobados.ts + deployar)')
    console.log('  2. CAMBIO_DESDE en lib/metrics/panel/video-bienvenida.ts con la fecha de activación')
  }
}

main().catch((e) => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
