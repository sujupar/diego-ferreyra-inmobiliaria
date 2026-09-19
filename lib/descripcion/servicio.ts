/**
 * Servicio del generador de descripciones con el método de Diego: la parte con
 * IO (base, OpenAI, mapa). La lógica vive en los módulos puros de al lado.
 *
 * UNA etapa por llamada y UNA llamada de IA por etapa (regla dura del repo:
 * Netlify corta las funciones antes de los 60 s y devuelve HTML). El panel del
 * navegador encadena fotos → zona → [preguntas] → escribir.
 *
 * Lo que cuesta plata se guarda en `properties.descripcion_ia` con una firma:
 * regenerar una propiedad cuyas fotos y dirección no cambiaron solo paga la
 * escritura.
 */
import { createClient } from '@supabase/supabase-js'
import type { VisitDataSnapshot } from '@/types/visit-data.types'
import { respuestaOpenAI } from '@/lib/ai/openai-responses'
import { sanearRespuestasLanding } from '@/lib/supabase/visit-data-sanear'
import { geocodePropertyBestEffort } from '@/lib/properties/geocode-on-write'
import { faltanParaGenerar } from './requisitos'
import { firmaDireccion, firmaFotos } from './firmas'
import { juntarRespuestas, type PreguntaPendiente, type RespuestaConocida } from './respuestas'
import { buscarLugaresCercanos } from './zona-mapa'
import { ESQUEMA_INVENTARIO, INSTRUCCIONES_ZONA, PROMPT_FOTOS, entradaFotos, promptZonaWeb, validarInventario } from './prompts-investigacion'
import { limpiarTextoWeb } from './limpiar-web'
import { ESQUEMA_TEXTO, promptEscritura } from './metodo-diego'
import { armarEntradaEscritura } from './entradas'
import { controlarTexto } from './controles'
import { avisosDeCoherencia } from './coherencia'
import type { DescripcionIA, InventarioFotos, TextoGenerado, ZonaInvestigada } from './tipos'

/** Techo de cada etapa: por debajo del corte de Netlify, con margen para leer y escribir la base. */
export const TECHO_ETAPA_MS = 22_000
const TECHO_MAPA_MS = 14_000
/**
 * Ubicar la dirección va ANTES del mapa y la web (que corren en paralelo): con
 * hasta 3 intentos al geocodificador, sin techo total podía comerse el
 * presupuesto de la etapa. 5 s + 16 s de la web (el mapa, 14 s, corre en
 * paralelo con ella) < corte de Netlify. Ubicar suele tardar 1–2 s.
 */
const TECHO_GEOCODIFICAR_MS = 5_000
const TECHO_WEB_MS = 16_000
/**
 * Las fotos que se miran. Las primeras son la portada y el resto, el recorrido;
 * más de 30 alarga la lectura sin aportar ambientes nuevos (se mide con Doblas
 * 248, que tiene 48).
 */
export const MAX_FOTOS = 30
const MAX_NOTAS = 2000
const ANTERIORES_GUARDADAS = 3

const modeloFotos = () => process.env.DESCRIPCION_MODELO_FOTOS || 'gpt-4.1'
const modeloTexto = () => process.env.DESCRIPCION_MODELO_TEXTO || 'gpt-4.1'

/** Error con el status HTTP que corresponde y un mensaje para mostrar tal cual. */
export class ErrorDescripcion extends Error {
  constructor(mensaje: string, public status: number) {
    super(mensaje)
    this.name = 'ErrorDescripcion'
  }
}

function admin() {
  // Sin el genérico <Database>: los tipos generados no conocen `descripcion_ia`
  // ni `location_insights` (mismo criterio que lib/marketing/location-insights.ts).
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const COLUMNAS = [
  'id', 'address', 'neighborhood', 'city', 'property_type', 'operation_type', 'asking_price', 'currency',
  'expensas', 'rooms', 'bedrooms', 'bathrooms', 'garages', 'covered_area', 'total_area', 'floor', 'age',
  'amenities', 'photos', 'latitude', 'longitude', 'portal_data', 'landing_answers', 'title', 'description',
  'descripcion_ia',
].join(', ')

interface FilaPropiedad {
  id: string
  address: string
  neighborhood: string
  city: string | null
  property_type: string
  operation_type: string | null
  asking_price: number
  currency: string
  expensas: number | null
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  covered_area: number | null
  total_area: number | null
  floor: number | null
  age: number | null
  amenities: unknown
  photos: string[] | null
  latitude: number | null
  longitude: number | null
  portal_data: unknown
  landing_answers: unknown
  title: string | null
  description: string | null
  descripcion_ia: unknown
}

async function leerPropiedad(id: string): Promise<FilaPropiedad> {
  const { data, error } = await admin().from('properties').select(COLUMNAS).eq('id', id).maybeSingle()
  if (error) throw new Error(`No se pudo leer la propiedad: ${error.message}`)
  if (!data) throw new ErrorDescripcion('La propiedad no existe.', 404)
  return data as unknown as FilaPropiedad
}

function iaDe(fila: FilaPropiedad): DescripcionIA {
  return fila.descripcion_ia && typeof fila.descripcion_ia === 'object' && !Array.isArray(fila.descripcion_ia)
    ? (fila.descripcion_ia as DescripcionIA)
    : {}
}

/**
 * Mezcla un parche sobre lo que haya en la base AHORA (no sobre una copia
 * vieja): el panel corre las etapas una detrás de otra y cada una guarda lo suyo.
 */
async function guardarIA(id: string, parche: Partial<DescripcionIA>): Promise<DescripcionIA> {
  const { data, error: errLeer } = await admin().from('properties').select('descripcion_ia').eq('id', id).maybeSingle()
  if (errLeer) throw new Error(`No se pudo leer la caché: ${errLeer.message}`)
  const actual = (data as { descripcion_ia?: unknown } | null)?.descripcion_ia
  const nuevo: DescripcionIA = { ...(actual && typeof actual === 'object' ? (actual as DescripcionIA) : {}), ...parche }
  const { error } = await admin().from('properties').update({ descripcion_ia: nuevo }).eq('id', id)
  if (error) throw new Error(`No se pudo guardar la caché: ${error.message}`)
  return nuevo
}

interface ContextoExtra {
  visita: VisitDataSnapshot | null
  wizardState: unknown
  portalesPublicados: string[]
}

async function leerContextoExtra(id: string): Promise<ContextoExtra> {
  const db = admin()
  const [deals, landing, listings] = await Promise.all([
    db.from('deals').select('visit_data, updated_at').eq('property_id', id).order('updated_at', { ascending: false }).limit(5),
    db.from('property_landings').select('wizard_state').eq('property_id', id).maybeSingle(),
    db.from('property_listings').select('portal').eq('property_id', id).eq('status', 'published'),
  ])
  const visita = ((deals.data ?? []) as Array<{ visit_data: VisitDataSnapshot | null }>)
    .map(d => d.visit_data)
    .find((v): v is VisitDataSnapshot => !!v && typeof v === 'object') ?? null
  return {
    visita,
    wizardState: (landing.data as { wizard_state?: unknown } | null)?.wizard_state ?? null,
    portalesPublicados: ((listings.data ?? []) as Array<{ portal: string }>).map(l => l.portal),
  }
}

function fotosUsadas(fila: FilaPropiedad): string[] {
  return (Array.isArray(fila.photos) ? fila.photos : []).slice(0, MAX_FOTOS)
}

function respuestasDe(fila: FilaPropiedad, extra: ContextoExtra) {
  return juntarRespuestas({
    barrio: fila.neighborhood,
    landingAnswers: fila.landing_answers,
    visitaLanding: extra.visita?.landing ?? null,
    wizardState: extra.wizardState,
  })
}

function exigirRequisitos(fila: FilaPropiedad) {
  const faltan = faltanParaGenerar(fila)
  if (faltan.length) throw new ErrorDescripcion(`Falta: ${faltan.join(', ')}.`, 409)
}

// ───────────────────────────── Estado ─────────────────────────────

export interface EstadoDescripcion {
  faltan: string[]
  cantidadFotos: number
  pendientes: PreguntaPendiente[]
  conocidas: RespuestaConocida[]
  fotosListas: boolean
  zonaLista: boolean
  compradorSugerido: string | null
  notas: string | null
  portalesPublicados: string[]
  tieneDescripcion: boolean
}

export async function estadoDescripcion(id: string): Promise<EstadoDescripcion> {
  const fila = await leerPropiedad(id)
  const extra = await leerContextoExtra(id)
  const ia = iaDe(fila)
  const { conocidas, pendientes } = respuestasDe(fila, extra)
  return {
    faltan: faltanParaGenerar(fila),
    cantidadFotos: Array.isArray(fila.photos) ? fila.photos.length : 0,
    pendientes,
    conocidas,
    fotosListas: !!ia.fotos && ia.fotos.firma === firmaFotos(fotosUsadas(fila)),
    zonaLista: !!ia.zona && ia.zona.completa === true && ia.zona.firma === firmaDireccion(fila),
    compradorSugerido: ia.fotos?.inventario?.compradorSugerido?.perfil || null,
    notas: ia.notas ?? null,
    portalesPublicados: extra.portalesPublicados,
    tieneDescripcion: !!fila.description?.trim(),
  }
}

// ───────────────────────────── Paso 1: fotos ─────────────────────────────

export async function ejecutarEtapaFotos(id: string, o: { forzar?: boolean } = {}): Promise<{ reusada: boolean; inventario: InventarioFotos; cantidad: number }> {
  const fila = await leerPropiedad(id)
  exigirRequisitos(fila)
  const urls = fotosUsadas(fila)
  const firma = firmaFotos(urls)
  const ia = iaDe(fila)

  if (!o.forzar && ia.fotos?.firma === firma) {
    const cacheado = validarInventario(ia.fotos.inventario)
    if (cacheado) return { reusada: true, inventario: cacheado, cantidad: urls.length }
  }

  const r = await respuestaOpenAI({
    modelo: modeloFotos(),
    instrucciones: PROMPT_FOTOS,
    entrada: entradaFotos(urls),
    esquema: { nombre: 'inventario_fotos', schema: ESQUEMA_INVENTARIO },
    temperatura: 0.3,
    timeoutMs: TECHO_ETAPA_MS,
  })
  let json: unknown
  try { json = JSON.parse(r.texto) } catch { json = null }
  const inventario = validarInventario(json)
  if (!inventario) throw new ErrorDescripcion('El análisis de las fotos devolvió algo ilegible. Probá de nuevo.', 502)

  await guardarIA(id, { fotos: { firma, cantidad: urls.length, inventario, en: new Date().toISOString() } })
  return { reusada: false, inventario, cantidad: urls.length }
}

// ───────────────────────────── Paso 2: zona ─────────────────────────────

async function coordenadas(fila: FilaPropiedad): Promise<{ lat: number; lng: number } | null> {
  if (fila.latitude != null && fila.longitude != null) return { lat: fila.latitude, lng: fila.longitude }
  // Mismo geocodificador que el alta: solo escribe si la propiedad NO tenía pin.
  // Si no termina a tiempo se sigue sin coordenadas (texto sin distancias); si
  // termina después, igual deja el pin guardado para la próxima vez.
  await Promise.race([
    geocodePropertyBestEffort(fila.id),
    new Promise<void>(resolver => setTimeout(resolver, TECHO_GEOCODIFICAR_MS)),
  ])
  const { data } = await admin().from('properties').select('latitude, longitude').eq('id', fila.id).maybeSingle()
  const c = data as { latitude: number | null; longitude: number | null } | null
  return c?.latitude != null && c?.longitude != null ? { lat: c.latitude, lng: c.longitude } : null
}

export async function ejecutarEtapaZona(id: string, o: { forzar?: boolean } = {}): Promise<{ reusada: boolean; zona: ZonaInvestigada; avisos: string[] }> {
  const fila = await leerPropiedad(id)
  exigirRequisitos(fila)
  const firma = firmaDireccion(fila)
  const ia = iaDe(fila)
  if (!o.forzar && ia.zona?.firma === firma && ia.zona.completa) {
    return { reusada: true, zona: ia.zona.datos, avisos: [] }
  }

  const punto = await coordenadas(fila)
  const [mapa, web] = await Promise.allSettled([
    punto ? buscarLugaresCercanos(punto.lat, punto.lng, AbortSignal.timeout(TECHO_MAPA_MS)) : Promise.resolve(null),
    respuestaOpenAI({
      modelo: modeloTexto(),
      instrucciones: INSTRUCCIONES_ZONA,
      entrada: [{ tipo: 'texto', texto: promptZonaWeb(fila) }],
      webSearch: true,
      temperatura: 0.2,
      timeoutMs: TECHO_WEB_MS,
    }),
  ])

  const delMapa = mapa.status === 'fulfilled' ? mapa.value : null
  const textoWeb = web.status === 'fulfilled' ? limpiarTextoWeb(web.value.texto) : null
  if (web.status === 'rejected') console.warn('[descripcion/zona] búsqueda web falló:', web.reason)
  if (delMapa === null && !textoWeb) {
    throw new ErrorDescripcion('No se pudo investigar la zona (ni el mapa ni la web respondieron). Probá de nuevo.', 502)
  }

  const zona: ZonaInvestigada = { mapa: delMapa, web: textoWeb || null }
  const avisos: string[] = []
  if (!punto) avisos.push('No se pudo ubicar la dirección en el mapa: el texto sale sin distancias.')
  else if (delMapa === null) avisos.push('El mapa no respondió: el texto sale sin distancias ni colectivos.')
  if (!textoWeb) avisos.push('La búsqueda web no respondió: el texto no nombra comercios ni lugares del barrio.')

  // Se guarda aunque sea parcial (la escritura la lee de acá), marcada como
  // incompleta para que el próximo "Generar" la vuelva a intentar.
  await guardarIA(id, { zona: { firma, datos: zona, en: new Date().toISOString(), completa: avisos.length === 0 } })
  return { reusada: false, zona, avisos }
}

// ───────────────────────────── Paso 3: escribir ─────────────────────────────

export interface ResultadoEscritura {
  texto: TextoGenerado
  usado: { comprador: string | null; respuestas: RespuestaConocida[]; inventario: InventarioFotos | null; zona: ZonaInvestigada | null; notas: string | null }
  /** Controles del texto que no se pudieron corregir (el panel pide una corrección). */
  problemas: string[]
  /** Para el asesor: fotos que no coinciden con la ficha, etc. No bloquean. */
  avisos: string[]
}

/**
 * Las respuestas nuevas del panel van a `properties.landing_answers`, el MISMO
 * lugar donde las deja la visita: así no se vuelven a preguntar ni acá ni al
 * crear la landing. Solo se completan claves vacías: nunca se pisa lo que se
 * contestó en la visita.
 */
async function guardarRespuestasNuevas(fila: FilaPropiedad, nuevas: Record<string, string> | undefined): Promise<unknown> {
  const limpias = sanearRespuestasLanding(nuevas ?? {})
  const actuales = sanearRespuestasLanding(fila.landing_answers)
  const agregar = Object.fromEntries(
    Object.entries(limpias).filter(([k]) => /^q[1-4]$/.test(k) && !actuales[k]),
  )
  if (!Object.keys(agregar).length) return fila.landing_answers
  const mezcla = { ...actuales, ...agregar }
  const { error } = await admin().from('properties').update({ landing_answers: mezcla }).eq('id', fila.id)
  if (error) throw new Error(`No se pudieron guardar las respuestas: ${error.message}`)
  return mezcla
}

export async function ejecutarEtapaEscribir(id: string, o: {
  respuestas?: Record<string, string>
  notas?: string | null
  comprador?: string | null
  /** Problemas del intento anterior: el panel pide UNA corrección con esto. */
  corregir?: string[]
} = {}): Promise<ResultadoEscritura> {
  const fila = await leerPropiedad(id)
  exigirRequisitos(fila)
  const extra = await leerContextoExtra(id)
  let ia = iaDe(fila)

  const inventario = ia.fotos ? validarInventario(ia.fotos.inventario) : null
  if (!inventario) throw new ErrorDescripcion('Falta el análisis de las fotos: volvé a generar desde el principio.', 409)

  fila.landing_answers = await guardarRespuestasNuevas(fila, o.respuestas)
  if (o.notas !== undefined) {
    const notas = (o.notas ?? '').trim().slice(0, MAX_NOTAS) || null
    ia = await guardarIA(id, { notas })
  }

  const { conocidas } = respuestasDe(fila, extra)
  const comprador = o.comprador?.trim()
    || conocidas.find(c => c.tema === 'comprador')?.respuesta
    || inventario.compradorSugerido.perfil
    || null
  const zona = ia.zona?.datos ?? null

  let entrada = armarEntradaEscritura({
    propiedad: fila,
    visita: extra.visita?.sale ?? null,
    portalData: fila.portal_data,
    respuestas: conocidas,
    inventario,
    zona,
    comprador,
    notas: ia.notas ?? null,
  })
  if (o.corregir?.length) {
    entrada += `\n\n# CORRECCIÓN\nEl intento anterior tuvo estos problemas; esta vez evitalos:\n${o.corregir.map(p => `- ${p}`).join('\n')}`
  }

  const r = await respuestaOpenAI({
    modelo: modeloTexto(),
    instrucciones: promptEscritura(),
    entrada: [{ tipo: 'texto', texto: entrada }],
    esquema: { nombre: 'descripcion', schema: ESQUEMA_TEXTO },
    temperatura: 0.6,
    timeoutMs: TECHO_ETAPA_MS,
  })
  let json: Partial<TextoGenerado> | null = null
  try { json = JSON.parse(r.texto) as Partial<TextoGenerado> } catch { json = null }
  if (!json || typeof json.title !== 'string' || typeof json.subtitle !== 'string' || typeof json.body !== 'string') {
    throw new ErrorDescripcion('La escritura devolvió algo ilegible. Probá de nuevo.', 502)
  }
  const { texto, problemas } = controlarTexto({ title: json.title, subtitle: json.subtitle, body: json.body }, fila)
  return {
    texto,
    usado: { comprador, respuestas: conocidas, inventario, zona, notas: ia.notas ?? null },
    problemas,
    avisos: avisosDeCoherencia(inventario, fila),
  }
}

// ───────────────────────────── Guardar ─────────────────────────────

/**
 * Escribe titular y descripción. Si la propiedad está publicada, el trigger
 * `trg_requeue_listings_on_update` marca los avisos y el worker actualiza los
 * portales solo: es lo buscado (la pantalla lo avisa antes de guardar).
 */
export async function guardarDescripcion(id: string, t: TextoGenerado): Promise<void> {
  const fila = await leerPropiedad(id)
  const ia = iaDe(fila)
  const { texto } = controlarTexto(t)
  const anteriores = (fila.title?.trim() || fila.description?.trim())
    ? [{ title: fila.title, description: fila.description, reemplazadaEn: new Date().toISOString() }, ...(ia.anteriores ?? [])]
    : (ia.anteriores ?? [])
  const { error } = await admin().from('properties').update({
    title: texto.title,
    description: `${texto.subtitle}\n\n${texto.body}`,
    descripcion_ia: { ...ia, anteriores: anteriores.slice(0, ANTERIORES_GUARDADAS) },
  }).eq('id', id)
  if (error) throw new Error(`No se pudo guardar la descripción: ${error.message}`)
}
