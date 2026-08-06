/**
 * Crea las TRES plantillas de respuesta a consultas de portales.
 *
 *   consulta_plano   → encabezado DOCUMENTO (el plano va en el primer mensaje)
 *   consulta_video   → encabezado VIDEO
 *   consulta_simple  → sin encabezado (la propiedad no tiene material)
 *
 * El cuerpo vive en `lib/leads/consulta-template.ts`, en UN solo lugar, para que
 * el texto que se aprueba y el que se manda no puedan divergir.
 *
 * ## Lo que hace falta saber para las de encabezado con archivo
 *
 * Meta no acepta una URL de ejemplo: pide un `header_handle`, que se obtiene
 * subiendo un archivo de muestra por la **Resumable Upload API** (dos pasos:
 * abrir una sesión y mandar los bytes). Ese handle es SOLO para la aprobación —
 * al mandar el mensaje real se pasa el link del plano o el video de esa
 * propiedad.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-templates-consulta.ts          # estado
 *   node --env-file=.env.local --import tsx scripts/create-whatsapp-templates-consulta.ts --create # crear
 */
import { CUERPO_CON_MATERIAL, CUERPO_SIN_MATERIAL } from '@/lib/leads/consulta-template'

const API = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const LANG = 'es_AR'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta ${name} en el entorno`)
  return v
}

/** Ejemplos que ve el revisor de Meta. Reales, de nuestras propias propiedades. */
const EJEMPLO_CON_MATERIAL = [['Martín', 'el plano', 'la casa de Lares de Canning, Tristán Suárez']]
const EJEMPLO_SIN_MATERIAL = [['Martín', 'la casa de Lares de Canning, Tristán Suárez']]

/**
 * Sube un archivo de muestra y devuelve el `header_handle`.
 *
 * Dos pasos, y el segundo NO es un multipart: son los bytes crudos con el
 * header `file_offset: 0`. Es la parte que más se equivoca al implementarla.
 */
async function subirMuestra(url: string, mime: string): Promise<string> {
  const appId = env('META_APP_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')

  const archivo = await fetch(url)
  if (!archivo.ok) throw new Error(`No se pudo bajar la muestra (${archivo.status}): ${url}`)
  const bytes = Buffer.from(await archivo.arrayBuffer())

  const sesion = await fetch(
    `https://graph.facebook.com/${API}/${appId}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(mime)}&access_token=${encodeURIComponent(token)}`,
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

interface Componente {
  type: string
  format?: string
  text?: string
  example?: Record<string, unknown>
}

async function crear(waba: string, token: string, nombre: string, componentes: Componente[]) {
  const res = await fetch(
    `https://graph.facebook.com/${API}/${waba}/message_templates?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nombre, language: LANG, category: 'UTILITY', components: componentes }),
    },
  )
  const j = (await res.json()) as Record<string, unknown>
  if (!res.ok || j.error) {
    console.log(`  ❌ ${nombre}: ${JSON.stringify(j.error ?? j)}`)
    return false
  }
  console.log(`  ✅ ${nombre} creada (${JSON.stringify(j)})`)
  return true
}

async function main() {
  const waba = env('WHATSAPP_BUSINESS_ACCOUNT_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')
  const create = process.argv.includes('--create')

  const res0 = await fetch(
    `https://graph.facebook.com/${API}/${waba}/message_templates?limit=100&fields=name,status,category,rejected_reason&access_token=${encodeURIComponent(token)}`,
  )
  const j0 = (await res0.json()) as { data?: Array<Record<string, string>> }
  const existentes = new Map((j0.data ?? []).map(t => [t.name, t]))

  console.log('Plantillas de consulta:')
  for (const n of ['consulta_plano', 'consulta_video', 'consulta_simple']) {
    const t = existentes.get(n)
    console.log(`  ${n.padEnd(18)} ${t ? `${t.category} / ${t.status}` : 'no existe'}`)
  }
  if (!create) {
    console.log('\nCorré con --create para crear las que falten.')
    return
  }

  // Muestras reales para la aprobación. Se buscan en la base para no inventar
  // URLs: si no hay ninguna propiedad con ese material, esa plantilla se saltea
  // (no se puede crear un encabezado de archivo sin un archivo de muestra).
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: conVideo } = await sb
    .from('properties').select('video_file_url').not('video_file_url', 'is', null).limit(1)
  const { data: conPlano } = await sb
    .from('properties').select('plans').not('plans', 'is', null).limit(1)

  const muestraVideo = (conVideo as Array<{ video_file_url: string }> | null)?.[0]?.video_file_url
  const muestraPlano = (conPlano as Array<{ plans: string[] }> | null)?.[0]?.plans?.[0]

  console.log('\nCreando…')

  if (!existentes.has('consulta_simple')) {
    await crear(waba, token, 'consulta_simple', [
      { type: 'BODY', text: CUERPO_SIN_MATERIAL, example: { body_text: EJEMPLO_SIN_MATERIAL } },
    ])
  }

  if (!existentes.has('consulta_video')) {
    if (!muestraVideo) {
      console.log('  ⏭  consulta_video: ninguna propiedad tiene video de archivo para usar de muestra.')
    } else {
      const handle = await subirMuestra(muestraVideo, 'video/mp4')
      await crear(waba, token, 'consulta_video', [
        { type: 'HEADER', format: 'VIDEO', example: { header_handle: [handle] } },
        { type: 'BODY', text: CUERPO_CON_MATERIAL, example: { body_text: EJEMPLO_CON_MATERIAL } },
      ])
    }
  }

  if (!existentes.has('consulta_plano')) {
    if (!muestraPlano) {
      console.log('  ⏭  consulta_plano: ninguna propiedad tiene plano cargado todavía.')
      console.log('     Cargá un plano desde la ficha de cualquier propiedad y volvé a correr esto.')
    } else {
      const handle = await subirMuestra(muestraPlano, 'application/pdf')
      await crear(waba, token, 'consulta_plano', [
        { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [handle] } },
        { type: 'BODY', text: CUERPO_CON_MATERIAL, example: { body_text: EJEMPLO_CON_MATERIAL } },
      ])
    }
  }

  console.log('\nQuedan PENDIENTES de aprobación. Volvé a correr sin --create para ver el estado.')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
