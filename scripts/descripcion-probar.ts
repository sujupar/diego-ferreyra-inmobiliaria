/**
 * Corre el método de Diego completo sobre una propiedad REAL y NO GUARDA NADA:
 * ni la descripción, ni la caché, ni las coordenadas. Sirve para medir los
 * tiempos de cada etapa contra el límite de Netlify y para auditar el texto
 * frase por frase antes de que lo vea nadie.
 *
 * Correr:
 *   node --env-file=.env.local --import tsx scripts/descripcion-probar.ts <propertyId|prefijo> [--comprador "…"] [--notas "…"]
 *
 * Arma la entrada con los MISMOS módulos que el servicio (`lib/descripcion/*`);
 * lo único que repite es la lectura de la base, sin escribir.
 */
import { createClient } from '@supabase/supabase-js'
import type { VisitDataSnapshot } from '@/types/visit-data.types'
import { respuestaOpenAI } from '@/lib/ai/openai-responses'
import { parseAddress, buildGeocodeQuery, deriveProvince } from '@/lib/properties/address'
import { geocodeAddress } from '@/lib/properties/geocoder'
import { faltanParaGenerar } from '@/lib/descripcion/requisitos'
import { juntarRespuestas } from '@/lib/descripcion/respuestas'
import { buscarLugaresCercanos, lineasATexto } from '@/lib/descripcion/zona-mapa'
import { ESQUEMA_INVENTARIO, INSTRUCCIONES_ZONA, PROMPT_FOTOS, entradaFotos, promptZonaWeb, validarInventario } from '@/lib/descripcion/prompts-investigacion'
import { limpiarTextoWeb } from '@/lib/descripcion/limpiar-web'
import { ESQUEMA_TEXTO, promptEscritura } from '@/lib/descripcion/metodo-diego'
import { armarEntradaEscritura } from '@/lib/descripcion/entradas'
import { controlarTexto } from '@/lib/descripcion/controles'
import { MAX_FOTOS, TECHO_ETAPA_MS } from '@/lib/descripcion/servicio'
import type { ZonaInvestigada } from '@/lib/descripcion/tipos'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const MODELO_FOTOS = process.env.DESCRIPCION_MODELO_FOTOS || 'gpt-4.1'
const MODELO_TEXTO = process.env.DESCRIPCION_MODELO_TEXTO || 'gpt-4.1'

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre)
  return i > 0 ? process.argv[i + 1] ?? null : null
}

async function medir<T>(etiqueta: string, f: () => Promise<T>): Promise<T> {
  const t = Date.now()
  const r = await f()
  const s = (Date.now() - t) / 1000
  console.log(`\n⏱  ${etiqueta}: ${s.toFixed(1)} s ${s > 20 ? '⚠️  (más de 20 s)' : ''}`)
  return r
}

async function main() {
  const clave = process.argv[2]
  if (!clave) throw new Error('Pasá el id (o el prefijo) de la propiedad')
  const { data: todas } = await db.from('properties').select('id').order('created_at', { ascending: false })
  const id = (todas ?? []).map(p => p.id as string).find(x => x.startsWith(clave))
  if (!id) throw new Error(`No encontré la propiedad ${clave}`)

  const { data: p } = await db.from('properties').select('*').eq('id', id).single()
  const { data: deals } = await db.from('deals').select('visit_data').eq('property_id', id).order('updated_at', { ascending: false }).limit(5)
  const { data: landing } = await db.from('property_landings').select('wizard_state').eq('property_id', id).maybeSingle()
  const visita = ((deals ?? []) as Array<{ visit_data: VisitDataSnapshot | null }>).map(d => d.visit_data).find(Boolean) ?? null

  console.log(`\n═══ ${p.address} (${p.neighborhood}) — ${p.property_type} — ${id}`)
  const faltan = faltanParaGenerar(p)
  if (faltan.length) throw new Error(`Falta: ${faltan.join(', ')}`)

  const { conocidas, pendientes } = juntarRespuestas({
    barrio: p.neighborhood, landingAnswers: p.landing_answers,
    visitaLanding: visita?.landing ?? null, wizardState: landing?.wizard_state ?? null,
  })
  console.log(`\nRespuestas conocidas: ${conocidas.length} · preguntas que el panel haría: ${pendientes.map(x => x.id).join(', ') || 'ninguna'}`)
  for (const c of conocidas) console.log(`  [${c.fuente}/${c.tema}] ${c.pregunta} → ${c.respuesta}`)

  // Paso 1 — fotos
  const urls = (p.photos as string[]).slice(0, MAX_FOTOS)
  const fotos = await medir(`Paso 1 — fotos (${urls.length} de ${p.photos.length})`, () => respuestaOpenAI({
    modelo: MODELO_FOTOS, instrucciones: PROMPT_FOTOS, entrada: entradaFotos(urls),
    esquema: { nombre: 'inventario_fotos', schema: ESQUEMA_INVENTARIO }, temperatura: 0.3, timeoutMs: TECHO_ETAPA_MS,
  }))
  const inventario = validarInventario(JSON.parse(fotos.texto))
  if (!inventario) throw new Error('inventario ilegible')
  console.log(`   tokens: ${JSON.stringify(fotos.uso)}`)
  console.log(JSON.stringify(inventario, null, 1))

  // Paso 2 — zona (geocodifica SIN guardar)
  const zona = await medir('Paso 2 — zona (mapa + web en paralelo)', async (): Promise<ZonaInvestigada> => {
    let punto = p.latitude != null ? { lat: p.latitude as number, lng: p.longitude as number } : null
    if (!punto) {
      const province = p.province ?? deriveProvince({ address: p.address, city: p.city }) ?? null
      const parts = parseAddress(p.address, { neighborhood: p.neighborhood, city: p.city, province })
      const g = await geocodeAddress(buildGeocodeQuery(parts), {
        province: parts.province, locality: parts.isCaba ? parts.neighborhood : parts.locality, number: parts.number, isCaba: parts.isCaba,
      })
      console.log(`   geocodificada: ${g ? `${g.lat}, ${g.lng} (${g.confidence})` : 'NO SE PUDO'}`)
      punto = g ? { lat: g.lat, lng: g.lng } : null
    }
    const [mapa, web] = await Promise.allSettled([
      punto ? buscarLugaresCercanos(punto.lat, punto.lng, AbortSignal.timeout(10_000)) : Promise.resolve(null),
      respuestaOpenAI({ modelo: MODELO_TEXTO, instrucciones: INSTRUCCIONES_ZONA, entrada: [{ tipo: 'texto', texto: promptZonaWeb(p) }], webSearch: true, temperatura: 0.2, timeoutMs: 16_000 }),
    ])
    const delMapa = mapa.status === 'fulfilled' ? mapa.value : null
    const textoWeb = web.status === 'fulfilled' ? limpiarTextoWeb(web.value.texto) : null
    if (web.status === 'rejected') console.log('   WEB FALLÓ:', web.reason)
    return { mapa: delMapa, web: textoWeb }
  })
  console.log(`\nMAPA:\n${zona.mapa ? `${lineasATexto(zona.mapa.lugares)}\nColectivos: ${(zona.mapa.colectivos ?? []).join(', ')}` : '(sin mapa)'}\n\nWEB:\n${zona.web ?? '(sin web)'}`)

  // Paso 3 — escribir
  const comprador = arg('--comprador') || conocidas.find(c => c.tema === 'comprador')?.respuesta || inventario.compradorSugerido.perfil
  const entrada = armarEntradaEscritura({
    propiedad: p, visita: visita?.sale ?? null, portalData: p.portal_data, respuestas: conocidas,
    inventario, zona, comprador, notas: arg('--notas'),
  })
  console.log(`\n──── ENTRADA DEL PASO 3 ────\n${entrada}`)
  const escrito = await medir('Paso 3 — escribir', () => respuestaOpenAI({
    modelo: MODELO_TEXTO, instrucciones: promptEscritura(), entrada: [{ tipo: 'texto', texto: entrada }],
    esquema: { nombre: 'descripcion', schema: ESQUEMA_TEXTO }, temperatura: 0.6, timeoutMs: TECHO_ETAPA_MS,
  }))
  console.log(`   tokens: ${JSON.stringify(escrito.uso)}`)
  const { texto, problemas } = controlarTexto(JSON.parse(escrito.texto))
  console.log(`\n──── RESULTADO ────\nTITULAR: ${texto.title}\nSUBTITULAR: ${texto.subtitle}\n\n${texto.body}`)
  console.log(`\nPROBLEMAS DE CONTROL: ${problemas.length ? problemas.join(' | ') : 'ninguno'}`)
  console.log(`\n(Nada se guardó en la base.)`)
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
